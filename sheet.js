// Phone layout: the list panel is a bottom sheet over a full-screen map. It snaps to
// peek (search bar and route bar only), half, or full, and is dragged by its header.
const sheet = (() => {
  const mq = matchMedia("(max-width: 760px)");
  const aside = document.querySelector("aside"), header = aside.querySelector("header");
  const routeEl = document.getElementById("route"), grab = document.getElementById("grab");
  const searchRow = header.querySelector(".searchrow");
  const ORDER = ["peek", "half", "full"];
  // env() is only readable from CSS, so a hidden probe reports the safe-area insets in px
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px);width:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);

  let state = "half", dragH = null, drag = null, draggedAt = 0;

  function heights() {
    const top = probe.offsetHeight, bottom = probe.offsetWidth, vh = innerHeight;
    const full = vh - top - 24;
    // peek shows the title and search box; the near-me row tucks under the route bar or screen edge
    const peek = Math.min(full, searchRow.offsetTop + searchRow.offsetHeight + 12 + (routeEl.hidden ? bottom : routeEl.offsetHeight));
    const half = Math.min(full, Math.max(peek + 120, Math.round(vh * 0.5)));
    return { peek, half, full };
  }
  function apply() {
    if (!mq.matches) {
      aside.style.removeProperty("height");
      delete aside.dataset.sheet;
      return;
    }
    const h = heights();
    aside.dataset.sheet = state;
    aside.style.height = (dragH ?? h[state]) + "px";
    document.documentElement.style.setProperty("--peek", h.peek + "px");
    grab.setAttribute("aria-expanded", state !== "peek");
  }
  function set(next) {
    if (!mq.matches || next === state) return;
    state = next;
    if (state === "peek") document.activeElement?.closest?.("aside") && document.activeElement.blur();
    apply();
  }

  // A drag follows the finger, then snaps to the nearest size (or the next one, on a flick)
  const begin = (y, t, id) => { drag = { id, y, h: aside.offsetHeight, moved: false, last: [y, t], prev: [y, t] }; };
  function move(y, t) {
    if (!drag.moved) {
      drag.moved = true;
      aside.classList.add("dragging");
    }
    const h = heights();
    dragH = Math.max(h.peek, Math.min(h.full, drag.h - (y - drag.y)));
    drag.prev = drag.last;
    drag.last = [y, t];
    apply();
  }
  function finish() {
    const d = drag;
    drag = null;
    if (!d?.moved) return;
    draggedAt = performance.now();
    aside.classList.remove("dragging");
    const v = (d.last[0] - d.prev[0]) / Math.max(1, d.last[1] - d.prev[1]); // px per ms, positive is down
    const h = heights(), cur = dragH;
    dragH = null;
    const pulled = cur - d.h; // positive is up
    if (v < -0.25 || (pulled > 60 && v < 0)) state = ORDER.find(k => h[k] > cur + 1) || "full";
    else if (v > 0.25 || (pulled < -60 && v > 0)) state = [...ORDER].reverse().find(k => h[k] < cur - 1) || "peek";
    else state = ORDER.reduce((a, k) => Math.abs(h[k] - cur) < Math.abs(h[a] - cur) ? k : a);
    apply();
  }

  // Header: the handle, title row and near-me row drag the sheet (inputs and chips keep their own gestures)
  header.addEventListener("pointerdown", e => {
    if (!mq.matches || e.button > 0) return;
    if (e.target !== grab && e.target.closest("input, button, select, a, .sel, .filters")) return;
    begin(e.clientY, e.timeStamp, e.pointerId);
  });
  addEventListener("pointermove", e => {
    if (drag?.id === e.pointerId && (drag.moved || Math.abs(e.clientY - drag.y) >= 6)) move(e.clientY, e.timeStamp);
  });
  addEventListener("pointerup", e => { if (drag?.id === e.pointerId) finish(); });
  addEventListener("pointercancel", e => { if (drag?.id === e.pointerId) finish(); });

  // List: below full, a vertical swipe moves the sheet; at full, pulling down from the top collapses it
  let touch = null;
  aside.addEventListener("touchstart", e => {
    touch = null;
    if (!mq.matches || drag || e.touches.length > 1 || e.target.closest("header, .stops, .sel-list")) return;
    touch = { y: e.touches[0].clientY, x: e.touches[0].clientX, top: aside.scrollTop <= 0, decided: false };
  }, { passive: true });
  aside.addEventListener("touchmove", e => {
    if (!touch) return;
    const p = e.touches[0], dy = p.clientY - touch.y;
    if (!touch.decided) {
      if (Math.abs(dy) < 6 && Math.abs(p.clientX - touch.x) < 6) return;
      touch.decided = true;
      const mine = Math.abs(dy) > Math.abs(p.clientX - touch.x) && e.cancelable && (state !== "full" || (touch.top && dy > 0));
      if (!mine) { touch = null; return; }
      begin(touch.y, e.timeStamp, "touch");
    }
    e.preventDefault();
    move(p.clientY, e.timeStamp);
  }, { passive: false });
  const touchEnd = () => { if (touch && drag?.id === "touch") finish(); touch = null; };
  aside.addEventListener("touchend", touchEnd);
  aside.addEventListener("touchcancel", touchEnd);
  grab.addEventListener("click", () => {
    if (performance.now() - draggedAt < 300) return;
    set(state === "peek" ? "half" : state === "half" ? "full" : "peek");
  });

  new ResizeObserver(() => { if (!drag) apply(); }).observe(header);
  new ResizeObserver(() => { if (!drag) apply(); }).observe(routeEl);
  addEventListener("resize", apply);
  mq.addEventListener("change", apply);
  apply();

  return {
    set,
    get state() { return mq.matches ? state : null; },
    mobile: () => mq.matches,
    // how much of the map's bottom edge the sheet covers now, or at peek (where it sits while a popup is open)
    cover: () => mq.matches ? aside.offsetHeight : 0,
    peekCover: () => mq.matches ? heights().peek : 0,
    safeTop: () => probe.offsetHeight,
  };
})();
