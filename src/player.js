// Keeps the drums in time.
//
// setTimeout is far too sloppy to play music with, so nothing here is played
// "now". A timer wakes up every 25 ms and hands the audio clock everything
// that is due in the next ~120 ms with exact timestamps. The screen is told
// about each stroke as well, and shows it when the audio clock gets there.
(function (T) {
  'use strict';

  const AHEAD = 0.12;       // seconds queued ahead of the audio clock
  const TICK_MS = 25;
  const DRONE = 0.11;

  // a small room, so the drums are not bone dry
  function room(ctx) {
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 12345;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = (seed / 2147483648 - 1) * Math.exp(-i / (ctx.sampleRate * 0.16));
      }
    }
    return buf;
  }

  function rig(ctx, sa) {
    const bus = ctx.createGain();
    const verb = ctx.createConvolver();
    const wet = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const master = ctx.createGain();
    verb.buffer = room(ctx);
    wet.gain.value = 0.16;
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    master.gain.value = 0.9;
    bus.connect(comp);
    bus.connect(verb);
    verb.connect(wet);
    wet.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    return {
      tabla: T.makeTabla(ctx, bus, sa),
      tanpura: T.makeTanpura(ctx, bus, sa),
    };
  }

  function velocity(ev) {
    if (ev.accent) return 1;
    return ev.sam ? 0.86 : 0.72;
  }

  function Player() {
    this.ctx = null;
    this.rig = null;
    this.prog = null;
    this.playing = false;
    this.loop = true;
    this.drone = false;
    this.onstop = null;

    this.t0 = 0;            // audio time of matra 0 of the pass being queued
    this.i = 0;             // next event to queue
    this.pass = 0;
    this.queued = 0;        // audio time of the last stroke handed over
    this.fired = [];        // strokes the screen has not shown yet
    this.timer = null;
  }

  Player.prototype.start = function () {
    if (this.playing || !this.prog || this.prog.length <= 0) return false;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.rig = rig(this.ctx, this.prog.sa);
    }
    this.ctx.resume();
    this.rig.tanpura.level(this.drone ? DRONE : 0);
    this.t0 = this.ctx.currentTime + 0.1;
    this.i = 0;
    this.pass = 0;
    this.queued = 0;
    this.fired = [];
    this.playing = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    return true;
  };

  Player.prototype.stop = function () {
    if (!this.playing) return;
    clearInterval(this.timer);
    this.playing = false;
    this.fired = [];
    this.rig.tanpura.level(0);
    if (this.onstop) this.onstop();
  };

  Player.prototype.setDrone = function (on) {
    this.drone = on;
    if (this.playing) this.rig.tanpura.level(on ? DRONE : 0);
  };

  // Swap in a new program. If we are playing, carry on from the same matra
  // so that editing does not restart the music.
  Player.prototype.load = function (prog) {
    const old = this.prog;
    this.prog = prog;
    if (this.rig) {
      this.rig.tabla.tune(prog.sa);
      this.rig.tanpura.tune(prog.sa);
    }
    if (!this.playing || !old) return;
    if (prog.length <= 0) { this.stop(); return; }

    const now = this.ctx.currentTime;
    let m = (now - this.t0) / (60 / old.bpm);
    m = ((m % prog.length) + prog.length) % prog.length;
    this.t0 = now - m * (60 / prog.bpm);
    this.i = 0;
    while (this.i < prog.events.length && prog.events[this.i].t < m) this.i++;
  };

  Player.prototype.tick = function () {
    const p = this.prog, ctx = this.ctx;
    const spm = 60 / p.bpm;
    const horizon = ctx.currentTime + AHEAD;
    if (this.drone) this.rig.tanpura.fill(horizon + 1);

    for (;;) {
      const ev = p.events[this.i];

      // A stroke marked `tail` is a tihai landing on the sam after the last
      // line. Going round again, the first bol of the piece is that sam.
      const passDone = !ev || (ev.tail && this.loop && p.startsOnSam);
      if (passDone) {
        const end = this.t0 + p.length * spm;
        if (!this.loop) {
          if (ctx.currentTime > end + 1.2) this.stop();     // let the last stroke ring out
          return;
        }
        if (end > horizon) return;
        this.t0 = end;
        this.i = 0;
        this.pass++;
        continue;
      }

      const when = this.t0 + ev.t * spm;
      if (when > horizon) return;
      if (when > this.queued) {     // after a load() some of these have been played already
        const v = velocity(ev);
        for (const s of ev.strokes) this.rig.tabla.hit(s, when, v);
        this.fired.push({ ev, when });
        this.queued = when;
      }
      this.i++;
    }
  };

  // Strokes whose moment has come, for the screen.
  Player.prototype.due = function () {
    const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    const out = [];
    while (this.fired.length && this.fired[0].when <= now) out.push(this.fired.shift().ev);
    return out;
  };

  // How many matras into the composition we are, as heard.
  Player.prototype.where = function () {
    const p = this.prog;
    const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    let m = (now - this.t0) / (60 / p.bpm);
    // the scheduler moves t0 to the next pass slightly before we get there
    if (m < 0) m = this.pass > 0 ? m + p.length : 0;
    return m;
  };

  // ---- export -------------------------------------------------------------

  T.renderOffline = function (prog, opts) {
    const spm = 60 / prog.bpm;
    const lead = 0.05;
    const seconds = lead + prog.length * spm + 2.2;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Offline(2, Math.ceil(seconds * 44100), 44100);
    const r = rig(ctx, prog.sa);
    if (opts && opts.drone) {
      r.tanpura.setNow(DRONE);
      r.tanpura.fill(seconds - 1.5);
    }
    for (const ev of prog.events) {
      for (const s of ev.strokes) r.tabla.hit(s, lead + ev.t * spm, velocity(ev));
    }
    return ctx.startRendering();
  };

  T.toWav = function (buf) {
    const ch = buf.numberOfChannels, n = buf.length, bytes = n * ch * 2;
    const view = new DataView(new ArrayBuffer(44 + bytes));
    const tag = (at, s) => { for (let i = 0; i < 4; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); view.setUint32(4, 36 + bytes, true);
    tag(8, 'WAVE'); tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);                    // PCM
    view.setUint16(22, ch, true);
    view.setUint32(24, buf.sampleRate, true);
    view.setUint32(28, buf.sampleRate * ch * 2, true);
    view.setUint16(32, ch * 2, true);
    view.setUint16(34, 16, true);
    tag(36, 'data'); view.setUint32(40, bytes, true);

    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let at = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        at += 2;
      }
    }
    return new Blob([view], { type: 'audio/wav' });
  };

  T.Player = Player;
})(window.Theka = window.Theka || {});
