// Custom dropdown on top of a native <select>. The select stays the source of truth (value, options,
// input/change events), so existing code keeps working; this only replaces what you see and touch.
const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg class="ck" viewBox="0 0 14 14" aria-hidden="true"><path d="m3 7.5 2.5 2.5L11 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEL_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const SEL_INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
let openSelect = null;
let selSeq = 0;

function enhanceSelect(sel) {
  if (sel._enhanced) return;
  sel._enhanced = true;
  const uid = sel.id || "sel" + ++selSeq;
  const wrap = document.createElement("div");
  wrap.className = "sel";
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add("sel-native");
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sel-btn";
  btn.id = uid + "-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", uid + "-list");
  if (sel.getAttribute("aria-label")) btn.setAttribute("aria-label", sel.getAttribute("aria-label"));
  if (sel.id) document.querySelectorAll(`label[for="${sel.id}"]`).forEach(l => (l.htmlFor = btn.id));

  const list = document.createElement("ul");
  list.className = "sel-list";
  list.id = uid + "-list";
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;
  list.hidden = true;
  wrap.append(btn, list);

  let hl = -1, typed = "", typedAt = 0;
  const opts = () => [...sel.options];

  function sync() {
    const o = sel.options[SEL_INDEX.get.call(sel)];
    btn.innerHTML = `<span class="sel-label">${o ? o.textContent : ""}</span>${CHEVRON}`;
    if (!list.hidden) build();
  }
  function build() {
    const cur = SEL_INDEX.get.call(sel);
    list.innerHTML = opts().map((o, i) =>
      `<li role="option" id="${uid}-o${i}" data-i="${i}" class="sel-opt${i === hl ? " hl" : ""}" aria-selected="${i === cur}"${o.disabled ? ' aria-disabled="true"' : ""}>${CHECK}<span>${o.textContent}</span></li>`
    ).join("");
    list.setAttribute("aria-activedescendant", hl >= 0 ? `${uid}-o${hl}` : "");
  }
  function highlight(i) {
    hl = i;
    list.querySelectorAll(".sel-opt").forEach(li => li.classList.toggle("hl", +li.dataset.i === i));
    list.setAttribute("aria-activedescendant", i >= 0 ? `${uid}-o${i}` : "");
    list.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function step(from, dir) {
    const o = opts();
    for (let i = from + dir; i >= 0 && i < o.length; i += dir) if (!o[i].disabled) return i;
    return from;
  }
  function open() {
    if (openSelect && openSelect !== close) openSelect(false);
    openSelect = close;
    hl = SEL_INDEX.get.call(sel);
    build();
    list.hidden = false;
    list.classList.remove("up", "right");
    const b = btn.getBoundingClientRect(), l = list.getBoundingClientRect();
    if (b.bottom + l.height + 12 > innerHeight && b.top > l.height + 12) list.classList.add("up");
    if (b.left + l.width > innerWidth - 8) list.classList.add("right");
    btn.setAttribute("aria-expanded", "true");
    list.focus({ preventScroll: true });
    highlight(hl);
    document.addEventListener("pointerdown", outside, true);
  }
  function close(focusBtn) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    if (openSelect === close) openSelect = null;
    if (focusBtn) btn.focus({ preventScroll: true });
  }
  function outside(e) { if (!wrap.contains(e.target)) close(false); }
  function choose(i) {
    const o = opts()[i];
    if (!o || o.disabled) return;
    if (SEL_INDEX.get.call(sel) !== i) {
      SEL_INDEX.set.call(sel, i);
      sync();
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  }

  btn.addEventListener("click", () => (list.hidden ? open() : close(true)));
  btn.addEventListener("keydown", e => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); open(); }
  });
  list.addEventListener("keydown", e => {
    const n = opts().length;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(step(hl, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(step(hl, -1)); }
    else if (e.key === "Home") { e.preventDefault(); highlight(step(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); highlight(step(n, -1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(hl); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typed = (now - typedAt > 700 ? "" : typed) + e.key.toLowerCase();
      typedAt = now;
      const i = opts().findIndex(o => !o.disabled && o.textContent.trim().toLowerCase().startsWith(typed));
      if (i >= 0) highlight(i);
    }
  });
  list.addEventListener("pointermove", e => {
    const li = e.target.closest(".sel-opt");
    if (li && +li.dataset.i !== hl && li.getAttribute("aria-disabled") !== "true") highlight(+li.dataset.i);
  });
  list.addEventListener("click", e => {
    const li = e.target.closest(".sel-opt");
    if (li) choose(+li.dataset.i);
  });

  // Programmatic changes (sel.value = …, new options) update the button too
  Object.defineProperty(sel, "value", { configurable: true, get: () => SEL_VALUE.get.call(sel), set: v => { SEL_VALUE.set.call(sel, v); sync(); } });
  Object.defineProperty(sel, "selectedIndex", { configurable: true, get: () => SEL_INDEX.get.call(sel), set: v => { SEL_INDEX.set.call(sel, v); sync(); } });
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
  sync();
}
