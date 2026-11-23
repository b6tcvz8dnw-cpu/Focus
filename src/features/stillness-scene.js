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
  const visitorLayer = root.querySelector('#stillnessVisitorLayer');
  const bird = root.querySelector('#stillnessBird');
  let interval = null;
  let visitorTimer = null;
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

  function clearVisitors() {
    if (bird) bird.classList.remove('is-flying');
    visitorLayer?.querySelectorAll('.stillness-mote').forEach(node => node.remove());
  }

  function showVisitor() {
    if (!active || document.hidden || reducedMotion?.matches || !visitorLayer) return;
    if (Math.random() < 0.2 && bird && !bird.classList.contains('is-flying')) {
      bird.classList.remove('is-flying');
      void bird.getBoundingClientRect();
      bird.classList.add('is-flying');
      return;
    }
    if (visitorLayer.querySelectorAll('.stillness-mote').length >= 3) return;
    const mote = document.createElement('i');
    mote.className = 'stillness-mote';
    mote.setAttribute('aria-hidden', 'true');
    mote.style.left = (12 + Math.random() * 76) + '%';
    mote.style.top = (18 + Math.random() * 55) + '%';
    mote.style.setProperty('--mote-x', (24 + Math.random() * 80) + 'px');
    mote.style.setProperty('--mote-y', (-18 - Math.random() * 50) + 'px');
    mote.style.setProperty('--mote-duration', (14 + Math.random() * 9) + 's');
    mote.addEventListener('animationend', () => mote.remove(), { once: true });
    visitorLayer.append(mote);
  }

  function scheduleVisitor() {
    if (!active || document.hidden || reducedMotion?.matches || visitorTimer !== null) return;
    visitorTimer = window.setTimeout(() => {
      visitorTimer = null;
      if (Math.random() < 0.72) showVisitor();
      scheduleVisitor();
    }, 28_000 + Math.random() * 34_000);
  }

  function stopVisitors() {
    if (visitorTimer !== null) window.clearTimeout(visitorTimer);
    visitorTimer = null;
    clearVisitors();
  }

  function onEnter() {
    active = true;
    update();
    if (interval === null && !reducedMotion?.matches) interval = window.setInterval(update, 60_000);
    scheduleVisitor();
  }

  function onLeave() {
    active = false;
    if (interval !== null) window.clearInterval(interval);
    interval = null;
    stopVisitors();
  }

  function onVisibility() {
    if (document.hidden) {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
      stopVisitors();
    } else if (active) {
      update();
      if (interval === null && !reducedMotion?.matches) interval = window.setInterval(update, 60_000);
      scheduleVisitor();
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
