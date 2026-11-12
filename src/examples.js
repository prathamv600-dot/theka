// What shows up in the "examples" menu.
(function (T) {
  'use strict';

  const TAALS = (typeof require === 'function' ? require('./taals.js') : T).TAALS;
  const list = [];

  list.push({
    name: 'Delhi kayda, with a tihai',
    text: [
      '# A Delhi kayda in teentaal. Press Play (or Ctrl+Enter).',
      'taal teentaal',
      'bpm 92',
      '',
      '# The theme. The second half answers the first',
      '# with the bass taken out: ta instead of dha.',
      'mukh  = dha dha te te | dha dha tu na',
      'khali = ta  ta  te te | dha dha dhi na',
      '',
      '# once slowly, one bol to a matra',
      'mukh khali',
      '',
      '# dugun: double speed, so it fits twice in a cycle',
      '(mukh khali)@2 * 2',
      '',
      '# a palta - same bols, shuffled',
      '(dha dha te te dha dha te te | dha dha te te dha dha tu na)@2',
      '(ta  ta  te te ta  ta  te te | dha dha te te dha dha dhi na)@2',
      '',
      '# back to the theme, then a tihai to come home.',
      '# The pause is worked out so the last dha lands on sam.',
      '(mukh khali)@2',
      'tihai((dha dha te te dha!)@2)',
    ].join('\n'),
  });

  list.push({
    name: 'Tihai playground',
    text: [
      '# A tihai is a phrase played three times, timed so that the',
      '# very last stroke falls on sam.',
      '#',
      '# Add or remove bols on the "lead in" line and watch the note',
      '# under the editor: the pause gets re-solved every time.',
      'taal teentaal',
      'bpm 110',
      '',
      'dha dhin dhin dha | dha dhin dhin dha',
      '',
      '# lead in',
      'dha tin',
      '',
      'tihai(tirakita dha!)',
    ].join('\n'),
  });

  list.push({
    name: 'Keherwa groove',
    text: [
      '# Keherwa: the 8 beat cycle behind half of all',
      '# film songs and bhajans.',
      'taal keherwa',
      'bpm 176',
      '',
      'groove = dha ge na ti | na ka dhi na',
      'lift   = dha ge na ti | [na na] ka [dhi dhi] na',
      '',
      'groove groove groove lift',
      'groove groove groove',
      'dha ge na ti | tihai((ti ta dha!)@2)',
    ].join('\n'),
  });

  list.push({
    name: 'Fast rela',
    text: [
      '# A rela is all about speed: closed, rolling strokes.',
      '# Sixteen bols grouped 5 + 5 + 2 + 4, four to a matra.',
      '# Push the tempo up if you dare.',
      'taal teentaal',
      'bpm 84',
      '',
      'open   = (dha ti ra ki ta | dha ti ra ki ta | dha ti dha ge tu na)@4',
      'closed = (ta  ti ra ki ta | ta  ti ra ki ta | dha ti dha ge dhi na)@4',
      '',
      'open open closed open',
    ].join('\n'),
  });

  // one plain theka per taal
  Object.keys(TAALS).forEach(key => {
    const taal = TAALS[key];
    list.push({
      name: taal.name + ' theka (' + taal.matras + ')',
      text: [
        '# ' + taal.name + ': ' + taal.matras + ' matras, divided ' + taal.vibhag.join(' + '),
        'taal ' + key,
        'bpm ' + (taal.matras <= 8 ? 150 : 100),
        '',
        taal.theka,
      ].join('\n'),
    });
  });

  T.EXAMPLES = list;
})(typeof module !== 'undefined' ? module.exports : (window.Theka = window.Theka || {}));
