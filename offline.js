// Install prompt, offline badge and "Save map offline" (pre-fetches Kraków's vector tiles so the
// service worker can serve them without signal).
const OFM = "https://tiles.openfreemap.org";
const SAVE_BBOX = { s: 49.96, w: 19.78, n: 50.14, e: 20.23 };
const SAVE_ZOOMS = [10, 11, 12, 13, 14];
const FONTSTACKS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installEvent = null, saving = null;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; updateOfflineUI(); });
addEventListener("appinstalled", () => { installEvent = null; updateOfflineUI(); });
addEventListener("online", updateOfflineUI);
addEventListener("offline", updateOfflineUI);

$("installBtn").onclick = async () => {
  if (installEvent) {
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    updateOfflineUI();
  } else if (isIOS) toast(t("installIos"), 5000);
};
$("saveMapBtn").onclick = () => saveMap(false);

function updateOfflineUI() {
  $("offlinePill").hidden = navigator.onLine;
  $("installBtn").hidden = standalone || !(installEvent || isIOS);
  $("installBtn").textContent = t("install");
  const btn = $("saveMapBtn");
  btn.disabled = !!saving || !navigator.onLine;
  if (saving) btn.textContent = t("savingMap", { p: saving.pct });
  else btn.textContent = store.get("mapSaved", null) ? t("mapSavedBtn") : t("saveMap");
  btn.setAttribute("aria-pressed", !!store.get("mapSaved", null));
}

function tileRange(z) {
  const n = 2 ** z;
  const x = lng => Math.floor((lng + 180) / 360 * n);
  const y = lat => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  const out = [];
  for (let tx = x(SAVE_BBOX.w); tx <= x(SAVE_BBOX.e); tx++)
    for (let ty = y(SAVE_BBOX.n); ty <= y(SAVE_BBOX.s); ty++) out.push([z, tx, ty]);
  return out;
}

async function saveMap(quiet) {
  if (saving || !navigator.onLine || !("serviceWorker" in navigator)) return;
  saving = { pct: 0 };
  updateOfflineUI();
  try {
    await navigator.serviceWorker.ready;
    const tilejson = await (await fetch(`${OFM}/planet`)).json();
    const style = await (await fetch(`${OFM}/styles/positron`)).json();
    await fetch(`${OFM}/styles/dark`);
    const urls = [];
    for (const z of SAVE_ZOOMS) for (const [tz, tx, ty] of tileRange(z)) urls.push(tilejson.tiles[0].replace("{z}", tz).replace("{x}", tx).replace("{y}", ty));
    for (const f of FONTSTACKS) for (const r of GLYPH_RANGES) urls.push(style.glyphs.replace("{fontstack}", encodeURIComponent(f)).replace("{range}", r));
    for (const sfx of [".json", ".png", "@2x.json", "@2x.png"]) urls.push(style.sprite + sfx);
    let done = 0, failed = 0;
    const queue = urls.slice();
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift();
        try { const r = await fetch(u); if (!r.ok) failed++; } catch { failed++; }
        done++;
        const pct = Math.round(done / urls.length * 100);
        if (pct !== saving.pct) { saving.pct = pct; updateOfflineUI(); }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (failed > urls.length * 0.1) throw new Error("too many failures");
    store.set("mapSaved", new Date().toISOString());
    if (!quiet) toast(t("mapSaved"));
  } catch {
    if (!quiet) toast(t("mapSaveFail"));
  } finally {
    saving = null;
    updateOfflineUI();
  }
}

updateOfflineUI();
// Installed app: save the map once in the background so it works in basements from day one
if (standalone && !store.get("mapSaved", null)) setTimeout(() => saveMap(true), 4000);
