/* Caricamento degli asset (tutti generati da tools/generate_assets.py). */
(function () {
  "use strict";

  const FILES = {
    tiles: "assets/tiles.png",
    sky: "assets/sky.png",
    treesFar: "assets/trees_far.png",
    treesMid: "assets/trees_mid.png",
    treesNear: "assets/trees_near.png",
    mist: "assets/mist.png",
    fox: "assets/fox.png",
    enemies: "assets/enemies.png",
    props: "assets/props.png",
    door: "assets/door.png",
    leaf: "assets/leaf.png",
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
