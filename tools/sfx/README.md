# Game sounds (v9.8)

The sounds in `web-demo/assets/sfx/` are real recordings from freesound.org, all released under CC0
(public domain). Authors and links: `web-demo/assets/sfx/CREDITS.txt`.

How they were made (run in an empty working folder, Python 3 + numpy + scipy + ffmpeg):

1. `fs.py` searches freesound (CC0 only) and downloads the HQ previews into `raw/`.
2. `pick.py` lists the chosen recording for each game sound (the first id is used; the others were spares)
   and writes `picked.json`.
3. `build_sfx.py` trims, cleans (high-pass), levels, cuts single footsteps out of longer recordings,
   makes seamless loops (with padding, so the MP3 start offset can never click) and encodes small MP3s
   into `out/` with `manifest.json` and `CREDITS.txt`.
4. Copy `out/*.mp3` and `CREDITS.txt` to `web-demo/assets/sfx/` and regenerate `web-demo/src/sfxlist.js`
   from `manifest.json`.

`pick.py` reads `search1.json`, `search2.json`, `search3.json` (saved results of `fs.search(...)`).
