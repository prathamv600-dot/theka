// The drums. No samples anywhere: every stroke is built out of sine partials
// and filtered noise when it is needed.
//
// Why this works at all: a plain drum skin has overtones that are not in tune
// with each other, which is why a snare has no note. The black patch on a tabla
// (the syahi) loads the middle of the skin and pulls the overtones into a
// near-harmonic series, 1 : 2 : 3 : 4 : 5. C.V. Raman worked this out in the
// 1920s and 30s. So the dayan can be faked surprisingly well with five sines,
// and the different strokes are mostly different mixes of the same five:
//
//   tun  open hand, whole skin moves    -> mostly the fundamental
//   tin  soft tap on the patch          -> fundamental + a bit of the 2nd
//   na   ring finger damps the middle   -> fundamental nearly gone, 2nd and 3rd ring
//   te   flat fingers, kept on the skin -> no ring, just the slap
//
// The bayan is a different animal: one low note, bent upwards by the heel of
// the hand pressing into the skin after the stroke.
(function (T) {
  'use strict';

  // small seeded random so an exported WAV is the same every time
  function mulberry(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noiseBuffer(ctx) {
    const rand = mulberry(1980);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
    return buf;
  }

  // [harmonic, level, decay in seconds]
  const RINGING = {
    na:  { partials: [[1, 0.06, 0.09], [2, 1.0, 0.17], [3, 0.5, 0.12], [4, 0.2, 0.08], [5, 0.08, 0.05]], tick: [3200, 0.45], level: 0.26 },
    tin: { partials: [[1, 1.0, 0.30], [2, 0.45, 0.20], [3, 0.1, 0.09]], tick: [2400, 0.22], level: 0.28 },
    tun: { partials: [[1, 1.0, 0.50], [2, 0.18, 0.22]], tick: [1500, 0.12], level: 0.32 },
  };

  T.makeTabla = function (ctx, out, sa) {
    const noise = noiseBuffer(ctx);
    const rand = mulberry(16);
    const ringing = { dayan: null, bayan: null };
    let pitch = sa || 277.18;

    // Each stroke goes through its own gain so the next stroke on the same
    // skin can kill it. Without this fast passages turn into a wash, a real
    // hand landing on the head stops whatever was ringing.
    function head(drum, when) {
      const g = ctx.createGain();
      g.connect(out);
      if (ringing[drum]) ringing[drum].gain.setTargetAtTime(0, when, 0.006);
      ringing[drum] = g;
      return g;
    }

    function partial(dest, freq, level, decay, when) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(level, when + 0.002);
      g.gain.setTargetAtTime(0, when + 0.002, decay);
      osc.connect(g);
      g.connect(dest);
      osc.start(when);
      osc.stop(when + decay * 7 + 0.01);
      return osc;
    }

    function burst(dest, when, type, freq, q, level, decay) {
      const src = ctx.createBufferSource();
      const filt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      filt.type = type;
      filt.frequency.value = freq;
      filt.Q.value = q;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(level, when + 0.001);
      g.gain.setTargetAtTime(0, when + 0.001, decay);
      src.connect(filt);
      filt.connect(g);
      g.connect(dest);
      src.start(when, rand() * 0.5);
      src.stop(when + decay * 7 + 0.01);
    }

    const strokes = {
      ring(name, when, vel) {
        const spec = RINGING[name];
        const dest = head('dayan', when);
        for (const [h, level, decay] of spec.partials) {
          // a harder hit is brighter, not just louder
          const bright = Math.pow(vel, 1 + 0.35 * (h - 1));
          partial(dest, pitch * h, spec.level * level * bright, decay, when);
        }
        burst(dest, when, 'highpass', spec.tick[0], 0.7, spec.tick[1] * spec.level * vel, 0.004);
      },
      na(when, vel) { strokes.ring('na', when, vel); },
      tin(when, vel) { strokes.ring('tin', when, vel); },
      tun(when, vel) { strokes.ring('tun', when, vel); },

      te(when, vel) {
        const dest = head('dayan', when);
        burst(dest, when, 'bandpass', 1050, 1.4, 1.0 * vel, 0.016);
        partial(dest, pitch * 1.5, 0.07 * vel, 0.02, when);
      },
      ra(when, vel) {
        const dest = head('dayan', when);
        burst(dest, when, 'bandpass', 1650, 1.6, 0.85 * vel, 0.012);
      },

      ge(when, vel) {
        const dest = head('bayan', when);
        const low = pitch * 0.3;
        // the bend: up as the wrist digs in, then relaxing back
        [[1, 0.5, 0.30], [2, 0.14, 0.13]].forEach(([h, level, decay]) => {
          const osc = partial(dest, low * h, level * vel, decay, when);
          osc.frequency.setValueAtTime(low * h * 0.94, when);
          osc.frequency.linearRampToValueAtTime(low * h * (1.12 + 0.12 * vel), when + 0.085);
          osc.frequency.exponentialRampToValueAtTime(low * h * 1.02, when + 0.45);
        });
        burst(dest, when, 'lowpass', 320, 0.7, 0.4 * vel, 0.007);
      },
      ke(when, vel) {
        const dest = head('bayan', when);
        burst(dest, when, 'bandpass', 720, 0.9, 0.7 * vel, 0.02);
        partial(dest, 150, 0.22 * vel, 0.018, when);
      },
    };

    return {
      // vel 0..1. A little is added or taken away so that no two hits are identical.
      hit(stroke, when, vel) {
        const v = Math.min(1, vel * (0.9 + 0.2 * rand()));
        const t = Math.max(ctx.currentTime, when + (rand() - 0.5) * 0.005);
        strokes[stroke](t, v);
      },
      tune(hz) { pitch = hz; },
    };
  };

  // Tanpura drone, four strings: Pa, Sa, Sa and the low Sa.
  // The real instrument's curved bridge makes the upper harmonics swell a
  // moment after the pluck. Here that is a bright wave pushed through a
  // lowpass that opens up late.
  T.makeTanpura = function (ctx, out, sa) {
    const HARMONICS = 26;
    const re = new Float32Array(HARMONICS + 1), im = new Float32Array(HARMONICS + 1);
    for (let n = 1; n <= HARMONICS; n++) im[n] = Math.pow(n, -0.8) * (0.7 + 0.3 * Math.cos(n * 1.9));
    const wave = ctx.createPeriodicWave(re, im);
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(out);

    const GAP = 0.92;         // seconds between plucks
    let pitch = sa || 277.18;
    let next = 0, string = 0;

    function pluck(freq, when) {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2.5;
      lp.frequency.setValueAtTime(350, when);
      lp.frequency.linearRampToValueAtTime(2600, when + 0.8);
      lp.frequency.setTargetAtTime(600, when + 0.8, 1.4);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.5, when + 0.12);
      g.gain.setTargetAtTime(0, when + 0.12, 1.5);
      for (const detune of [-3, 4]) {
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(wave);
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(lp);
        osc.start(when);
        osc.stop(when + 8);
      }
      lp.connect(g);
      g.connect(bus);
    }

    return {
      // queue plucks up to `until` (audio clock seconds)
      fill(until) {
        if (next < ctx.currentTime) next = ctx.currentTime + 0.03;
        while (next < until) {
          const ratios = [0.375, 0.5, 0.5, 0.25];
          pluck(pitch * ratios[string % 4], next);
          string++;
          next += GAP;
        }
      },
      level(v) { bus.gain.setTargetAtTime(v, ctx.currentTime, 0.4); },
      setNow(v) { bus.gain.value = v; },
      tune(hz) { pitch = hz; },
    };
  };
})(window.Theka = window.Theka || {});
