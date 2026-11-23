/* Quiet Pomo motion helpers.
 * Presentation only: every helper runs after the state change it decorates, never delays it,
 * and only animates transform/opacity. Reduced motion falls back to a short opacity fade. */
(() => {
  const DURATION = { instant: 90, quick: 160, base: 240, slow: 360, calm: 600 };
  const EASE = {
    out: "cubic-bezier(.2, .8, .2, 1)",
    in: "cubic-bezier(.4, 0, 1, 1)",
    inOut: "cubic-bezier(.65, 0, .35, 1)",
    soft: "cubic-bezier(.34, 1.36, .64, 1)",
  };
  const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(query?.matches);
  const canAnimate = (element) => element && typeof element.animate === "function" && element.isConnected;

  // Entering content: drift a few pixels from where it came from, settle in place.
  function enter(element, { x = 0, y = 6, scale = 1, duration = DURATION.base, delay = 0 } = {}) {
    if (!canAnimate(element)) return null;
    if (reduced()) return element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "linear" });
    return element.animate([
      { opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` },
      { opacity: 1, transform: "none" },
    ], { duration, delay, easing: EASE.out, fill: "backwards" });
  }

  // Short tactile emphasis for something that just changed (cycle dot, saved swatch).
  function pop(element, amount = 1.28) {
    if (!canAnimate(element)) return null;
    if (reduced()) return element.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160 });
    return element.animate([
      { transform: "scale(1)" }, { transform: `scale(${amount})`, offset: .4 }, { transform: "scale(1)" },
    ], { duration: DURATION.slow, easing: EASE.soft });
  }

  // FLIP for keyed lists ([data-key]). Moves siblings, fades new rows in and
  // leaves an inert ghost of removed rows that fades out while the real DOM is already final.
  function flip(roots, mutate) {
    roots = roots.filter(Boolean);
    const snapshot = new Map();
    const rootBoxes = new Map();
    roots.forEach((root) => {
      rootBoxes.set(root, root.getBoundingClientRect());
      root.querySelectorAll(":scope > [data-key]").forEach((item) => {
        snapshot.set(item.dataset.key, { rect: item.getBoundingClientRect(), node: item, root });
      });
    });
    mutate();
    if (snapshot.size > 80) return;
    const seen = new Set();
    roots.forEach((root) => {
      root.querySelectorAll(":scope > [data-key]").forEach((item) => {
        const key = item.dataset.key;
        seen.add(key);
        const before = snapshot.get(key);
        if (!before) {
          if (snapshot.size || item.dataset.enter === "true") enter(item, { y: -6, duration: DURATION.base });
          return;
        }
        const after = item.getBoundingClientRect();
        const dx = before.rect.left - after.left;
        const dy = before.rect.top - after.top;
        if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || !canAnimate(item)) return;
        if (reduced()) { item.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 140 }); return; }
        item.animate([
          { transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" },
        ], { duration: DURATION.slow, easing: EASE.inOut });
      });
    });
    snapshot.forEach(({ rect, node, root }, key) => {
      if (seen.has(key) || !root.isConnected || reduced()) return;
      const box = root.getBoundingClientRect();
      const ghost = node.cloneNode(true);
      ghost.removeAttribute("id");
      [ghost, ...ghost.querySelectorAll("*")].forEach((child) => {
        ["id", "data-key", "data-task-id", "data-role", "data-history-id"].forEach((name) => child.removeAttribute(name));
      });
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.classList.add("is-ghost");
      Object.assign(ghost.style, {
        position: "absolute", margin: "0", pointerEvents: "none", zIndex: "0",
        left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      });
      root.append(ghost);
      const animation = ghost.animate([
        { opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-12px) scale(.98)" },
      ], { duration: DURATION.base, easing: EASE.in, fill: "forwards" });
      animation.onfinish = () => ghost.remove();
      animation.oncancel = () => ghost.remove();
    });
  }

  // Cross-fade the whole document for rare global changes (theme). Falls back to an instant change.
  function crossfade(update) {
    if (reduced() || typeof document.startViewTransition !== "function") { update(); return; }
    try { document.startViewTransition(update); } catch { update(); }
  }

  globalThis.QuietMotion = { DURATION, EASE, reduced, enter, pop, flip, crossfade };
})();
