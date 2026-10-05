const CATS = {
  lump: { label: "Lumpeks", v: "--c-lump" },
  sh: { label: "Second hand", v: "--c-sh" },
  vin: { label: "Vintage", v: "--c-vin" },
  char: { label: "Charity", v: "--c-char" },
  flea: { label: "Flea market", v: "--c-flea" },
};
const on = Object.fromEntries(Object.keys(CATS).map(k => [k, true]));
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

const map = L.map("map", { minZoom: 11, maxZoom: 19 }).setView([50.0614, 19.9366], 12);
// Minimal basemap: OpenFreeMap Positron/Dark with rail, shields, airports and boundaries stripped out
const HIDE = /^(railway|aeroway|airport|boundary|highway-shield|road_shield|highway-name-path|highway_path|label_country|label_state)/;
const dark = matchMedia("(prefers-color-scheme: dark)");
const basemap = L.maplibreGL({
  style: `https://tiles.openfreemap.org/styles/${dark.matches ? "dark" : "positron"}`,
  attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · places: Google Maps',
}).addTo(map);
const gl = basemap.getMaplibreMap();
gl.on("styledata", () => gl.getStyle().layers.forEach(l => {
  if (HIDE.test(l.id) && l.layout?.visibility !== "none") gl.setLayoutProperty(l.id, "visibility", "none");
}));
dark.addEventListener("change", e => gl.setStyle(`https://tiles.openfreemap.org/styles/${e.matches ? "dark" : "positron"}`));

let SHOPS = [], markers = {}, active = null, me = null, meMarker = null;

fetch("/data/shops.json")
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(init)
  .catch(() => { $("list").innerHTML = `<li class="empty">Couldn't load the shop list. Refresh the page to try again.</li>`; });

function init(data) {
  SHOPS = data;
  SHOPS.forEach(s => {
    const c = CATS[s.cat];
    const icon = L.divIcon({ className: "", html: `<div class="pin" style="--dot:var(${c.v})"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    const m = L.marker([s.lat, s.lng], { icon, title: s.name });
    m.bindPopup(`<div class="pop" style="--dot:var(${c.v})"><span class="tag">${c.label}</span><h3>${esc(s.name)}</h3>
      <div>${esc(short(s.address))}</div>
      <div style="margin:6px 0">${s.rating ? `★ ${s.rating.toFixed(1)} · ${s.total_ratings} reviews` : "No reviews yet"}</div>
      <a href="${gmaps(s)}" target="_blank" rel="noopener">Open in Google Maps ↗</a></div>`);
    m.on("click", () => select(s.place_id, false));
    markers[s.place_id] = m;
  });

  Object.entries(CATS).forEach(([k, c]) => {
    const n = SHOPS.filter(s => s.cat === k).length;
    if (!n) return;
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", "true");
    b.style.setProperty("--dot", `var(${c.v})`);
    b.innerHTML = `<i></i>${c.label} <b>${n}</b>`;
    b.onclick = () => { on[k] = !on[k]; b.setAttribute("aria-pressed", on[k]); render(); };
    $("chips").appendChild(b);
  });

  map.fitBounds(L.latLngBounds(SHOPS.map(s => [s.lat, s.lng])), { padding: [20, 20] });
  render();
}

["q", "sort", "minr"].forEach(id => $(id).addEventListener("input", render));

$("near").onclick = () => {
  const msg = $("msg");
  if (!navigator.geolocation) { msg.textContent = "Your browser doesn't share location."; msg.hidden = false; return; }
  msg.textContent = "Finding you…"; msg.hidden = false;
  navigator.geolocation.getCurrentPosition(p => {
    me = { lat: p.coords.latitude, lng: p.coords.longitude };
    msg.hidden = true;
    $("near").setAttribute("aria-pressed", "true");
    $("sort").querySelector('[value="near"]').disabled = false;
    $("sort").value = "near";
    if (meMarker) meMarker.remove();
    meMarker = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), title: "You", zIndexOffset: 1000 }).addTo(map);
    map.flyTo([me.lat, me.lng], 14, { duration: reduceMotion ? 0 : .6 });
    render();
  }, err => {
    msg.textContent = err.code === 1 ? "Location is blocked. Allow it in your browser settings to sort by distance." : "Couldn't get your location. Try again in a moment.";
  }, { enableHighAccuracy: true, timeout: 10000 });
};

function render() {
  const q = $("q").value.trim().toLowerCase(), min = +$("minr").value, sort = $("sort").value;
  const rows = SHOPS
    .filter(s => on[s.cat] && (s.rating || 0) >= min && (!q || (s.name + " " + s.address).toLowerCase().includes(q)))
    .map(s => ({ ...s, d: me ? km(me, s) : null }));
  const by = {
    reviews: (a, b) => b.total_ratings - a.total_ratings,
    rating: (a, b) => b.rating - a.rating || b.total_ratings - a.total_ratings,
    near: (a, b) => a.d - b.d,
    name: (a, b) => a.name.localeCompare(b.name, "pl"),
  };
  rows.sort(by[sort]);

  const ids = new Set(rows.map(s => s.place_id));
  SHOPS.forEach(s => ids.has(s.place_id) ? markers[s.place_id].addTo(map) : markers[s.place_id].remove());
  $("count").textContent = `${rows.length} of ${SHOPS.length}`;

  const list = $("list");
  list.innerHTML = rows.length ? "" : `<li class="empty">No shops match. Clear the search or turn a category back on.</li>`;
  rows.forEach(s => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" data-id="${s.place_id}" style="--dot:var(${CATS[s.cat].v})" class="${s.place_id === active ? "on" : ""}"><i></i>
      <div><div class="nm">${esc(s.name)}</div><div class="ad">${esc(short(s.address))}</div></div>
      <div class="rt">${s.rating ? `<span class="s">★</span> ${s.rating.toFixed(1)}` : ""}<small>${s.d != null ? `<span class="km">${fmtKm(s.d)}</span>` : s.rating ? s.total_ratings : "new"}</small></div></button>`;
    li.firstChild.onclick = () => select(s.place_id, true);
    list.appendChild(li);
  });
}

function select(id, fly) {
  markers[active]?.getElement()?.firstChild?.classList.remove("on");
  active = id;
  const m = markers[id];
  if (fly) map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 16), { duration: reduceMotion ? 0 : .6 });
  m.openPopup();
  m.getElement()?.firstChild?.classList.add("on");
  document.querySelectorAll("li button").forEach(b => b.classList.toggle("on", b.dataset.id === id));
  document.querySelector(`li button[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
}
