// theka, the language: text in, timed strokes out.
//
//   taal teentaal
//   bpm 100
//   dha dhin dhin dha | dha dhin dhin dha
//   theka = dha ge na ti          <- name a phrase, use it later
//   [dha ge] tirakita             <- [ ] squeezes things into one matra
//   (dha ti ta)*3  (dha ti ta)@2  <- repeat, play at double speed
//   tihai(dha tirakita dha)       <- three times, landing on sam
//
// No DOM in here so the tests can run it under node.
(function (T) {
  'use strict';

  const TAALS = (typeof require === 'function' ? require('./taals.js') : T).TAALS;

  // ---- time ---------------------------------------------------------------
  // Positions are counted in matras and kept as exact fractions. Triplets
  // inside a double-speed tihai turn into things like 7/12 very quickly, and
  // "does this land on sam" has to be a yes or no, not 15.999999.

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const r = a % b; a = b; b = r; }
    return a || 1;
  }
  function F(n, d) {
    if (d === undefined) d = 1;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  const ZERO = F(0), ONE = F(1);
  const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => F(a.n * b.n, a.d * b.d);
  const div = (a, b) => F(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d - b.n * a.d;
  const num = a => a.n / a.d;
  const key = a => a.n + '/' + a.d;

  // a mod m for a whole number m, always in [0, m)
  function mod(a, m) {
    return sub(a, F(Math.floor(a.n / (a.d * m)) * m));
  }

  function show(a) {
    const whole = Math.floor(a.n / a.d), r = a.n - whole * a.d;
    if (!r) return String(whole);
    const nice = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔' }[r + '/' + a.d];
    if (nice) return (whole || '') + nice;
    return whole ? whole + ' ' + r + '/' + a.d : r + '/' + a.d;
  }

  // ---- bols ---------------------------------------------------------------
  // What each syllable does to the two drums. The right hand plays the dayan:
  // na, tin and tun ring, te and ra are closed. The left hand plays the bayan:
  // ge is the open bass stroke, ke is the flat slap.

  const BOLS = {
    dha: ['na', 'ge'],
    dhin: ['tin', 'ge'],
    dhi: ['tin', 'ge'],
    ta: ['na'],
    na: ['na'],
    tin: ['tin'],
    tun: ['tun'],
    tu: ['tun'],
    ti: ['te'],
    te: ['te'],
    ra: ['ra'],
    ge: ['ge'],
    ghe: ['ge'],
    ga: ['ge'],
    ke: ['ke'],
    ka: ['ke'],
    ki: ['ke'],
    kat: ['ke'],
  };
  const SYLLABLES = Object.keys(BOLS).sort((a, b) => b.length - a.length);

  // "dhage" -> dha ge, "tirakita" -> ti ra ki ta. Longest syllable first, and
  // back off when that leaves something unreadable ("dhina" is dhi+na, not dhin+a).
  function splitBol(word) {
    if (word === '') return [];
    for (const s of SYLLABLES) {
      if (!word.startsWith(s)) continue;
      const rest = splitBol(word.slice(s.length));
      if (rest) return [s].concat(rest);
    }
    return null;
  }

  // ---- lexer --------------------------------------------------------------

  const SYMBOLS = '[]()*@=|!-';

  function lexLine(text, line) {
    const toks = [];
    const push = (type, str, col) => toks.push({ type, text: str, col, len: str.length, line });
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === ' ' || c === '\t') { i++; continue; }

      // "sa c#" - the one place where # is not a comment
      const prev = toks[toks.length - 1];
      if (prev && toks.length === 1 && prev.text.toLowerCase() === 'sa') {
        const m = /^[a-g][#b]?(?![a-z0-9_])/i.exec(text.slice(i));
        if (m) { push('note', m[0], i); i += m[0].length; continue; }
      }

      if (c === '#' || text.startsWith('//', i)) { push('comment', text.slice(i), i); break; }

      let m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
      if (m) { push('word', m[0], i); i += m[0].length; continue; }
      m = /^\d+(\.\d+)?/.exec(text.slice(i));
      if (m) { push('num', m[0], i); i += m[0].length; continue; }
      if (SYMBOLS.includes(c)) { push('sym', c, i); i++; continue; }
      push('bad', c, i); i++;
    }
    return toks;
  }

  function fail(tok, msg) {
    const e = new Error(msg);
    e.tok = tok;
    return e;
  }

  // ---- settings -----------------------------------------------------------

  const NOTE_STEPS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  // Dayans live roughly between G below middle C and the F# above it, so note
  // names are read into that octave.
  function noteToHz(name) {
    let step = NOTE_STEPS[name[0].toLowerCase()];
    if (name[1] === '#') step++;
    if (name[1] === 'b') step--;
    let midi = 60 + step;
    if (step >= 7) midi -= 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function noExtras(toks, n) {
    if (toks[n]) throw fail(toks[n], 'did not expect "' + toks[n].text + '" after the setting');
  }

  const SETTINGS = {
    taal(prog, toks) {
      const t = toks[1];
      const name = t && t.type === 'word' ? t.text.toLowerCase() : '';
      if (!TAALS[name]) {
        throw fail(t || toks[0], 'I know these taals: ' + Object.keys(TAALS).join(', '));
      }
      noExtras(toks, 2);
      prog.taalKey = name;
      prog.taal = TAALS[name];
    },
    bpm(prog, toks) {
      const t = toks[1];
      const v = t && t.type === 'num' ? Number(t.text) : NaN;
      if (!(v >= 20 && v <= 400)) throw fail(t || toks[0], 'bpm wants a number between 20 and 400');
      noExtras(toks, 2);
      prog.bpm = v;
    },
    sa(prog, toks) {
      const t = toks[1];
      if (t && t.type === 'note') prog.sa = noteToHz(t.text);
      else if (t && t.type === 'num' && +t.text >= 100 && +t.text <= 600) prog.sa = Number(t.text);
      else throw fail(t || toks[0], 'sa wants a note (c, c#, d ... b) or a pitch in Hz between 100 and 600');
      noExtras(toks, 2);
    },
  };

  const KEYWORDS = Object.keys(SETTINGS).concat('tihai');

  // ---- parser -------------------------------------------------------------
  // One line of tokens -> a list of nodes. Words stay unresolved until the
  // line is played, because a phrase can be defined further down the page.

  function parse(toks, start) {
    let i = start;

    function seq(open) {
      const nodes = [];
      for (;;) {
        const t = toks[i];
        if (!t) {
          if (open) throw fail(open, 'this "' + open.text + '" is never closed');
          return nodes;
        }
        if (t.type === 'sym' && (t.text === ')' || t.text === ']')) {
          const want = open && (open.text === '[' ? ']' : ')');
          if (!open) throw fail(t, 'there is no open bracket for this "' + t.text + '"');
          if (t.text !== want) throw fail(t, 'expected "' + want + '" here, to close the "' + open.text + '"');
          i++;
          return nodes;
        }
        if (t.type === 'sym' && t.text === '|') { i++; continue; }
        nodes.push(postfix(atom()));
      }
    }

    function atom() {
      const t = toks[i++];
      if (t.type === 'word') {
        const w = t.text.toLowerCase();
        if (w === 'tihai') {
          const p = toks[i];
          if (!p || p.text !== '(') throw fail(t, 'write it as tihai( ... ) with the phrase inside the brackets');
          i++;
          return { k: 'tihai', body: seq(p), tok: t };
        }
        if (SETTINGS[w]) throw fail(t, '"' + w + '" is a setting, it goes on a line of its own');
        return { k: 'word', text: w, accent: false, tok: t };
      }
      if (t.type === 'sym') {
        if (t.text === '-') return { k: 'rest', tok: t };
        if (t.text === '[') return { k: 'squeeze', body: seq(t), tok: t };
        if (t.text === '(') return { k: 'group', body: seq(t), tok: t };
      }
      throw fail(t, 'did not expect "' + t.text + '" here');
    }

    function postfix(node) {
      for (;;) {
        const t = toks[i];
        if (!t || t.type !== 'sym') return node;
        if (t.text === '!') {
          if (node.k !== 'word') throw fail(t, '"!" accents one bol, so it goes right after a bol');
          node.accent = true;
          i++;
        } else if (t.text === '*' || t.text === '@') {
          const n = toks[i + 1];
          const max = t.text === '*' ? 64 : 16;
          const v = n && n.type === 'num' && /^\d+$/.test(n.text) ? Number(n.text) : 0;
          if (v < 1 || v > max) {
            throw fail(n || t, '"' + t.text + '" needs a whole number from 1 to ' + max + ' after it, like ' + t.text + '2');
          }
          node = { k: t.text === '*' ? 'rep' : 'speed', of: node, n: v };
          i += 2;
        } else {
          return node;
        }
      }
    }

    return seq(null);
  }

  // ---- playing the tree out into events ------------------------------------

  const MAX_STROKES = 20000;

  function emit(out, env, tok, ev) {
    if (++env.count > MAX_STROKES) throw fail(tok, 'this comes to more than ' + MAX_STROKES + ' strokes, which is too many');
    out.push(ev);
  }

  function runSeq(nodes, pos, unit, out, env) {
    for (const n of nodes) pos = run(n, pos, unit, out, env);
    return pos;
  }

  // Plays one node starting at `pos`, where a plain bol lasts `unit` matras.
  // Returns the position afterwards.
  function run(node, pos, unit, out, env) {
    switch (node.k) {
      case 'rest':
        return add(pos, unit);

      case 'word': {
        const syl = splitBol(node.text);
        if (syl) {
          const step = div(unit, F(syl.length));
          syl.forEach((s, j) => emit(out, env, node.tok, {
            t: add(pos, mul(step, F(j))),
            bol: s,
            strokes: BOLS[s],
            accent: node.accent,
            landing: false,
            line: node.tok.line, col: node.tok.col, len: node.tok.len,
          }));
          return add(pos, unit);
        }
        const def = env.defs[node.text];
        if (!def) throw fail(node.tok, unknownWord(node.text, env.defs));
        if (node.accent) throw fail(node.tok, '"!" accents one bol, and "' + node.text + '" is a whole phrase');
        if (env.stack.includes(node.text)) throw fail(node.tok, '"' + node.text + '" ends up containing itself');
        env.stack.push(node.text);
        try { return runSeq(def.nodes, pos, unit, out, env); }
        finally { env.stack.pop(); }
      }

      case 'group':
        return runSeq(node.body, pos, unit, out, env);

      case 'rep':
        for (let r = 0; r < node.n; r++) pos = run(node.of, pos, unit, out, env);
        return pos;

      case 'speed':
        return run(node.of, pos, div(unit, F(node.n)), out, env);

      case 'squeeze': {
        // play the inside on its own clock, then shrink it to fit one unit
        const tmp = [];
        let len;
        env.fixed++;
        try { len = runSeq(node.body, ZERO, ONE, tmp, env); }
        finally { env.fixed--; }
        if (!len.n) throw fail(node.tok, 'there is nothing inside this [ ]');
        const k = div(unit, len);
        for (const e of tmp) out.push(Object.assign({}, e, { t: add(pos, mul(e.t, k)) }));
        return add(pos, unit);
      }

      case 'tihai':
        return tihai(node, pos, unit, out, env);
    }
    throw new Error('unknown node ' + node.k);
  }

  // A tihai is a phrase played three times so that its very last stroke falls
  // on sam. With the phrase L matras long, its last stroke at offset d inside
  // it, and a pause g between repetitions, the last stroke of all lands at
  //
  //     2 * (L + g) + d
  //
  // matras from where we start. That has to equal the distance to a sam, so
  //
  //     g = (toSam + rounds * N - d - 2L) / 2
  //
  // and we take the nearest sam that does not make g negative.
  function tihai(node, pos, unit, out, env) {
    if (env.fixed) {
      throw fail(node.tok, 'a tihai has to know where it is in the cycle, so it cannot sit inside [ ] or another tihai');
    }
    const tmp = [];
    let len;
    env.fixed++;
    try { len = runSeq(node.body, ZERO, unit, tmp, env); }
    finally { env.fixed--; }
    if (!tmp.length) throw fail(node.tok, 'tihai( ) needs at least one bol inside');

    let last = tmp[0].t;
    for (const e of tmp) if (cmp(e.t, last) > 0) last = e.t;

    const N = env.taal.matras;
    const toSam = mod(sub(ZERO, pos), N);
    const need = add(last, mul(len, F(2)));
    let rounds = 0, gap;
    for (;; rounds++) {
      gap = div(sub(add(toSam, F(rounds * N)), need), F(2));
      if (gap.n >= 0) break;
    }

    const stride = add(len, gap);
    for (let r = 0; r < 3; r++) {
      const at = add(pos, mul(stride, F(r)));
      for (const e of tmp) {
        out.push(Object.assign({}, e, {
          t: add(at, e.t),
          landing: r === 2 && cmp(e.t, last) === 0,
        }));
      }
    }

    const skipped = toSam.n ? rounds : rounds - 1;
    env.notes.push({
      line: node.tok.line,
      msg: 'tihai from matra ' + show(add(mod(pos, N), ONE)) +
        ': phrase is ' + show(len) + ', ' +
        (gap.n ? 'pause of ' + show(gap) + ' between' : 'no pause needed (bedam)') +
        (skipped > 0 ? ', runs past ' + skipped + ' sam to fit' : ''),
    });

    return add(pos, add(mul(stride, F(2)), last));
  }

  function editDistance(a, b) {
    let row = [];
    for (let j = 0; j <= b.length; j++) row[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) {
        next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      row = next;
    }
    return row[b.length];
  }

  function unknownWord(word, defs) {
    let best = null, bestD = 3;
    for (const cand of Object.keys(defs).concat(SYLLABLES)) {
      const d = editDistance(word, cand);
      if (d < bestD && d < Math.max(word.length, cand.length) / 2 + 0.5) { best = cand; bestD = d; }
    }
    return '"' + word + '" is not a bol or a phrase I know' + (best ? ' - did you mean "' + best + '"?' : '');
  }

  // ---- compile ------------------------------------------------------------

  function compile(src) {
    const prog = {
      taalKey: 'teentaal',
      taal: TAALS.teentaal,
      bpm: 100,
      sa: noteToHz('c#'),
      events: [],
      length: 0,
      lengthText: '0',
      startsOnSam: false,
      errors: [],
      warnings: [],
      notes: [],
    };
    const report = e => {
      if (!e.tok) throw e;
      prog.errors.push({ line: e.tok.line, col: e.tok.col, len: e.tok.len, msg: e.message });
    };

    // pass 1: settings, phrase definitions, and parse everything else
    const defs = {};
    const body = [];
    src.split(/\r?\n/).forEach((text, n) => {
      const toks = lexLine(text, n + 1).filter(t => t.type !== 'comment');
      if (!toks.length) return;
      try {
        const bad = toks.find(t => t.type === 'bad');
        if (bad) throw fail(bad, 'I do not know what "' + bad.text + '" means here');

        const head = toks[0];
        const word = head.type === 'word' ? head.text.toLowerCase() : '';
        const isDef = word && toks[1] && toks[1].text === '=';

        if (isDef) {
          if (KEYWORDS.includes(word)) throw fail(head, '"' + word + '" already means something, pick another name');
          if (splitBol(word)) throw fail(head, '"' + word + '" reads as a bol, pick another name for the phrase');
          if (defs[word]) throw fail(head, '"' + word + '" is already defined on line ' + defs[word].line);
          if (toks.length < 3) throw fail(toks[1], 'nothing after the "="');
          defs[word] = { line: n + 1, nodes: parse(toks, 2) };
        } else if (SETTINGS[word]) {
          SETTINGS[word](prog, toks);
        } else {
          body.push(parse(toks, 0));
        }
      } catch (e) { report(e); }
    });

    // pass 2: lay the lines end to end
    const env = { taal: prog.taal, defs, notes: prog.notes, stack: [], fixed: 0, count: 0 };
    const out = [];
    let pos = ZERO;
    for (const nodes of body) {
      const mark = out.length, noteMark = prog.notes.length;
      try {
        pos = runSeq(nodes, pos, ONE, out, env);
      } catch (e) {
        out.length = mark;
        prog.notes.length = noteMark;
        env.stack.length = 0;
        env.fixed = 0;
        report(e);
      }
    }

    out.sort((a, b) => cmp(a.t, b.t));

    // The last stroke of a tihai sits exactly on a sam. If the next line starts
    // on that same sam its first bol takes over, the way the theka's dha does.
    const taken = new Set(out.filter(e => !e.landing).map(e => key(e.t)));
    const N = prog.taal.matras;
    for (const e of out) {
      if (e.landing && taken.has(key(e.t))) continue;
      prog.events.push({
        t: num(e.t),
        bol: e.bol,
        strokes: e.strokes,
        accent: e.accent,
        sam: mod(e.t, N).n === 0,
        tail: cmp(e.t, pos) >= 0,
        line: e.line, col: e.col, len: e.len,
      });
    }

    prog.length = num(pos);
    prog.lengthText = show(pos);
    prog.startsOnSam = prog.events.length > 0 && prog.events[0].t === 0;

    const over = mod(pos, N);
    if (over.n && prog.events.length) {
      prog.warnings.push({
        msg: 'This is ' + show(pos) + ' matras long and ' + prog.taal.name + ' has ' + N +
          ', so it stops ' + show(over) + ' past sam. On repeat it will drift against the cycle.',
      });
    }
    return prog;
  }

  T.compile = compile;
  T.lexLine = lexLine;
  T.splitBol = splitBol;
  T.noteToHz = noteToHz;
  T.BOLS = BOLS;
  T.KEYWORDS = KEYWORDS;
})(typeof module !== 'undefined' ? module.exports : (window.Theka = window.Theka || {}));
