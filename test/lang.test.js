const test = require('node:test');
const assert = require('node:assert/strict');

const { compile, splitBol, lexLine, noteToHz } = require('../src/lang.js');
const { TAALS } = require('../src/taals.js');

const times = prog => prog.events.map(e => e.t);
const bols = prog => prog.events.map(e => e.bol).join(' ');
const clean = prog => {
  assert.deepEqual(prog.errors, []);
  return prog;
};

test('compound bols split into syllables', () => {
  assert.deepEqual(splitBol('dhage'), ['dha', 'ge']);
  assert.deepEqual(splitBol('tirakita'), ['ti', 'ra', 'ki', 'ta']);
  assert.deepEqual(splitBol('dhin'), ['dhin']);
  assert.deepEqual(splitBol('dhina'), ['dhi', 'na']);
  assert.deepEqual(splitBol('tuna'), ['tu', 'na']);
  assert.deepEqual(splitBol('kata'), ['ka', 'ta']);
  assert.equal(splitBol('theka'), null);
  assert.equal(splitBol('xyz'), null);
});

test('every built-in theka fills exactly one cycle', () => {
  for (const [key, taal] of Object.entries(TAALS)) {
    const prog = clean(compile('taal ' + key + '\n' + taal.theka));
    assert.equal(prog.length, taal.matras, key);
    assert.deepEqual(prog.warnings, [], key);
    assert.equal(taal.vibhag.reduce((a, b) => a + b), taal.matras, key + ' vibhag');
    assert.equal(taal.claps.length, taal.vibhag.length, key + ' claps');
  }
});

test('teentaal theka maps to the right strokes', () => {
  const prog = clean(compile(TAALS.teentaal.theka));
  assert.equal(prog.events.length, 16);
  assert.deepEqual(prog.events[0].strokes, ['na', 'ge']);   // dha
  assert.deepEqual(prog.events[1].strokes, ['tin', 'ge']);  // dhin
  assert.deepEqual(prog.events[9].strokes, ['tin']);        // tin, khali: no bayan
  assert.ok(prog.events[0].sam);
  assert.ok(!prog.events[1].sam);
});

test('bars, comments, blank lines and capitals are ignored', () => {
  const a = compile('Dha Dhin | DHIN dha   # hello\n\n// more\n  dha -  ');
  clean(a);
  assert.equal(bols(a), 'dha dhin dhin dha dha');
  assert.equal(a.length, 6);
});

test('[ ] squeezes into one matra, compounds subdivide', () => {
  assert.deepEqual(times(clean(compile('[dha ge] na'))), [0, 0.5, 1]);
  assert.deepEqual(times(clean(compile('tirakita dha'))), [0, 0.25, 0.5, 0.75, 1]);
  // nested: three things in a matra, the middle one split again
  assert.deepEqual(
    times(clean(compile('[dha [ti ta] dha]'))).map(t => Math.round(t * 6)),
    [0, 2, 3, 4]
  );
  assert.equal(compile('[dha - ] na').length, 2);
});

test('repeat and speed', () => {
  const p = clean(compile('(dha ti ta)@2'));
  assert.deepEqual(times(p), [0, 0.5, 1]);
  assert.equal(p.length, 1.5);
  assert.equal(clean(compile('(dha ti)*3')).events.length, 6);
  assert.equal(clean(compile('dha*4@2')).length, 2);
});

test('named phrases', () => {
  const p = clean(compile('a = dha ge\nb = a a na\nb b'));
  assert.equal(bols(p), 'dha ge dha ge na dha ge dha ge na');
  // definitions can come after use
  assert.equal(clean(compile('x x\nx = dha tin')).events.length, 4);
});

test('settings', () => {
  const p = clean(compile('taal rupak\nbpm 72\nsa d\ntin tin na'));
  assert.equal(p.taal.matras, 7);
  assert.equal(p.bpm, 72);
  assert.ok(Math.abs(p.sa - 293.66) < 0.01);
  assert.ok(Math.abs(compile('sa c# # tuning').sa - 277.18) < 0.01);
  assert.ok(Math.abs(noteToHz('a') - 220) < 1e-9);
  assert.equal(compile('sa 300').sa, 300);
  assert.equal(compile('bpm 9000').errors.length, 1);
  assert.match(compile('taal waltz').errors[0].msg, /teentaal/);
});

test('tihai from sam fills the whole cycle', () => {
  const p = clean(compile('tihai(dha ti ta)'));
  // 3 + 4 + 3 + 4 + 2 = 16, last ta on the next sam
  assert.deepEqual(times(p), [0, 1, 2, 7, 8, 9, 14, 15, 16]);
  assert.equal(p.length, 16);
  assert.ok(p.events[8].tail);
  assert.deepEqual(p.warnings, []);
});

test('tihai from the middle of a cycle (bedam)', () => {
  const p = clean(compile('dha dhin dhin dha dha dhin dhin dha\ntihai(dha tirakita dha)'));
  assert.equal(p.length, 16);
  assert.match(p.notes[0].msg, /matra 9/);
  assert.match(p.notes[0].msg, /bedam/);
  assert.equal(p.events[p.events.length - 1].t, 16);
});

test('the bol after a tihai takes over its landing stroke', () => {
  const p = clean(compile('tihai(dha ti ta)\ndhin na'));
  const onSam = p.events.filter(e => e.t === 16);
  assert.equal(onSam.length, 1);
  assert.equal(onSam[0].bol, 'dhin');
  assert.equal(p.length, 18);
});

test('tihai with a half-matra pause', () => {
  const p = clean(compile('dha*8\ntihai((dha dha te te dha)@2)'));
  assert.match(p.notes[0].msg, /pause of ½/);
  assert.equal(p.length, 16);
});

test('a tihai always lands on sam, wherever it starts', () => {
  const phrases = ['dha', 'dha ti ta', 'dha tirakita dha -', '[dha ge na] dha', '(ti ra ki ta dha)@2', '(dha - dha)@3 na'];
  for (const [key, taal] of Object.entries(TAALS)) {
    for (let lead = 0; lead < taal.matras * 2; lead++) {
      for (const ph of phrases) {
        for (const pre of ['', '[- -] ']) {       // also start half a matra late
          const src = 'taal ' + key + '\n' + '- '.repeat(lead) + pre + '\ntihai(' + ph + ')';
          const p = clean(compile(src));
          const end = p.events[p.events.length - 1].t;
          const where = src.replace(/\n/g, ' / ');
          assert.ok(Math.abs(end / taal.matras - Math.round(end / taal.matras)) < 1e-9, where);
          assert.ok(end > lead, where);
          assert.equal(p.length, end, where);
          // three equal, evenly spaced repetitions
          const n = p.events.length / 3;
          assert.equal(n, Math.round(n), where);
          const stride = p.events[n].t - p.events[0].t;
          assert.ok(Math.abs((p.events[2 * n].t - p.events[n].t) - stride) < 1e-9, where);
        }
      }
    }
  }
});

test('errors point at the right place', () => {
  let e = compile('dha dhin\ndha blah na').errors[0];
  assert.deepEqual([e.line, e.col, e.len], [2, 4, 4]);

  e = compile('dha dhinn').errors[0];
  assert.match(e.msg, /did you mean "dhin"/);

  assert.match(compile('dha [ti ta').errors[0].msg, /never closed/);
  assert.match(compile('dha ti)').errors[0].msg, /no open bracket/);
  assert.match(compile('(dha ti]').errors[0].msg, /expected "\)"/);
  assert.match(compile('[tihai(dha)]').errors[0].msg, /cannot sit inside/);
  assert.match(compile('a = b\nb = a\na').errors[0].msg, /containing itself/);
  assert.match(compile('dha = ti ta').errors[0].msg, /reads as a bol/);
  assert.match(compile('dha *x').errors[0].msg, /whole number/);
  assert.match(compile('dha $ ti').errors[0].msg, /\$/);
  assert.match(compile('[ ]').errors[0].msg, /nothing inside/);
});

test('a bad line is skipped, the rest still plays', () => {
  const p = compile('dha dhin\noops\ndha na');
  assert.equal(p.errors.length, 1);
  assert.equal(p.events.length, 4);
  assert.equal(p.length, 4);
});

test('warns when the composition does not come back to sam', () => {
  const p = clean(compile('dha dhin dhin dha [dha -]'));
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0].msg, /5 matras/);
});

test('runaway repeats are stopped', () => {
  const p = compile('a = (tirakita)*64\nb = a*64\nb*64');
  assert.match(p.errors[0].msg, /too many/);
});

test('lexer keeps columns', () => {
  const toks = lexLine('  dha! [ti]*2 # c', 1);
  assert.deepEqual(toks.map(t => t.col), [2, 5, 7, 8, 10, 11, 12, 14]);
  assert.equal(toks[toks.length - 1].type, 'comment');
});

test('every example in the menu compiles and comes back to sam', () => {
  const { EXAMPLES } = require('../src/examples.js');
  assert.ok(EXAMPLES.length > 5);
  for (const ex of EXAMPLES) {
    const p = compile(ex.text);
    assert.deepEqual(p.errors, [], ex.name);
    assert.deepEqual(p.warnings, [], ex.name);
    assert.ok(p.events.length > 0, ex.name);
  }
});
