# cringe

A full-screen mobile photo slideshow that crossfades between photos.

- Tap anywhere to pause / play
- Gentle crossfade with a subtle Ken Burns drift
- Progress dots along the bottom
- Add to your phone's home screen to use it like an app

## Run

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server
```

Photos live in `img/`. To change them, replace the numbered files (`img/01.jpg` … `img/10.jpg`) and update the `IMAGES` list at the top of the `<script>` in `index.html`.
