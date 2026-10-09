# Sugar Pop - Match-3 Puzzle Game

An original candy-matching puzzle game: plain HTML + CSS + JavaScript (Canvas). No libraries, no image or audio files - all graphics are drawn in code and all sound/music is synthesized with the Web Audio API.

## Run it on localhost

Pick one:

1. **Windows:** double-click `start-server.bat` (needs Python installed). It opens http://localhost:8000
2. **Any OS, terminal:** in this folder run `python -m http.server 8000`, then open http://localhost:8000
3. **VS Code:** install the "Live Server" extension, right-click `index.html` -> "Open with Live Server".

(It also works by just double-clicking `index.html`.)

## How to play

- Click a candy, then click a neighbour (or drag it) to swap. Match 3+ of the same shape/colour.
- Match 4 -> striped candy (clears a row/column). L or T shape -> blast candy (3x3). Match 5 -> rainbow bomb (swap it with a candy to clear that colour).
- Combine two special candies by swapping them for a bigger effect.
- Jelly tiles are cleared by matching on top of them.
- Press `H` or the Hint button for a hint. Hints also appear after 5 seconds of idling.

## Levels

| # | Name | Goal |
|---|------|------|
| 1 | First Taste | Score 1000 |
| 2 | Cherry Pop | Collect 16 red circles |
| 3 | Sugar Rush | Score 2500 |
| 4 | Jelly Beginnings | Clear centre jelly |
| 5 | Double Trouble | Collect 18 orange squares + 18 green triangles |
| 6 | Frosted Frame | Clear border jelly + score 2800 |
| 7 | Candy Storm | Score 4500 |
| 8 | Rainbow Trio | Collect 14 red, 14 yellow, 14 blue |
| 9 | Jelly Jam | Clear all jelly |
| 10 | Grand Finale | Clear checkerboard jelly + score 4500 + 15 purple hexagons |

Progress and sound settings are saved in your browser (localStorage).

## Files

- `index.html` - page structure
- `style.css` - styling
- `game.js` - game logic, rendering, sound
- `start-server.bat` - Windows launcher
