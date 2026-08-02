/* Caricamento degli asset (tutti generati da tools/generate_assets.py). */
(function () {
  "use strict";

  const FILES = {
    backdrop: "assets/backdrop.png",
    tiles: "assets/tiles.png",
    dwarf: "assets/dwarf.png",
    imps: "assets/imps.png",
    machine: "assets/machine.png",
    crate: "assets/crate.png",
    movplat: "assets/movplat.png",
    hazard: "assets/hazard.png",
    portal: "assets/portal.png",
    icons: "assets/icons.png",
    logo: "assets/logo.png"
  };

  window.Assets = {
    img: {},
    load(onProgress) {
      const keys = Object.keys(FILES);
      let done = 0;
      return Promise.all(keys.map((key) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          window.Assets.img[key] = image;
          done += 1;
          if (onProgress) onProgress(done / keys.length);
          resolve(image);
        };
        image.onerror = () => reject(new Error("Impossibile caricare " + FILES[key]));
        image.src = FILES[key];
      })));
    }
  };
})();
