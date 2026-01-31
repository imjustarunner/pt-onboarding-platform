import { PNG } from 'pngjs';

function safeTruncate(s, maxLen) {
  const t = String(s || '').replace(/\u0000/g, '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function scoreImage({ width, height }) {
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (!w || !h) return -1;
  const area = w * h;
  // Filter out tiny icons and huge full-page renders.
  if (area < 12_000) return -1;
  if (area > 2_500_000) return -1;

  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) return -1;
  // Exclude extreme banners/logos.
  if (ratio < 0.45 || ratio > 2.2) return -1;

  // Prefer near-square/portrait-ish images (common headshot ratios).
  const penalty = Math.abs(Math.log(ratio)); // 0 for 1:1
  return area / (1 + penalty * 2.0);
}

function toPngBufferFromRgba({ rgba, width, height }) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png);
}

export async function extractResumePhotoPngFromPdf({ buffer }) {
  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    return { status: 'failed', errorText: 'Empty PDF buffer', pngBuffer: null };
  }

  try {
    // pdfjs-dist expects DOMMatrix in some environments (Cloud Run / Node).
    if (typeof globalThis.DOMMatrix === 'undefined') {
      const dm = await import('dommatrix');
      const CSSMatrix = dm?.default;
      if (typeof CSSMatrix === 'function') {
        globalThis.DOMMatrix = CSSMatrix;
      }
    }

    const mod = await import('pdf-parse');
    const PDFParse = mod?.PDFParse;
    if (typeof PDFParse !== 'function') {
      return { status: 'failed', errorText: 'pdf-parse PDFParse export not found', pngBuffer: null };
    }

    const parser = new PDFParse({ data: buffer });
    const doc = await parser.load();
    const total = Number(doc?.numPages || 0) || 0;
    const maxPages = Math.min(Math.max(total, 1), 2); // cheap: first 2 pages only

    let best = null;

    for (let i = 1; i <= maxPages; i += 1) {
      const page = await doc.getPage(i);
      const ops = await page.getOperatorList();
      for (let j = 0; j < (ops?.fnArray?.length || 0); j += 1) {
        // We can't reliably inspect the pdfjs OPS constants across builds without
        // importing internal pdfjs modules. Instead, best-effort: attempt to resolve
        // any operator arg that looks like an embedded image name; failures are skipped.
        const nameMaybe = ops.argsArray?.[j]?.[0];
        if (!nameMaybe) continue;

        try {
          const isCommon = page.commonObjs.has(nameMaybe);
          const imgPromise = isCommon
            ? parser.resolveEmbeddedImage(page.commonObjs, nameMaybe)
            : parser.resolveEmbeddedImage(page.objs, nameMaybe);
          const { width, height, kind, data } = await imgPromise;
          const score = scoreImage({ width, height });
          if (score < 0) continue;
          if (!best || score > best.score) {
            best = { score, width, height, kind, data };
          }
        } catch {
          // Skip any image that requires browser canvas/bitmap path.
          continue;
        }
      }
      page.cleanup();
    }

    await parser.destroy();

    if (!best) {
      return { status: 'no_photo', errorText: null, pngBuffer: null };
    }

    const width = Number(best.width);
    const height = Number(best.height);
    const src = best.data instanceof Uint8Array ? best.data : new Uint8Array(best.data?.buffer || []);
    if (!width || !height || !src.length) {
      return { status: 'no_photo', errorText: null, pngBuffer: null };
    }

    // Convert to RGBA bytes.
    const bytesPerPixel = src.length / (width * height);
    let rgba = null;
    if (Math.abs(bytesPerPixel - 4) < 0.1) {
      rgba = Buffer.from(src);
    } else {
      const dest = new Uint32Array(width * height);
      // convertToRGBA writes ABGR words into dest; in little-endian memory that becomes RGBA bytes.
      // biome-ignore lint/suspicious/noExplicitAny: internal library expects certain kinds
      parser.convertToRGBA({ src, dest, width, height, kind: best.kind });
      rgba = Buffer.from(dest.buffer);
    }

    const pngBuffer = toPngBufferFromRgba({ rgba, width, height });
    return { status: 'completed', errorText: null, pngBuffer, width, height };
  } catch (e) {
    return { status: 'failed', errorText: safeTruncate(e?.message || 'Photo extraction failed', 900), pngBuffer: null };
  }
}

