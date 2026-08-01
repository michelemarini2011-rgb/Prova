/* Tabelle di bilanciamento, ispirate ai valori dell'originale da sala giochi. */
(function () {
  "use strict";

  // Velocità di riferimento (celle al secondo) corrispondente al "100%".
  const BASE_SPEED = 9.6;

  // Durata del panico (secondi) e numero di lampeggi finali, per livello.
  const FRIGHT_SECONDS = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0, 0, 0];

  // Soglia di pallini rimasti che rende Blinky "Cruise Elroy".
  const ELROY = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100, 120, 120, 120];

  // Bonus: indice nello sprite sheet dei frutti + punteggio.
  const FRUITS = [
    { index: 0, points: 100, name: "Ciliegia" },
    { index: 1, points: 300, name: "Fragola" },
    { index: 2, points: 500, name: "Arancia" },
    { index: 3, points: 700, name: "Mela" },
    { index: 4, points: 1000, name: "Melone" },
    { index: 5, points: 2000, name: "Galaxian" },
    { index: 6, points: 3000, name: "Campana" },
    { index: 7, points: 5000, name: "Chiave" }
  ];

  function fruitForLevel(level) {
    if (level <= 2) return FRUITS[level - 1];
    if (level <= 4) return FRUITS[2];
    if (level <= 6) return FRUITS[3];
    if (level <= 8) return FRUITS[4];
    if (level <= 10) return FRUITS[5];
    if (level <= 12) return FRUITS[6];
    return FRUITS[7];
  }

  // Alternanza dispersione / inseguimento (secondi). L'ultima fase è infinita.
  function waves(level) {
    if (level === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
    if (level <= 4) return [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity];
    return [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
  }

  function params(level) {
    const l = Math.max(1, level);
    let pac, pacFright, ghost, ghostFright;
    if (l === 1) {
      pac = 0.8; pacFright = 0.9; ghost = 0.75; ghostFright = 0.5;
    } else if (l <= 4) {
      pac = 0.9; pacFright = 0.95; ghost = 0.85; ghostFright = 0.55;
    } else if (l <= 20) {
      pac = 1.0; pacFright = 1.0; ghost = 0.95; ghostFright = 0.6;
    } else {
      pac = 0.9; pacFright = 0.9; ghost = 0.95; ghostFright = 0.6;
    }
    const idx = Math.min(l, FRIGHT_SECONDS.length) - 1;
    return {
      level: l,
      pacSpeed: pac,
      pacFrightSpeed: pacFright,
      ghostSpeed: ghost,
      ghostFrightSpeed: ghostFright,
      tunnelSpeed: l === 1 ? 0.4 : l <= 4 ? 0.45 : 0.5,
      eatenSpeed: 2.0,
      frightSeconds: FRIGHT_SECONDS[idx],
      frightFlashes: 5,
      elroy1: ELROY[Math.min(l, ELROY.length) - 1],
      fruit: fruitForLevel(l),
      waves: waves(l),
      // pallini da mangiare prima che Inky e Clyde escano di casa
      inkyDots: l === 1 ? 30 : 0,
      clydeDots: l === 1 ? 60 : l === 2 ? 50 : 0,
      releaseTimeout: l <= 4 ? 4 : 3
    };
  }

  window.CFG = {
    BASE_SPEED,
    FRUITS,
    params,
    fruitForLevel,
    POINTS: { pellet: 10, power: 50, ghost: [200, 400, 800, 1600] },
    EXTRA_LIFE_AT: 10000,
    START_LIVES: 3,
    FRUIT_DOTS: [70, 170],
    FRUIT_SECONDS: 9.5
  };
})();
