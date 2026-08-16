/**
 * Local sound effects generated with the Web Audio API.
 * Avoids external CDN audio files (which can fail with 403 / be blocked offline).
 */

let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

type Tone = { freq: number; start: number; duration: number; volume?: number };

const playTones = (tones: Tone[], type: OscillatorType = "sine") => {
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;
  tones.forEach(({ freq, start, duration, volume = 0.35 }) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now + start);
    osc.stop(now + start + duration + 0.02);
  });
};

/** Bright two-tone bell used for capacity / booking alerts. */
export const playAlertSound = () =>
  playTones([
    { freq: 880, start: 0, duration: 0.22 },
    { freq: 1320, start: 0.18, duration: 0.3 },
  ]);

/** Low buzzer used for check-in errors. */
export const playErrorSound = () =>
  playTones(
    [
      { freq: 320, start: 0, duration: 0.25, volume: 0.4 },
      { freq: 200, start: 0.22, duration: 0.35, volume: 0.4 },
    ],
    "square"
  );
