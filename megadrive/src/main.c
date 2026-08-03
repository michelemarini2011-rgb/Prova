/* Martello & Scatole — versione per Sega Mega Drive.
   Conversione del gioco HTML5: stesse cave, stessi movimenti, stessa regia. */
#include "game.h"

void game_init(void);
void game_frame(void);

int main(void)
{
    game_init();
    for (;;) game_frame();
    return 0;
}
