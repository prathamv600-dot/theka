// The taal drawn as a clock face. Sam is at twelve o'clock, the hand goes
// round once per cycle. Outer ring of dots is the right hand, inner ring the
// left. Dots fill in as they are played.
(function (T) {
  'use strict';

  const TAU = Math.PI * 2;

  // radii, as a share of the canvas width
  const R = { clap: 0.468, vibhag: 0.425, number: 0.385, dayan: 0.33, bayan: 0.255, hub: 0.2 };

  // stroke -> [which ring, dot radius in px, filled?]
  const DOT = {
    na: ['dayan', 4.5, true],
    tin: ['dayan', 4.5, true],
    tun: ['dayan', 5.5, true],
    te: ['dayan', 3, false],
    ra: ['dayan', 3, false],
    ge: ['bayan', 6, true],
    ke: ['bayan', 3.5, false],
  };

  const PULSE_MS = 420;

  T.makeWheel = function (canvas) {
    const g = canvas.getContext('2d');
    const ink = {};
    let pulses = [];

    function readColours() {
      const css = getComputedStyle(document.documentElement);
      ['ink', 'faint', 'line', 'sam', 'dayan', 'bayan'].forEach(k => {
        ink[k] = css.getPropertyValue('--' + k).trim();
      });
    }
    readColours();
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColours);
    }

    // keep the backing store at screen resolution; returns the css width
    function fit() {
      const w = canvas.getBoundingClientRect().width;
      const px = Math.round(w * (window.devicePixelRatio || 1));
      if (px && canvas.width !== px) canvas.width = canvas.height = px;
      return w;
    }

    // matra: how far into the composition we are, or null when stopped
    function draw(prog, matra) {
      const size = fit();
      if (!size) return;
      const scale = canvas.width / size;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.clearRect(0, 0, size, size);

      const taal = prog.taal, N = taal.matras, c = size / 2;
      const ang = m => (m / N) * TAU - TAU / 4;
      const pt = (m, r) => [c + Math.cos(ang(m)) * r * size, c + Math.sin(ang(m)) * r * size];

      const playing = matra !== null;
      const cycle = playing ? Math.floor(matra / N) : 0;
      const hand = playing ? matra - cycle * N : 0;

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineCap = 'round';

      // the two rings the dots sit on
      g.strokeStyle = ink.line;
      g.lineWidth = 1;
      for (const r of [R.dayan, R.bayan]) {
        g.beginPath();
        g.arc(c, c, r * size, 0, TAU);
        g.stroke();
      }

      // vibhags and their claps
      let m = 0;
      taal.vibhag.forEach((len, v) => {
        const clap = taal.claps[v];
        const isSam = m === 0, khali = clap === '0';
        g.beginPath();
        g.arc(c, c, R.vibhag * size, ang(m - 0.32), ang(m + len - 1 + 0.32));
        g.strokeStyle = isSam ? ink.sam : khali ? ink.faint : ink.ink;
        g.lineWidth = isSam ? 3 : 2;
        g.setLineDash(khali && !isSam ? [2, 5] : []);
        g.stroke();
        g.setLineDash([]);

        const [x, y] = pt(m, R.clap);
        g.fillStyle = isSam ? ink.sam : khali ? ink.faint : ink.ink;
        g.font = (isSam ? '700 17px ' : '600 13px ') + 'system-ui, sans-serif';
        g.fillText(clap, x, y);
        m += len;
      });

      // matra numbers
      for (let i = 0; i < N; i++) {
        const here = playing && Math.floor(hand) === i;
        const [x, y] = pt(i, R.number);
        g.fillStyle = here ? ink.ink : ink.faint;
        g.font = (here ? '700 ' : '400 ') + '11px system-ui, sans-serif';
        g.fillText(String(i + 1), x, y);
      }

      // this cycle's strokes
      for (const ev of prog.events) {
        if (Math.floor(ev.t / N + 1e-9) !== cycle) continue;
        const at = ev.t - cycle * N;
        g.globalAlpha = !playing || at <= hand ? 1 : 0.3;
        for (const s of ev.strokes) {
          const [ring, rad, filled] = DOT[s];
          const [x, y] = pt(at, R[ring]);
          g.beginPath();
          g.arc(x, y, rad, 0, TAU);
          if (filled) {
            g.fillStyle = ink[ring];
            g.fill();
          } else {
            g.strokeStyle = ink[ring];
            g.lineWidth = 1.5;
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;

      // ripples from strokes that just happened
      const now = performance.now();
      pulses = pulses.filter(p => now - p.born < PULSE_MS);
      for (const p of pulses) {
        const age = (now - p.born) / PULSE_MS;
        const [x, y] = pt(p.at, R[p.ring]);
        g.beginPath();
        g.arc(x, y, 6 + age * 15, 0, TAU);
        g.strokeStyle = ink[p.ring];
        g.globalAlpha = 0.6 * (1 - age);
        g.lineWidth = 2;
        g.stroke();
      }
      g.globalAlpha = 1;

      if (playing) {
        const [x0, y0] = pt(hand, R.hub);
        const [x1, y1] = pt(hand, R.vibhag);
        g.strokeStyle = g.fillStyle = ink.sam;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.beginPath();
        g.arc(x1, y1, 3.5, 0, TAU);
        g.fill();
      }
    }

    return {
      draw,
      pulse(ev, N) {
        const at = ev.t - Math.floor(ev.t / N + 1e-9) * N;
        for (const s of ev.strokes) pulses.push({ at, ring: DOT[s][0], born: performance.now() });
      },
      busy() { return pulses.length > 0; },
    };
  };
})(window.Theka = window.Theka || {});
