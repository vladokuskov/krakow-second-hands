const CAT_VARS = { lump: "--c-lump", sh: "--c-sh", vin: "--c-vin", char: "--c-char", flea: "--c-flea" };
const MAX_STOPS = 10;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const short = a => a.replace(/, Poland$/, "").replace(/, \d{2}-\d{3} Kraków$/, "");
const gmaps = s => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.name + " " + s.address) + "&query_place_id=" + s.place_id;
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const fmtKm = d => d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km";
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const store = {
  get(k, d) { try { const v = localStorage.getItem("ksh." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ksh." + k, JSON.stringify(v)); } catch {} },
};

// ---- state
let lang = store.get("lang", navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en");
const on = Object.fromEntries(Object.keys(CAT_VARS).map(k => [k, true]));
let openOnly = false, savedOnly = false;
const wantTags = new Set();
const saved = new Set(store.get("saved", []));
let route = store.get("route", []);
let mode = store.get("mode", "walking");
const myDel = store.get("delivery", {});
let SHOPS = [], byId = {}, markers = {}, active = null, me = null, meMarker = null, visibleKey = "";

const T = () => STRINGS[lang];
const t = (k, vars = {}) => String(T()[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v]);
const catLabel = c => T().cats[c][0];
const TAGS = ["byweight", "men", "kids", "shoes", "home", "designer", "books"];
const tagLabel = k => T().tags[k];
const reviewsText = n => {
  if (lang === "pl") return `${n} ${n === 1 ? "opinia" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "opinie" : "opinii"}`;
  return `${n} ${n === 1 ? "review" : "reviews"}`;
};
const stopsTitle = n => {
  if (n === 1) return t("routeTitle1");
  if (lang === "pl") return `Trasa · ${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "sklepy" : "sklepów"}`;
  return t("routeTitle", { n });
};

["sort", "minr", "mode"].forEach(id => enhanceSelect($(id)));

// ---- map
const map = L.map("map", { minZoom: 11, maxZoom: 19 }).setView([50.0614, 19.9366], 12);
// Minimal basemap: OpenFreeMap Positron (light) or Dark, following the system theme.
// Rail, shields, airports and boundaries are hidden; the dark style is repainted in the panel's navy.
const HIDE = /^(railway|aeroway|airport|boundary|highway-shield|road_shield|road_oneway|highway-name-path|highway_path|highway_name_motorway|label_country|label_state|place_state|place_country)/;
const DARK_PAINT = {
  background: { "background-color": "#141824" },
  landuse_residential: { "fill-color": "#171c29" },
  landcover_wood: { "fill-color": "#172420" },
  landuse_park: { "fill-color": "#172420" },
  water: { "fill-color": "#1e3052" },
  waterway: { "line-color": "#1e3052" },
  building: { "fill-color": "#1a1f2d", "fill-outline-color": "#202637" },
  highway_minor: { "line-color": "#202637" },
  highway_major_casing: { "line-color": "#2c3447" },
  highway_major_inner: { "line-color": "#232a3b" },
  highway_major_subtle: { "line-color": "#283043" },
  highway_motorway_casing: { "line-color": "#3a4360" },
  highway_motorway_inner: { "line-color": "#2c3449" },
  highway_motorway_subtle: { "line-color": "#283043" },
  water_name: { "text-color": "#5a74a8", "text-halo-color": "#141824" },
  highway_name_other: { "text-color": "#6c7489", "text-halo-color": "#141824" },
  ...Object.fromEntries(["place_other", "place_suburb", "place_village", "place_town", "place_city", "place_city_large"]
    .map(id => [id, { "text-color": "#8a92a8", "text-halo-color": "#141824" }])),
};
const dark = matchMedia("(prefers-color-scheme: dark)");
const styleUrl = isDark => `https://tiles.openfreemap.org/styles/${isDark ? "dark" : "positron"}`;
const basemap = L.maplibreGL({
  style: styleUrl(dark.matches),
  attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · places: Google Maps',
}).addTo(map);
const gl = basemap.getMaplibreMap();
gl.on("style.load", () => gl.getStyle().layers.forEach(l => {
  if (HIDE.test(l.id)) return gl.setLayoutProperty(l.id, "visibility", "none");
  if (dark.matches && DARK_PAINT[l.id]) Object.entries(DARK_PAINT[l.id]).forEach(([k, v]) => gl.setPaintProperty(l.id, k, v));
}));
dark.addEventListener("change", e => { gl.setStyle(styleUrl(e.matches), { diff: false }); drawRoute(); });

new ResizeObserver(() => { map.invalidateSize(); gl.resize(); }).observe($("map"));

// The phone sheet covers the bottom of the map: frame things in the part you can see
const mapPad = () => ({ paddingTopLeft: [20, 20 + sheet.safeTop()], paddingBottomRight: [20, 20 + sheet.cover()] });
function viewAt(latlng, zoom) {
  const p = map.project(latlng, zoom).add([0, sheet.cover() / 2]);
  map.setView(map.unproject(p, zoom), zoom, { animate: !reduceMotion });
}
map.on("popupopen", () => sheet.set("peek"));
map.on("dragstart", () => { if (sheet.state === "half") sheet.set("peek"); });

const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 38,
  disableClusteringAtZoom: 16,
  spiderfyOnMaxZoom: false,
  iconCreateFunction: c => {
    const n = c.getChildCount(), size = n < 10 ? 30 : n < 30 ? 36 : 42;
    return L.divIcon({ className: "", html: `<div class="cluster" style="width:${size}px;height:${size}px">${n}</div>`, iconSize: [size, size] });
  },
}).addTo(map);
const routeLayer = L.layerGroup().addTo(map); // route stops stay unclustered so their numbers show
const routeLine = L.polyline([], { interactive: false, weight: 3, dashArray: "2 8", lineCap: "round" }).addTo(map);

function makeIcon(s) {
  const n = route.indexOf(s.place_id) + 1, size = n ? 22 : 14;
  return L.divIcon({
    className: "",
    html: `<div class="pin${s.place_id === active ? " on" : ""}${n ? " num" : ""}" style="--dot:var(${CAT_VARS[s.cat]})">${n || ""}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}
const refreshIcon = id => byId[id] && markers[id].setIcon(makeIcon(byId[id]));

// ---- data
$("list").innerHTML = `<li class="empty">${t("loading")}</li>`;
fetch("/data/shops.json", { cache: "no-cache" })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(init)
  .catch(() => { $("list").innerHTML = `<li class="empty">${t("loadFail")}</li>`; });

function init(data) {
  SHOPS = data;
  SHOPS.forEach(s => {
    byId[s.place_id] = s;
    const m = L.marker([s.lat, s.lng], { icon: makeIcon(s), title: s.name });
    m.bindPopup(() => popupEl(s), { maxWidth: 300, minWidth: 240 });
    // on phones a popup opens with the sheet at peek, so keep it clear of that and of the notch
    Object.defineProperties(m.getPopup().options, {
      autoPanPaddingTopLeft: { get: () => sheet.mobile() ? [12, sheet.safeTop() + 36] : [20, 60] },
      autoPanPaddingBottomRight: { get: () => [12, sheet.peekCover() + 12] },
    });
    m.on("click", () => select(s.place_id, false));
    m.on("popupclose", () => { if (active === s.place_id) { active = null; refreshIcon(s.place_id); markActiveRow(); setUrl(); } });
    markers[s.place_id] = m;
  });
  route = route.filter(id => byId[id]);

  const p = new URLSearchParams(location.search);
  const sharedRoute = (p.get("route") || "").split(",").filter(id => byId[id]);
  if (sharedRoute.length) { route = sharedRoute.slice(0, MAX_STOPS); store.set("route", route); }

  map.fitBounds(L.latLngBounds(SHOPS.map(s => [s.lat, s.lng])), mapPad());
  applyLang();
  const shared = p.get("shop");
  if (byId[shared]) setTimeout(() => select(shared, true), 300);
  else if (sharedRoute.length) map.fitBounds(L.latLngBounds(route.map(id => [byId[id].lat, byId[id].lng])).pad(0.3), mapPad());
  setInterval(render, 60_000);
}

// ---- static text + controls
function applyLang() {
  document.documentElement.lang = lang;
  store.set("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll("[data-i18n-html]").forEach(el => el.innerHTML = t(el.dataset.i18nHtml));
  document.querySelectorAll("[data-i18n-label]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nLabel)));
  document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  $("q").placeholder = t("search");
  fillSelect($("sort"), [["reviews", t("sortReviews")], ["rating", t("sortRating")], ["near", t("sortNear"), !me], ["name", t("sortName")]]);
  fillSelect($("minr"), [["0", t("anyRating")], ["4", "★ 4.0+"], ["4.5", "★ 4.5+"]]);
  fillSelect($("mode"), [["walking", t("walking")], ["transit", t("transit")], ["driving", t("driving")]]);
  $("mode").value = mode;
  buildChips();
  render();
  renderRoute();
  if (active) markers[active].getPopup()?.setContent(popupEl(byId[active]));
  if (typeof updateOfflineUI === "function") updateOfflineUI();
}

function fillSelect(sel, opts) {
  const v = sel.value;
  sel.innerHTML = opts.map(([val, label, disabled]) => `<option value="${val}"${disabled ? " disabled" : ""}>${label}</option>`).join("");
  if (v && [...sel.options].some(o => o.value === v && !o.disabled)) sel.value = v;
}

function chip(label, count, pressed, onClick, { dot, title, disabled } = {}) {
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.setAttribute("aria-pressed", pressed);
  if (dot) b.style.setProperty("--dot", `var(${dot})`);
  if (title) b.title = title;
  b.disabled = !!disabled;
  b.innerHTML = `${dot ? "<i></i>" : ""}${label}${count != null ? ` <b>${count}</b>` : ""}`;
  b.onclick = onClick;
  return b;
}

function buildChips() {
  const chips = $("chips"), toggles = $("toggles");
  chips.innerHTML = toggles.innerHTML = "";
  Object.keys(CAT_VARS).forEach(k => {
    const n = SHOPS.filter(s => s.cat === k).length;
    if (n) chips.appendChild(chip(catLabel(k), n, on[k], () => { on[k] = !on[k]; buildChips(); render(); }, { dot: CAT_VARS[k], title: T().cats[k][1] }));
  });
  const tagchips = $("tagchips");
  tagchips.innerHTML = "";
  TAGS.forEach(k => {
    const n = SHOPS.filter(s => s.tags?.includes(k)).length;
    if (n) tagchips.appendChild(chip(tagLabel(k), n, wantTags.has(k), () => { wantTags.has(k) ? wantTags.delete(k) : wantTags.add(k); buildChips(); render(); }));
  });
  const openCount = SHOPS.filter(s => hoursStatus(s.hours)?.open).length;
  toggles.appendChild(chip(t("openNow"), openCount, openOnly, () => { openOnly = !openOnly; buildChips(); render(); }, { dot: "--ok" }));
  toggles.appendChild(chip("♥ " + t("saved"), saved.size, savedOnly, () => { savedOnly = !savedOnly; buildChips(); render(); }, { disabled: !saved.size && !savedOnly }));
  const changed = Object.values(on).some(v => !v) || openOnly || savedOnly || wantTags.size > 0 || $("minr").value !== "0";
  $("filtersBtn").classList.toggle("dot", changed);
}

$("q").addEventListener("focus", () => sheet.set("full"));
["q", "sort", "minr"].forEach(id => $(id).addEventListener("input", () => { render(); buildChips(); }));
document.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => { lang = b.dataset.lang; applyLang(); });
$("filtersBtn").onclick = () => {
  const open = $("filters").classList.toggle("show");
  if (open && sheet.state === "peek") sheet.set("half");
  $("filtersBtn").setAttribute("aria-expanded", open);
};

// ---- status text
function statusHtml(s, long) {
  const st = hoursStatus(s.hours);
  if (!st) return long ? `<span class="st">${t("noHours")}</span>` : "";
  if (st.always) return `<span class="st ok">${t("open24")}</span>`;
  if (st.open) return `<span class="st ok">${t("open")}</span> · ${t("closesAt", { t: hhmm(st.until) })}`;
  if (!st.next) return `<span class="st">${t("closed")}</span>`;
  const when = st.next.today ? t("opensAt", { t: hhmm(st.next.min) }) : t("opensDay", { d: T().days[st.next.day], t: hhmm(st.next.min) });
  return `<span class="st">${t("closed")}</span> · ${when}`;
}
const deliveryToday = s => myDel[s.place_id] === krakowNow().day;

// ---- list
function render() {
  if (!SHOPS.length) return;
  const q = $("q").value.trim().toLowerCase(), min = +$("minr").value, sort = $("sort").value;
  const rows = SHOPS
    .filter(s => on[s.cat] && (s.rating || 0) >= min
      && (!openOnly || hoursStatus(s.hours)?.open)
      && (!savedOnly || saved.has(s.place_id))
      && [...wantTags].every(k => s.tags?.includes(k))
      && (!q || (s.name + " " + s.address).toLowerCase().includes(q)))
    .map(s => ({ s, d: me ? km(me, s) : null }));
  const by = {
    reviews: (a, b) => b.s.total_ratings - a.s.total_ratings,
    rating: (a, b) => b.s.rating - a.s.rating || b.s.total_ratings - a.s.total_ratings,
    near: (a, b) => a.d - b.d,
    name: (a, b) => a.s.name.localeCompare(b.s.name, "pl"),
  };
  rows.sort(by[sort] || by.reviews);

  const key = rows.map(r => r.s.place_id).sort().join() + "|" + route.join();
  if (key !== visibleKey) {
    visibleKey = key;
    cluster.clearLayers();
    routeLayer.clearLayers();
    rows.forEach(({ s }) => (route.includes(s.place_id) ? routeLayer : cluster).addLayer(markers[s.place_id]));
  }
  $("count").textContent = t("count", { n: rows.length, t: SHOPS.length });

  const list = $("list");
  list.innerHTML = rows.length ? "" : `<li class="empty">${t("empty")}</li>`;
  rows.forEach(({ s, d }) => {
    const li = document.createElement("li");
    const inRoute = route.includes(s.place_id);
    li.className = "item" + (s.place_id === active ? " on" : "");
    li.dataset.id = s.place_id;
    li.style.setProperty("--dot", `var(${CAT_VARS[s.cat]})`);
    li.innerHTML = `<button type="button" class="main"><i></i>
        <div class="txt"><div class="nm">${saved.has(s.place_id) ? '<span class="heart" aria-label="saved">♥</span> ' : ""}${esc(s.name)}</div>
        <div class="ad">${esc(short(s.address))}</div>
        <div class="meta">${statusHtml(s, false)}${deliveryToday(s) ? ` <span class="pill">${t("deliveryToday")}</span>` : ""}</div>
        ${s.tags?.length ? `<div class="tags">${s.tags.map(k => `<span class="tag-s${wantTags.has(k) ? " hit" : ""}">${tagLabel(k)}</span>`).join("")}</div>` : ""}</div>
        <div class="rt">${s.rating ? `<span class="s">★</span> ${s.rating.toFixed(1)}` : ""}<small>${d != null ? `<span class="km">${fmtKm(d)}</span>` : s.rating ? s.total_ratings : ""}</small></div>
      </button>
      <button type="button" class="add" aria-pressed="${inRoute}" title="${inRoute ? t("inRoute") : t("addRoute")}" aria-label="${inRoute ? t("inRoute") : t("addRoute")}">${inRoute ? route.indexOf(s.place_id) + 1 : "+"}</button>`;
    li.querySelector(".main").onclick = () => { sheet.set("peek"); select(s.place_id, true); };
    li.querySelector(".add").onclick = () => toggleRoute(s.place_id);
    list.appendChild(li);
  });
}

function markActiveRow() {
  document.querySelectorAll("li.item").forEach(li => li.classList.toggle("on", li.dataset.id === active));
}

// ---- popup
function popupEl(s) {
  const el = document.createElement("div");
  el.className = "pop";
  el.style.setProperty("--dot", `var(${CAT_VARS[s.cat]})`);
  const inRoute = route.includes(s.place_id), isSaved = saved.has(s.place_id);
  const today = krakowNow().day;
  const week = s.hours ? T().daysLong.map((d, i) => `<tr${i === today ? ' class="today"' : ""}><th>${d}</th><td>${dayText(s.hours[i], t("closedDay"))}</td></tr>`).join("") : "";
  const meta = [s.rating ? `★ ${s.rating.toFixed(1)} · ${reviewsText(s.total_ratings)}` : t("noReviews")];
  if (s.cards != null) meta.push(s.cards ? t("cardsYes") : t("cardsNo"));
  el.innerHTML = `<span class="tag">${catLabel(s.cat)}</span>
    <h3>${esc(s.name)}</h3>
    <div class="addr">${esc(short(s.address))}</div>
    <div class="pmeta">${meta.join(" · ")}</div>
    <div class="pstatus">${statusHtml(s, true)}</div>
    ${s.tags?.length ? `<div class="tags">${s.tags.map(k => `<span class="tag-s">${tagLabel(k)}</span>`).join("")}</div>` : ""}
    ${s.hours && !is24(s.hours) ? `<details><summary>${t("hoursWeek")}</summary><table>${week}</table></details>` : ""}
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
    ${s.delivery ? `<p class="deliv"><b>${t("deliveryReviews")}:</b> ${esc(s.delivery)}</p>` : ""}
    <div class="mydel"><span>${t("myDelivery")}</span>
      <select aria-label="${t("myDelivery")}">${[`<option value="">${t("deliveryNone")}</option>`, ...T().daysLong.map((d, i) => `<option value="${i}"${myDel[s.place_id] === i ? " selected" : ""}>${d}</option>`)].join("")}</select>
    </div>
    <div class="acts">
      <button type="button" class="act route" aria-pressed="${inRoute}">${inRoute ? "✓ " + t("inRoute") : "+ " + t("addRoute")}</button>
      <button type="button" class="act save" aria-pressed="${isSaved}">${isSaved ? "♥ " + t("savedBtn") : "♡ " + t("save")}</button>
      <button type="button" class="act copy">${t("copyLink")}</button>
    </div>
    <div class="links"><a href="${gmaps(s)}" target="_blank" rel="noopener">${t("gmaps")} ↗</a>${s.website ? ` <a href="${esc(s.website)}" target="_blank" rel="noopener">${t("website")} ↗</a>` : ""}${s.phone ? ` <span class="phone">${esc(s.phone)}</span>` : ""}</div>`;
  enhanceSelect(el.querySelector(".mydel select"));
  L.DomEvent.disableClickPropagation(el); // buttons re-render the popup; keep Leaflet from reading that as a map click
  el.querySelector(".route").onclick = () => toggleRoute(s.place_id);
  el.querySelector(".save").onclick = () => toggleSaved(s.place_id);
  el.querySelector(".copy").onclick = () => copy(`${location.origin}/?shop=${s.place_id}`);
  el.querySelector(".mydel select").onchange = e => {
    if (e.target.value === "") delete myDel[s.place_id]; else myDel[s.place_id] = +e.target.value;
    store.set("delivery", myDel);
    render();
  };
  return el;
}
const refreshPopup = id => { const p = markers[id]?.getPopup(); if (p?.isOpen()) p.setContent(popupEl(byId[id])); };

// ---- selection + url
function select(id, fly) {
  const prev = active;
  active = id;
  if (prev && prev !== id) refreshIcon(prev);
  refreshIcon(id);
  const m = markers[id];
  const show = () => {
    if (map.getZoom() < 15) map.setView(m.getLatLng(), 16, { animate: !reduceMotion });
    m.openPopup();
  };
  if (fly) cluster.hasLayer(m) ? cluster.zoomToShowLayer(m, show) : show();
  markActiveRow();
  document.querySelector(`li.item[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  setUrl();
}
function setUrl() {
  try { history.replaceState(null, "", active ? `/?shop=${active}` : "/"); } catch {}
}

// ---- saved
function toggleSaved(id) {
  saved.has(id) ? saved.delete(id) : saved.add(id);
  store.set("saved", [...saved]);
  if (savedOnly && !saved.size) savedOnly = false;
  buildChips(); render(); refreshPopup(id);
}

// ---- route
function toggleRoute(id) {
  const i = route.indexOf(id);
  if (i >= 0) route.splice(i, 1);
  else if (route.length >= MAX_STOPS) return toast(t("routeMax"));
  else route.push(id);
  routeChanged();
}
function routeChanged() {
  store.set("route", route);
  const reopen = active && markers[active].isPopupOpen() ? active : null;
  SHOPS.forEach(s => refreshIcon(s.place_id));
  render(); renderRoute();
  if (reopen) setTimeout(() => select(reopen, true), 60);
}
function renderRoute() {
  $("route").hidden = !route.length;
  drawRoute();
  if (!route.length) return;
  $("routeTitle").textContent = stopsTitle(route.length);
  $("stops").innerHTML = route.map((id, i) => {
    const s = byId[id];
    return `<li style="--dot:var(${CAT_VARS[s.cat]})"><span class="n">${i + 1}</span><button type="button" class="go" data-id="${id}">${esc(s.name)}</button><button type="button" class="x" data-id="${id}" aria-label="${t("remove")}">×</button></li>`;
  }).join("");
  $("stops").querySelectorAll(".go").forEach(b => b.onclick = () => { sheet.set("peek"); select(b.dataset.id, true); });
  $("stops").querySelectorAll(".x").forEach(b => b.onclick = () => toggleRoute(b.dataset.id));
  const stops = route.map(id => byId[id]);
  const ll = s => `${s.lat},${s.lng}`;
  const dest = stops[stops.length - 1], wps = stops.slice(0, -1);
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=${mode}&destination=${ll(dest)}&destination_place_id=${dest.place_id}`;
  if (me) url += `&origin=${me.lat},${me.lng}`;
  if (wps.length) url += `&waypoints=${wps.map(ll).join("%7C")}&waypoint_place_ids=${wps.map(s => s.place_id).join("%7C")}`;
  $("routeGo").href = url;
  $("routeOpt").hidden = route.length < 3;
}
function drawRoute() {
  const pts = route.map(id => byId[id]).filter(Boolean).map(s => [s.lat, s.lng]);
  if (me && pts.length) pts.unshift([me.lat, me.lng]);
  routeLine.setLatLngs(pts.length > 1 ? pts : []);
  routeLine.setStyle({ color: cssVar("--accent") });
}
$("routeToggle").onclick = () => {
  const open = $("route").classList.toggle("expanded");
  $("routeToggle").setAttribute("aria-expanded", open);
};
$("mode").onchange = e => { mode = e.target.value; store.set("mode", mode); renderRoute(); };
$("routeClear").onclick = () => { route = []; routeChanged(); };
$("routeShare").onclick = () => copy(`${location.origin}/?route=${route.join(",")}`);
$("routeOpt").onclick = () => {
  // nearest neighbour from your location, or from the first stop
  const left = route.map(id => byId[id]);
  const out = [];
  let cur = me || left.shift();
  if (!me) out.push(cur);
  while (left.length) {
    left.sort((a, b) => km(cur, a) - km(cur, b));
    cur = left.shift();
    out.push(cur);
  }
  route = out.map(s => s.place_id);
  routeChanged();
};

// ---- location
$("near").onclick = () => {
  const msg = $("msg");
  if (!navigator.geolocation) { msg.textContent = t("locFail"); msg.hidden = false; return; }
  msg.textContent = t("finding"); msg.hidden = false;
  navigator.geolocation.getCurrentPosition(p => {
    me = { lat: p.coords.latitude, lng: p.coords.longitude };
    msg.hidden = true;
    $("near").setAttribute("aria-pressed", "true");
    applyLang();
    $("sort").value = "near";
    if (meMarker) meMarker.remove();
    meMarker = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), title: "You", zIndexOffset: 1000, interactive: false }).addTo(map);
    viewAt([me.lat, me.lng], 15);
    render(); renderRoute();
  }, err => {
    msg.textContent = err.code === 1 ? t("locBlocked") : t("locFail");
  }, { enableHighAccuracy: true, timeout: 10000 });
};

// ---- copy + toast
function copy(text) {
  const done = () => toast(t("copied"));
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    navigator.share({ url: text }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(text).then(done, () => toast(t("copyFail"))) ?? toast(t("copyFail"));
}
let toastTimer;
function toast(text, ms = 2200) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, ms);
}
