// The Universal Team Hub's background: three soft brand-colour glows drifting behind the page, the green one following
// the pointer. Same colours, sizes and drift as the hub, drawn as three gradient circles that the graphics card slides
// around (CSS transforms) instead of a canvas repainted every frame, so it costs almost nothing to run.
// Still when the device asks for less motion (styles.css turns animations and transitions off).
export function startAurora(el) {
  el.innerHTML = '<div class="glow g0"><b><i></i></b></div><div class="glow g1"><b><i></i></b></div><div class="glow g2"><b><i></i></b></div>';
  const g0 = el.querySelector('.g0');
  let px = null, py = null, until = 0, frame = 0, t = 0;
  const place = () => {
    frame = 0;
    const w = window.innerWidth, h = window.innerHeight, follow = px !== null && performance.now() < until;
    // the green glow: to the pointer, or slowly around the middle when there is none (as in the hub)
    const x = follow ? px : w * (0.5 + 0.3 * Math.sin(t * 0.07)), y = follow ? py : h * (0.55 + 0.25 * Math.cos(t * 0.09));
    g0.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const ask = () => { if (!frame) frame = requestAnimationFrame(place); };
  window.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; until = e.pointerType === 'mouse' ? Infinity : performance.now() + 2500; ask(); }, { passive: true });
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) { until = 0; ask(); } });
  window.addEventListener('resize', ask);
  // without a pointer the green glow drifts: a new target every few seconds, eased by a CSS transition
  setInterval(() => { if (document.hidden) return; t += 4; if (performance.now() >= until) ask(); }, 4000);
  ask();
  return () => {};
}
