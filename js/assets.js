/* Caricamento degli asset grafici (tutti generati da tools/generate_assets.py). */
(function () {
  "use strict";

  const FILES = {
    maze: "assets/maze.png",
    mazeFlash: "assets/maze_flash.png",
    pacman: "assets/pacman.png",
    pacmanDeath: "assets/pacman_death.png",
    ghosts: "assets/ghosts.png",
    pellet: "assets/pellet.png",
    powerPellet: "assets/power_pellet.png",
    fruits: "assets/fruits.png",
    logo: "assets/logo.png"
  };

  const Assets = {
    img: {},

    load(onProgress) {
      const keys = Object.keys(FILES);
      let done = 0;
      return Promise.all(
        keys.map(
          (key) =>
            new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => {
                Assets.img[key] = image;
                done += 1;
                if (onProgress) onProgress(done / keys.length);
                resolve(image);
              };
              image.onerror = () => reject(new Error("Impossibile caricare " + FILES[key]));
              image.src = FILES[key];
            })
        )
      );
    }
  };

  window.Assets = Assets;
})();
