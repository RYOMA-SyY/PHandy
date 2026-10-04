import { useEffect, useRef, useState, useCallback } from 'react';
import { createPainter } from './paint/engine.js';

const FINISHES = [
  ['impasto', 'Oil / Impasto'],
  ['watercolor', 'Watercolor'],
  ['impressionist', 'Impressionist'],
  ['knife', 'Palette knife'],
  ['gouache', 'Gouache'],
  ['sketch', 'Pencil sketch'],
  ['pointillism', 'Pointillism'],
  ['inkwash', 'Ink wash (sumi-e)'],
  ['pastel', 'Soft pastel'],
  ['poster', 'Posterize / pop-art'],
  ['mosaic', 'Mosaic'],
  ['pixel', 'Pixel art'],
  ['acrylic', 'Acrylic'],
  ['charcoal', 'Charcoal'],
  ['flow', 'Flow lines'],
  ['sculpt', 'Sculpted oil'],
  ['dagger', 'Dagger taper'],
  ['stamp', 'Leaf stamps'],
];
const DETAIL_NAMES = { 1: 'Draft', 2: 'Medium', 3: 'Fine', 4: 'High', 5: 'Museum' };

export default function App() {
  const paintRef = useRef(null);
  const overlayRef = useRef(null);
  const fileRef = useRef(null);
  const painterRef = useRef(null);
  const bytesRef = useRef(null); // original upload, for OCR
  const workerRef = useRef(null); // Tesseract worker (client-side WASM)
  const [ocrPhase, setOcrPhase] = useState('');
  const [ready, setReady] = useState(false);
  const [prog, setProg] = useState({ drawn: 0, total: 0, playing: false, secs: 0, like: 0 });
  const [plan, setPlan] = useState('drop a photo to begin');
  const [style, setStyle] = useState('impasto');
  const [backend, setBackend] = useState('natural');
  const [detail, setDetail] = useState(4);
  const [speed, setSpeed] = useState(160);
  const [target, setTarget] = useState(85);
  const [quality, setQuality] = useState('balanced');
  const [psm, setPsm] = useState('3');
  const [contrast, setContrast] = useState(true);
  const [ocrLang, setOcrLang] = useState('eng');
  const [lines, setLines] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [showBoxes, setShowBoxes] = useState(true);
  const [minned, setMinned] = useState(false);
  const [maxed, setMaxed] = useState(false);
  const [dlg, setDlg] = useState(null);

  useEffect(() => {
    const p = createPainter(paintRef.current, {
      onProgress: (s) => setProg(s),
      onPlan: (s) => setPlan(s),
    });
    painterRef.current = p;
    p.boot();
    setReady(true);
    return () => p.destroy();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); painterRef.current && (prog.playing ? painterRef.current.pause() : painterRef.current.resume()); }
      if (e.key === 'f' || e.key === 'F') painterRef.current && painterRef.current.finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prog.playing]);

  const loadFile = useCallback(async (f) => {
    if (!f || !f.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    const buf = await f.arrayBuffer();
    bytesRef.current = new Uint8Array(buf);
    const url = URL.createObjectURL(new Blob([bytesRef.current], { type: f.type }));
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      setLines([]);
      setOcrError('');
      const { w, h } = await painterRef.current.loadImage(img);
      const ov = overlayRef.current;
      ov.width = w; ov.height = h;
      ov.getContext('2d').clearRect(0, 0, w, h);
    };
    img.onerror = () => alert('Could not read that image.');
    img.src = url;
  }, []);

  const drawOverlay = useCallback((found) => {
    const ov = overlayRef.current, paint = paintRef.current;
    if (!ov || !paint) return;
    const g = ov.getContext('2d');
    g.clearRect(0, 0, ov.width, ov.height);
    if (!showBoxes || !found.length) return;
    const sx = ov.width / found.pageW, sy = ov.height / found.pageH;
    g.lineWidth = Math.max(2, ov.width / 400);
    found.items.forEach((ln, idx) => {
      g.strokeStyle = idx % 2 ? '#1f5f9f' : '#c73b3b';
      g.beginPath();
      ln.box.forEach((pt, i) => {
        const X = pt.x * sx, Y = pt.y * sy;
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      });
      g.closePath();
      g.stroke();
      g.fillStyle = g.strokeStyle;
      g.font = `600 ${Math.max(11, ov.width / 60)}px "Segoe UI", Tahoma, sans-serif`;
      g.fillText(`${idx + 1}`, ln.box[0].x * sx + 3, ln.box[0].y * sy - 4);
    });
  }, [showBoxes]);

  useEffect(() => {
    drawOverlay({ items: lines, pageW: lines.pageW || 1, pageH: lines.pageH || 1 });
  }, [lines, showBoxes, drawOverlay]);

  const ocrBytes = useCallback(async () => {
    // Upscale small photos + optional contrast cleanup for OCR (painting uses the original).
    const blob0 = new Blob([bytesRef.current], { type: 'image/png' });
    try {
      const bmp = await createImageBitmap(blob0);
      const m = Math.max(bmp.width, bmp.height);
      const sc = m >= 1200 ? 1 : 1200 / m;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * sc));
      c.height = Math.max(1, Math.round(bmp.height * sc));
      const g = c.getContext('2d');
      if (contrast) g.filter = 'grayscale(1) contrast(1.35)';
      g.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      if (sc === 1 && !contrast) return blob0;
      return await new Promise((res) => c.toBlob(res, 'image/png'));
    } catch {
      return blob0;
    }
  }, [contrast]);

  async function getWorker() {
    if (workerRef.current) return workerRef.current;
    if (!window.Tesseract) throw new Error('OCR engine failed to load (needs internet once)');
    setOcrPhase('loading');
    const langs = ocrLang.includes('+') ? ocrLang.split('+') : ocrLang;
    const w = await window.Tesseract.createWorker(langs);
    workerRef.current = w;
    return w;
  }

  useEffect(() => {
    // Language change needs a fresh worker (traineddata is bound at creation).
    if (!workerRef.current) return;
    (async () => {
      try { await workerRef.current.terminate(); } catch { /* ignore */ }
      workerRef.current = null;
    })();
  }, [ocrLang]);

  const readText = useCallback(async () => {
    if (!bytesRef.current) { alert('Drop a photo first.'); return; }
    setOcrBusy(true);
    setOcrError('');
    setOcrPhase('reading');
    let url = null;
    try {
      const worker = await getWorker();
      const blob = await ocrBytes();
      url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      try { await worker.setParameters({ tessedit_pageseg_mode: psm }); } catch { /* keep defaults */ }
      const { data } = await worker.recognize(img);
      URL.revokeObjectURL(url);
      url = null;
      const items = (data.lines || []).map((l) => {
        const b = l.bbox || {};
        const x0 = b.x0 ?? 0, y0 = b.y0 ?? 0, x1 = b.x1 ?? x0, y1 = b.y1 ?? y0;
        return {
          text: l.text, conf: (l.confidence || 0) / 100,
          box: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
        };
      }).filter((l) => l.text.trim());
      items.pageW = img.naturalWidth || 1;
      items.pageH = img.naturalHeight || 1;
      setLines(items);
      if (!items.length) setOcrError('No text found in this photo.');
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      setOcrError('OCR failed: ' + err.message);
    } finally {
      setOcrBusy(false);
      setOcrPhase('');
    }
  }, [ocrBytes, psm]);

  const syncCfg = (patch, restart) => {
    const p = painterRef.current;
    if (!p) return;
    Object.assign(p.cfg, patch);
    if (restart && p.hasJob) p.restart();
  };

  const pct = prog.total ? (100 * prog.drawn) / prog.total : 0;

  if (minned) {
    return (
      <div className="desktop">
        <div className="window glass active" style={{ width: 320 }}>
          <div className="title-bar">
            <div className="title-bar-text">Hand Paint</div>
          </div>
          <div className="window-body has-space">
            <p>Minimized — your painting is safe.</p>
            <div className="field-row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setMinned(false)}>Restore</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop">
      <div className="window glass active" style={maxed ? { width: '100vw', height: '100%' } : undefined}>
        <div className="title-bar">
          <div className="title-bar-text">Hand Paint — image to painting + OCR</div>
          <div className="title-bar-controls">
            <button aria-label="Minimize" onClick={() => setMinned(true)} />
            <button aria-label={maxed ? 'Restore' : 'Maximize'} onClick={() => setMaxed(!maxed)} />
            <button aria-label="Close" onClick={() => setDlg('Are you sure you want to close Hand Paint?')} />
          </div>
        </div>

        <div className="window-body has-space">
          <div className="hp-grid">
            <div>
              <fieldset>
                <legend>Photo</legend>
                <div
                  className="drop"
                  onClick={() => fileRef.current.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); }}
                >
                  <b>Drag &amp; drop</b> or click to choose<br />JPG / PNG / WebP — stays on this PC
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; }} />
                <div className="field-row" style={{ marginTop: 8 }}>
                  <button onClick={readText} disabled={ocrBusy || !ready}>
                    {ocrBusy ? (ocrPhase === 'loading' ? 'Loading OCR engine…' : 'Reading…') : 'Read text (OCR)'}
                  </button>
                </div>
                {ocrError && <div className="err">{ocrError}</div>}
                <div className="field-row" style={{ marginTop: 6 }}>
                  <input type="checkbox" id="showboxes" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                  <label htmlFor="showboxes">Show text boxes</label>
                </div>
                <div className="field-row" style={{ marginTop: 6 }}>
                  <label htmlFor="psm">OCR mode</label>
                  <select id="psm" value={psm} onChange={(e) => setPsm(e.target.value)}>
                    <option value="3">Auto layout</option>
                    <option value="6">Uniform block</option>
                    <option value="11">Sparse text</option>
                  </select>
                </div>
                <div className="field-row">
                  <label htmlFor="ocrlang">Language</label>
                  <select id="ocrlang" value={ocrLang} onChange={(e) => setOcrLang(e.target.value)}>
                    <option value="eng">English</option>
                    <option value="eng+fra">English + French</option>
                    <option value="eng+spa">English + Spanish</option>
                  </select>
                </div>
                <div className="field-row" style={{ marginTop: 6 }}>
                  <input type="checkbox" id="ocrcontrast" checked={contrast} onChange={(e) => setContrast(e.target.checked)} />
                  <label htmlFor="ocrcontrast">Contrast cleanup</label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Style</legend>
                <div className="field-row">
                  <label htmlFor="quality">Quality</label>
                  <select id="quality" value={quality} onChange={(e) => { setQuality(e.target.value); syncCfg({ quality: e.target.value }, true); }}>
                    <option value="fast">Fast (768px)</option>
                    <option value="balanced">Balanced (1024px)</option>
                    <option value="high">High (1536px)</option>
                    <option value="ultra">Ultra (2048px)</option>
                  </select>
                </div>
                <div className="field-row">
                  <label htmlFor="finish">Finish</label>
                  <select id="finish" value={style} onChange={(e) => { setStyle(e.target.value); syncCfg({ style: e.target.value }, true); }}>
                    {FINISHES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <label htmlFor="brush">Brush</label>
                  <select id="brush" value={backend} onChange={(e) => { setBackend(e.target.value); syncCfg({ backend: e.target.value }, true); }}>
                    <option value="natural">Natural (p5.brush)</option>
                    <option value="classic">Classic (Canvas2D)</option>
                  </select>
                </div>
                <div className="field-row">
                  <label htmlFor="detail">Detail ({DETAIL_NAMES[detail]})</label>
                  <input type="range" id="detail" min="1" max="5" step="1" value={detail}
                    onChange={(e) => { setDetail(+e.target.value); syncCfg({ detail: +e.target.value }, true); }} />
                </div>
                <div className="field-row">
                  <label htmlFor="speed">Speed ({speed})</label>
                  <input type="range" id="speed" min="20" max="600" step="10" value={speed}
                    onChange={(e) => { setSpeed(+e.target.value); syncCfg({ speed: +e.target.value }, false); }} />
                </div>
                <div className="field-row">
                  <label htmlFor="like">Likeness ({target}%)</label>
                  <input type="range" id="like" min="70" max="98" step="1" value={target}
                    onChange={(e) => { setTarget(+e.target.value); painterRef.current && painterRef.current.setTarget(+e.target.value); }} />
                </div>
              </fieldset>

              <fieldset>
                <legend>Text found {lines.length ? `(${lines.length})` : ''}</legend>
                <div className="lines">
                  {!lines.length && <div className="dim">Press “Read text (OCR)” after loading a photo.</div>}
                  {lines.map((l, i) => (
                    <div className="line" key={i}>
                      <span className="n">{i + 1}</span>
                      <span className="t">{l.text}</span>
                      <span className="c">{Math.round(l.conf * 100)}%</span>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>

            <div>
              <fieldset>
                <legend>Canvas</legend>
                <div className="planline">{plan}</div>
                <div className="sunken-panel" style={{ padding: 4 }}>
                  <div className="stack">
                    <canvas ref={paintRef} id="paint" width="1024" height="768" />
                    <canvas ref={overlayRef} className="overlay" width="1024" height="768" />
                  </div>
                </div>
                <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => painterRef.current && (prog.playing ? painterRef.current.pause() : painterRef.current.resume())}>
                    {prog.playing ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => painterRef.current && painterRef.current.restart()}>Restart</button>
                  <button onClick={() => painterRef.current && painterRef.current.finish()}>Finish</button>
                  <button onClick={() => painterRef.current && painterRef.current.exportPNG()}>Save PNG</button>
                  <button onClick={() => painterRef.current && painterRef.current.exportSVG()}>Save SVG</button>
                  <span className="kbdhint">Space = pause / resume</span>
                </div>
                <div role="progressbar" className="animate" style={{ marginTop: 8 }}>
                  <div style={{ width: pct + '%' }} />
                </div>
              </fieldset>
            </div>
          </div>
        </div>

        <div className="status-bar">
          <p className="status-bar-field" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {prog.playing ? 'Painting' : 'Ready'} — {prog.drawn.toLocaleString()} / {prog.total.toLocaleString()} strokes
          </p>
          <p className="status-bar-field">local only · OCR on this PC{prog.secs ? ` · done in ${prog.secs.toFixed(1)}s · likeness ${prog.like}%` : ''}</p>
          <p className="status-bar-field">made by <a href="https://www.instagram.com/r1yoma/" target="_blank" rel="noreferrer">@r1yoma</a> · <a href="https://github.com/RYOMA-SyY" target="_blank" rel="noreferrer">GitHub</a></p>
        </div>
      </div>

      {dlg && (
        <div className="dlgoverlay">
          <div className="window active" role="dialog" aria-labelledby="dlgtitle" style={{ width: 400 }}>
            <div className="title-bar">
              <div className="title-bar-text" id="dlgtitle">Hand Paint</div>
              <div className="title-bar-controls">
                <button aria-label="Close" onClick={() => setDlg(null)} />
              </div>
            </div>
            <div className="window-body has-space">
              <p>{dlg}</p>
              <div className="field-row" style={{ justifyContent: 'flex-end' }}>
                <button onClick={() => setDlg(null)}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
