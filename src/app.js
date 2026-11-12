// Glue: editor, buttons, the link in the address bar.
(function (T) {
  'use strict';

  const $ = id => document.getElementById(id);
  const src = $('src'), paint = $('paint'), msgs = $('msgs');
  const playBtn = $('play'), tempo = $('tempo'), tempoOut = $('tempoOut');
  const bolEl = $('bol'), countEl = $('count');

  const player = new T.Player();
  const wheel = T.makeWheel($('wheel'));

  let prog = T.compile('');     // the last version that compiled without errors
  let spans = new Map();        // "line:col" -> the <span> of that bol
  let lit = null;
  let dirty = true;

  // ---- the composition lives in the URL, so a link is a recording -----------

  function pack(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unpack(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function fromUrl() {
    const m = /^#c=(.+)$/.exec(location.hash);
    if (!m) return null;
    try { return unpack(m[1]); } catch (e) { return null; }
  }

  let urlTimer = 0;
  function toUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      try { history.replaceState(null, '', '#c=' + pack(src.value)); } catch (e) { /* file:// in some browsers */ }
    }, 400);
  }

  // ---- colouring ----------------------------------------------------------

  function esc(s) {
    return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function kind(tok) {
    switch (tok.type) {
      case 'comment': return 'c';
      case 'num': case 'note': return 'n';
      case 'bad': return 'bad';
      case 'sym': return tok.text === '-' ? 'rest' : 'p';
    }
    const w = tok.text.toLowerCase();
    if (T.KEYWORDS.includes(w)) return 'kw';
    return T.splitBol(w) ? 'bol' : 'name';
  }

  function repaint(text, errors) {
    const wrong = new Set(errors.map(e => e.line + ':' + e.col));
    const html = text.split('\n').map((line, n) => {
      let out = '', at = 0;
      for (const tok of T.lexLine(line, n + 1)) {
        const id = (n + 1) + ':' + tok.col;
        const cls = kind(tok) + (wrong.has(id) ? ' err' : '');
        out += esc(line.slice(at, tok.col)) +
          '<span class="' + cls + '"' + (cls.startsWith('bol') ? ' data-at="' + id + '"' : '') + '>' +
          esc(tok.text) + '</span>';
        at = tok.col + tok.len;
      }
      return out + esc(line.slice(at));
    }).join('\n');

    // the extra line keeps the copy as tall as the textarea when it ends in a newline
    paint.innerHTML = html + '\n ';
    spans = new Map();
    paint.querySelectorAll('[data-at]').forEach(el => spans.set(el.dataset.at, el));
    lit = null;
    paint.scrollTop = src.scrollTop;
    paint.scrollLeft = src.scrollLeft;
  }

  function line(cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    msgs.appendChild(d);
  }

  function showMessages(p) {
    msgs.textContent = '';
    p.errors.forEach(e => line('error', 'line ' + e.line + ': ' + e.msg));
    if (p.errors.length) {
      if (player.playing) line('info', 'still playing the last version that worked');
      return;
    }
    p.warnings.forEach(w => line('warning', w.msg));
    p.notes.forEach(n => line('note', 'line ' + n.line + ': ' + n.msg));
    if (!p.events.length) {
      line('info', 'nothing to play yet - try: dha dhin dhin dha');
      return;
    }
    const cycles = p.length / p.taal.matras;
    line('info', p.taal.name + ', ' + p.lengthText + ' matras' +
      (Number.isInteger(cycles) ? ' = ' + cycles + (cycles === 1 ? ' cycle' : ' cycles') : '') +
      ', ' + p.events.length + ' strokes');
  }

  function refresh() {
    const text = src.value;
    const next = T.compile(text);
    repaint(text, next.errors);
    showMessages(next);
    if (!next.errors.length) {
      prog = next;
      player.load(prog);
      tempo.value = prog.bpm;
      tempoOut.textContent = Math.round(prog.bpm);
    }
    if (!player.playing) idleFace();
    dirty = true;
  }

  function idleFace() {
    bolEl.textContent = prog.taal.name;
    countEl.textContent = prog.taal.matras + ' matras\n' + prog.taal.vibhag.join(' + ');
  }

  let typing = 0;
  src.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => { refresh(); toUrl(); }, 120);
  });
  src.addEventListener('scroll', () => {
    paint.scrollTop = src.scrollTop;
    paint.scrollLeft = src.scrollLeft;
  });

  // ---- transport ----------------------------------------------------------

  function toggle() {
    if (player.playing) { player.stop(); return; }
    if (player.start()) {
      playBtn.textContent = 'Stop';
      playBtn.classList.add('on');
    }
  }

  player.onstop = () => {
    playBtn.textContent = 'Play';
    playBtn.classList.remove('on');
    if (lit) lit.classList.remove('on');
    lit = null;
    idleFace();
    dirty = true;
  };

  playBtn.addEventListener('click', toggle);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggle(); }
  });

  $('loop').addEventListener('change', e => { player.loop = e.target.checked; });
  $('drone').addEventListener('change', e => { player.setDrone(e.target.checked); });

  // The text is the only source of truth, so the slider edits the "bpm" line.
  tempo.addEventListener('input', () => {
    const v = tempo.value;
    tempoOut.textContent = v;
    const lines = src.value.split('\n');
    const at = lines.findIndex(l => /^\s*bpm\b/i.test(l));
    if (at >= 0) {
      lines[at] = lines[at].replace(/^(\s*bpm\s*)[^\s#]*/i, '$1' + v);
    } else {
      const taalAt = lines.findIndex(l => /^\s*taal\b/i.test(l));
      lines.splice(taalAt + 1, 0, 'bpm ' + v);
    }
    src.value = lines.join('\n');
    refresh();
    toUrl();
  });

  // ---- examples, sharing, export --------------------------------------------

  const menu = $('examples');
  menu.add(new Option('examples...', ''));
  T.EXAMPLES.forEach((ex, i) => menu.add(new Option(ex.name, String(i))));
  menu.addEventListener('change', () => {
    if (menu.value === '') return;
    src.value = T.EXAMPLES[Number(menu.value)].text;
    src.scrollTop = 0;
    menu.value = '';
    refresh();
    toUrl();
  });

  function blink(btn, text) {
    const was = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = was; }, 1400);
  }

  $('share').addEventListener('click', e => {
    const url = location.href.split('#')[0] + '#c=' + pack(src.value);
    const done = () => blink(e.target, 'Copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link', url));
    } else {
      window.prompt('Copy this link', url);
    }
  });

  $('wav').addEventListener('click', e => {
    if (!prog.events.length) return;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Rendering...';
    T.renderOffline(prog, { drone: $('drone').checked }).then(buf => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(T.toWav(buf));
      a.download = prog.taalKey + '-' + Math.round(prog.bpm) + 'bpm.wav';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }).finally(() => {
      btn.disabled = false;
      btn.textContent = 'Save as .wav';
    });
  });

  // ---- every frame ----------------------------------------------------------

  function frame() {
    requestAnimationFrame(frame);
    if (!player.playing) {
      if (dirty || wheel.busy()) { wheel.draw(prog, null); dirty = false; }
      return;
    }

    const N = prog.taal.matras;
    const due = player.due();
    due.forEach((ev, i) => {
      const el = spans.get(ev.line + ':' + ev.col);
      if (lit && lit !== el) lit.classList.remove('on');
      if (el) el.classList.add('on');
      lit = el || null;
      bolEl.textContent = ev.bol;
      // coming back from a background tab there can be a pile of these; only ripple the newest
      if (i >= due.length - 2) wheel.pulse(ev, N);
    });

    const m = player.where();
    const cycles = Math.ceil(prog.length / N);
    const cycle = Math.min(Math.floor(m / N), cycles - 1);
    countEl.textContent = 'matra ' + (Math.floor(m - cycle * N) % N + 1) + ' of ' + N +
      (cycles > 1 ? '\ncycle ' + (cycle + 1) + ' of ' + cycles : '');
    wheel.draw(prog, m);
  }

  window.addEventListener('resize', () => { dirty = true; });

  src.value = fromUrl() || T.EXAMPLES[0].text;
  refresh();
  frame();
})(window.Theka);
