# PHandy — image to painting + OCR (100% client-side)

Drop a photo, watch it hand-painted stroke by stroke in the browser.
Press **Read text (OCR)** to detect text lines with boxes — powered by
[Tesseract.js](https://github.com/naptha/tesseract.js) running fully in
the browser (WASM, no server, no keys, no uploads; engine + language
data download once, then cached).

- `client/` — React + Vite frontend, styled with
  [7.css](https://github.com/khang-nd/7.css) (faithful Win7 components:
  glass window, title bar, group boxes, status bar) over a wallpaper +
  canvas layout. Painting engine: pixel fields in
  embedded WASM (built by `../tools/build_imgfield.js`), adaptive stroke
  planner, p5.brush natural media (npm) or classic Canvas2D. Uses the full
  brush library: 4 custom brushes (`oilflat`, `drybrush`, `washsoft`,
  `pencilfine`), per-finish brush tables, watercolor `wash` underpainting,
  pencil-sketch `hatch` tooth, and a photo-derived vector field.
  12 finishes: impasto, watercolor, impressionist, palette knife, gouache,
  pencil sketch (dual-angle cross-hatch tooth + graphite strokes),
  pointillism, ink wash, soft pastel, posterize, mosaic, pixel art.
  Finish line shows a likeness score (painting vs photo, 0-100). The
  Likeness slider (70-95%) sets a target: the engine adds error-driven
  glaze rounds with exact colors until the measured score hits it
  (lower = faster, higher = slower, machine-independent).
- `server/` — legacy local high-accuracy OCR backend
  ([light-ocr](https://github.com/arcships/light-ocr), Node 22+).
  **Not used by the web app and not deployed**; kept for local
  experimentation only.

## Run locally

```bat
cd client
npm install --no-audit --no-fund
npm run dev
```

Photos under 1200px are upscaled in-browser before OCR (small-text accuracy).

## Deploy to Netlify

The site is fully static (`client/dist`). Two options:

**A. Drag-and-drop (fastest, no account setup):**
```bat
cd client
npm install --no-audit --no-fund
npm run build
```
then drag the `client/dist` folder onto https://app.netlify.com/drop.

**B. From GitHub (auto-deploy on push):**
1. Push this folder to GitHub (see below).
2. Netlify → Add new site → Import an existing project → pick the repo.
   Build settings are already in `netlify.toml`
   (base `client`, build `npm run build`, publish `dist`, Node 22).

## Push to GitHub

```bat
git init -b main
git add .
git commit -m "PHandy: client-side image-to-painting + OCR"
git remote add origin https://github.com/RYOMA-SyY/PHandy.git
git push -u origin main
```

(Requires a GitHub account with access to `RYOMA-SyY/PHandy`;
create the empty repo on github.com first if it does not exist yet.
`node_modules/` and `dist/` are git-ignored.)
