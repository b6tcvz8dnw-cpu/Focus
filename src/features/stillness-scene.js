const PHASES = [
  { name: 'night', start: 20, end: 5 },
  { name: 'dawn', start: 5, end: 8 },
  { name: 'day', start: 8, end: 16 },
  { name: 'dusk', start: 16, end: 20 }
];

function phaseFor(hour) {
  if (hour >= 20 || hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 16) return 'day';
  return 'dusk';
}

export function mountStillnessScene(root) {
  if (!root) return { onEnter() {}, onLeave() {}, destroy() {} };
  const world = root.querySelector('#stillnessWorld');
  const clock = root.querySelector('#stillnessClock');
  let interval = null;
  let active = false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function update() {
    if (!active || document.hidden) return;
    const now = new Date();
    world.dataset.phase = phaseFor(now.getHours() + now.getMinutes() / 60);
    clock.textContent = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
  }

  function onEnter() {
    active = true;
    update();
    if (interval === null && !reducedMotion?.matches) {
      interval = window.setInterval(update, 60_000);
    }
  }

  function onLeave() {
    active = false;
    if (interval !== null) window.clearInterval(interval);
    interval = null;
  }

  function onVisibility() {
    if (document.hidden) {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    } else if (active) {
      update();
      if (interval === null && !reducedMotion?.matches) interval = window.setInterval(update, 60_000);
    }
  }

  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion?.addEventListener?.('change', onVisibility);

  return {
    onEnter,
    onLeave,
    destroy() {
      onLeave();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion?.removeEventListener?.('change', onVisibility);
    }
  };
}
