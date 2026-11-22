// Gentle timer-completion chime with an iOS-friendly audio unlock lifecycle.
export function createCompletionSoundController({
  getAudioContext = () => globalThis.AudioContext || globalThis.webkitAudioContext,
  target = globalThis.document,
  volume = 0.075
} = {}) {
  let context = null;
  let destroyed = false;

  function getContext() {
    if (destroyed) return null;
    if (context) return context;
    const AudioContextClass = getAudioContext();
    if (typeof AudioContextClass !== "function") return null;
    try {
      context = new AudioContextClass();
      return context;
    } catch {
      return null;
    }
  }

  async function unlock() {
    const audio = getContext();
    if (!audio) return false;
    if (audio.state === "running") return true;
    try {
      await audio.resume();
      return audio.state === "running";
    } catch {
      return false;
    }
  }

  // iOS Safari requires audio playback to be unlocked during a user gesture.
  const unlockFromGesture = () => { void unlock(); };
  target?.addEventListener?.("pointerdown", unlockFromGesture, { once: true, passive: true });
  target?.addEventListener?.("keydown", unlockFromGesture, { once: true });

  function playTone(audio, frequency, startAt, duration, peak) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function play() {
    const audio = getContext();
    if (!audio) return false;
    const playChime = () => {
      if (destroyed || audio.state !== "running") return false;
      const startAt = audio.currentTime + 0.015;
      // Three soft, ascending notes; generated locally without downloading audio.
      [659.25, 783.99, 987.77].forEach((frequency, index) => {
        playTone(audio, frequency, startAt + index * 0.13, 0.34, Math.max(0.001, Math.min(0.12, volume)));
      });
      return true;
    };
    if (audio.state === "running") return playChime();
    return unlock().then(ready => ready ? playChime() : false);
  }

  return {
    play,
    unlock,
    isSupported: () => Boolean(getContext()),
    destroy() {
      destroyed = true;
      target?.removeEventListener?.("pointerdown", unlockFromGesture);
      target?.removeEventListener?.("keydown", unlockFromGesture);
      try { if (context && context.state !== "closed") void context.close(); } catch {}
      context = null;
    }
  };
}
