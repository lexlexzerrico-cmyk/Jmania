// Short synthesized sound effects (Web Audio, no files). Off when the "Sound effects" setting is off.
let ctx = null;
const enabled = () => { try { return (JSON.parse(localStorage.getItem("repforge-prefs") || "{}").sfx) !== false; } catch (e) { return true; } };

function tone(freq, start, dur, { type = "sine", gain = 0.14, slide = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

const SOUNDS = {
  coin:    () => { tone(988, 0, 0.09, { type: "square", gain: 0.06 }); tone(1319, 0.07, 0.18, { type: "square", gain: 0.06 }); },
  set:     () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.22, { type: "triangle", gain: 0.12 })); },
  unlock:  () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.3, { type: "sine", gain: 0.1 })); },
  levelup: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.35, { type: "triangle", gain: 0.12 })); tone(1047, 0.42, 0.6, { type: "sine", gain: 0.08 }); },
  boss:    () => { tone(110, 0, 0.5, { type: "sawtooth", gain: 0.08, slide: 0.5 }); tone(82, 0.12, 0.6, { type: "square", gain: 0.05, slide: 0.6 }); },
  error:   () => { tone(220, 0, 0.16, { type: "square", gain: 0.05, slide: 0.7 }); },
  tap:     () => { tone(660, 0, 0.05, { type: "sine", gain: 0.05 }); }
};

export function sfx(name) {
  if (!enabled() || !SOUNDS[name]) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    SOUNDS[name]();
  } catch (e) { /* sound is optional */ }
}
