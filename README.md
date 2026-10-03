# PHandy — image to painting + OCR (100% client-side)

Made by [@r1yoma](https://instagram.com/r1yoma) ·
repo: [RYOMA-SyY/PHandy](https://github.com/RYOMA-SyY/PHandy)

![React 19](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)
![Vite 8](https://img.shields.io/badge/vite-8-9B5CF6?logo=vite&logoColor=white)
![p5.brush 2.2.3](https://img.shields.io/badge/p5.brush-2.2.3-3c8d40)
![Tesseract.js 7](https://img.shields.io/badge/tesseract.js-7-FF6F00)
![7.css](https://img.shields.io/badge/7.css-win7-5fa9df)
![MIT](https://img.shields.io/badge/license-MIT-green)
![client-side](https://img.shields.io/badge/100%25-client--side-blue)
![wasm](https://img.shields.io/badge/vision-wasm-lightgrey)

Drop a photo, watch it hand-painted stroke by stroke in the browser.
Press **Read text (OCR)** to detect text lines with boxes over the painting.
No server, no keys, no uploads.

## Tech we use

- [p5.brush](https://github.com/acamposuribe/p5.brush) (MIT) — natural-media
  brushes, vector fields, wash and hatch. 4 custom brushes are registered
  at runtime (`oilflat`, `drybrush`, `washsoft`, `pencilfine`) with
  per-finish brush tables and a photo-derived vector field.
- [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) —
  in-browser OCR. Engine and language data download once, then cached.
- [7.css](https://github.com/khang-nd/7.css) (MIT) — faithful Windows 7
  components: glass window, title bar, group boxes, status bar.
- React 19 + Vite 8 — app shell and build.
- Custom hand-built WASM module (`tools/build_imgfield.js`, 852 bytes) —
  Sobel magnitude + octant direction fields for stroke planning, embedded
  as base64 with an identical JS fallback.

12 finishes: impasto, watercolor, impressionist, palette knife, gouache,
pencil sketch (dual-angle cross-hatch tooth + graphite strokes),
pointillism, ink wash, soft pastel, posterize, mosaic, pixel art.
Finish line shows a likeness score (painting vs photo, 0-100). The
Likeness slider (70-95%) sets a target: the engine adds error-driven
glaze rounds with exact colors until the measured score hits it
(lower = faster, higher = slower, machine-independent).

## Run locally

```bat
cd client
npm install --no-audit --no-fund
npm run dev
```

Photos under 1200px are upscaled in-browser before OCR (small-text accuracy).

Legacy note: `server/` holds an earlier
[light-ocr](https://github.com/arcships/light-ocr) (Apache-2.0) Node
backend prototype — not used by the app.
