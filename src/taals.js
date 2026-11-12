// The taals theka knows about.
//
// vibhag = how the cycle is divided, claps = what the hands do at the start of
// each vibhag: X is sam, a number is a tali (clap), 0 is khali (wave).
// Rupak is the odd one out: its sam is a khali.
(function (T) {
  'use strict';

  T.TAALS = {
    teentaal: {
      name: 'Teentaal',
      matras: 16,
      vibhag: [4, 4, 4, 4],
      claps: ['X', '2', '0', '3'],
      theka: 'dha dhin dhin dha | dha dhin dhin dha | dha tin tin ta | ta dhin dhin dha',
    },
    keherwa: {
      name: 'Keherwa',
      matras: 8,
      vibhag: [4, 4],
      claps: ['X', '0'],
      theka: 'dha ge na ti | na ka dhi na',
    },
    dadra: {
      name: 'Dadra',
      matras: 6,
      vibhag: [3, 3],
      claps: ['X', '0'],
      theka: 'dha dhi na | dha tu na',
    },
    rupak: {
      name: 'Rupak',
      matras: 7,
      vibhag: [3, 2, 2],
      claps: ['0', '1', '2'],
      theka: 'tin tin na | dhi na | dhi na',
    },
    jhaptaal: {
      name: 'Jhaptaal',
      matras: 10,
      vibhag: [2, 3, 2, 3],
      claps: ['X', '2', '0', '3'],
      theka: 'dhi na | dhi dhi na | ti na | dhi dhi na',
    },
    ektaal: {
      name: 'Ektaal',
      matras: 12,
      vibhag: [2, 2, 2, 2, 2, 2],
      claps: ['X', '0', '2', '0', '3', '4'],
      theka: 'dhin dhin | dhage tirakita | tu na | kat ta | dhage tirakita | dhi na',
    },
  };
})(typeof module !== 'undefined' ? module.exports : (window.Theka = window.Theka || {}));
