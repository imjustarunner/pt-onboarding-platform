/**
 * PDF post-merge compression service.
 *
 * Scope: this service is called ONLY on the final merged intake-packet bundle
 * buffer, right before it's uploaded to cloud storage. We never compress the
 * per-template signed documents — their storage paths and sha256 hashes are
 * referenced from intake_submission_documents / client_phi_documents and any
 * byte change would invalidate audit-trail verification downstream.
 *
 * How it works: we spawn Ghostscript with the `/ebook` preset (150 DPI for
 * raster images + font subsetting + flate/JPEG re-encoding). On a typical
 * intake packet this cuts 70–85% of the file size, mostly because each
 * signed template carries a rasterized signature bitmap and pdf-lib's merge
 * doesn't dedupe fonts across copied docs.
 *
 * Safety characteristics:
 *  - Graceful fallback: if `gs` is not installed (local dev, some CI
 *    environments) or the subprocess errors/times out, we return the
 *    original buffer unchanged. The feature is best-effort.
 *  - Size sanity: if Ghostscript's output is LARGER than the input (rare,
 *    but possible for already-optimized PDFs), we keep the input.
 *  - Env-gated: `PDF_BUNDLE_COMPRESSION_ENABLED=false` turns it off without
 *    a redeploy — an escape hatch if we ever see a real regression.
 *  - No digital-signature concern: our intake packets use rasterized
 *    signatures (images drawn onto the PDF), not PDF cryptographic
 *    signatures. Ghostscript rewriting the content stream is safe.
 *  - No in-place mutation of source data: operates entirely on temp files
 *    in os.tmpdir() that are always cleaned up.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_PRESET = '/ebook';
const GS_BINARY = process.env.GHOSTSCRIPT_BINARY || 'gs';

const isEnabled = () => {
  const raw = String(process.env.PDF_BUNDLE_COMPRESSION_ENABLED ?? 'true').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
};

const resolvePreset = () => {
  const raw = String(process.env.PDF_BUNDLE_COMPRESSION_PRESET || DEFAULT_PRESET).trim();
  // Only allow known-safe presets. `/ebook` is the default; `/printer` and
  // `/prepress` preserve higher image resolution if we ever need it.
  const allowed = new Set(['/screen', '/ebook', '/printer', '/prepress', '/default']);
  return allowed.has(raw) ? raw : DEFAULT_PRESET;
};

const runGhostscript = ({ inputPath, outputPath, preset, timeoutMs }) => new Promise((resolve) => {
  // Arg breakdown:
  //   -sDEVICE=pdfwrite          → write a PDF
  //   -dPDFSETTINGS=<preset>     → quality/compression bundle
  //   -dCompatibilityLevel=1.5   → PDF 1.5 (object streams) for maximum shrink
  //   -dNOPAUSE -dBATCH -dQUIET  → non-interactive / suppress chatter
  //   -dSAFER                    → disable operators that touch the host FS
  //                                outside of the input (defense-in-depth)
  //   -dDetectDuplicateImages=true → dedupe repeated images across pages
  //   -dCompressFonts=true         → compress font subsets
  //   -dSubsetFonts=true           → embed only used glyphs per font
  const args = [
    '-sDEVICE=pdfwrite',
    `-dPDFSETTINGS=${preset}`,
    '-dCompatibilityLevel=1.5',
    '-dNOPAUSE',
    '-dBATCH',
    '-dQUIET',
    '-dSAFER',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    `-sOutputFile=${outputPath}`,
    inputPath
  ];

  let child;
  try {
    child = spawn(GS_BINARY, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // ENOENT → gs not installed. Expected on local dev if the user hasn't
    // installed it; always present in the deployed Alpine image (Dockerfile
    // adds it via apk).
    resolve({ ok: false, reason: 'gs_spawn_failed', error: err?.message || String(err) });
    return;
  }

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    if (stderrBuf.length < 4096) stderrBuf += String(chunk);
  });

  const killTimer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already exited */ }
  }, timeoutMs);

  child.on('error', (err) => {
    clearTimeout(killTimer);
    resolve({ ok: false, reason: 'gs_error', error: err?.message || String(err) });
  });

  child.on('close', (code, signal) => {
    clearTimeout(killTimer);
    if (signal === 'SIGKILL') {
      resolve({ ok: false, reason: 'gs_timeout', timeoutMs });
      return;
    }
    if (code !== 0) {
      resolve({
        ok: false,
        reason: 'gs_nonzero_exit',
        exitCode: code,
        stderrSnippet: stderrBuf.slice(0, 512)
      });
      return;
    }
    resolve({ ok: true });
  });
});

/**
 * Compress a PDF buffer. Always returns a buffer; never throws.
 *
 * @param {Buffer} inputBuffer  The merged bundle bytes to compress.
 * @param {object} [options]
 * @param {string} [options.label]     Short label for logs (e.g. submission id).
 * @param {number} [options.timeoutMs] Override the 60s default timeout.
 * @param {string} [options.preset]    Override the Ghostscript preset.
 * @returns {Promise<{ buffer: Buffer, compressed: boolean, originalSize: number,
 *                     compressedSize: number, reason?: string, elapsedMs: number }>}
 */
export async function compressPdfBuffer(inputBuffer, options = {}) {
  const started = Date.now();
  const label = options.label || 'pdf';
  const originalSize = inputBuffer?.length || 0;

  if (!Buffer.isBuffer(inputBuffer) || originalSize === 0) {
    return { buffer: inputBuffer, compressed: false, originalSize, compressedSize: originalSize, reason: 'invalid_input', elapsedMs: 0 };
  }

  if (!isEnabled()) {
    return { buffer: inputBuffer, compressed: false, originalSize, compressedSize: originalSize, reason: 'disabled_by_env', elapsedMs: 0 };
  }

  const preset = options.preset || resolvePreset();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  // Unique temp basenames so concurrent bundle saves never collide.
  const uniq = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(os.tmpdir(), `pdfcomp-in-${uniq}.pdf`);
  const outputPath = path.join(os.tmpdir(), `pdfcomp-out-${uniq}.pdf`);

  let result;
  try {
    await fs.writeFile(inputPath, inputBuffer);
    const gsResult = await runGhostscript({ inputPath, outputPath, preset, timeoutMs });
    if (!gsResult.ok) {
      console.warn(`[pdfCompression:${label}] skipped compression (${gsResult.reason})`, {
        exitCode: gsResult.exitCode,
        stderrSnippet: gsResult.stderrSnippet,
        elapsedMs: Date.now() - started
      });
      result = { buffer: inputBuffer, compressed: false, originalSize, compressedSize: originalSize, reason: gsResult.reason, elapsedMs: Date.now() - started };
    } else {
      const outputBuffer = await fs.readFile(outputPath);
      const compressedSize = outputBuffer.length;
      // Sanity: if gs somehow produced a bigger file (already-optimized input,
      // or a preset that re-encodes vector content wastefully), keep the original.
      if (compressedSize <= 0 || compressedSize >= originalSize) {
        console.log(`[pdfCompression:${label}] kept original (compressed=${compressedSize}B >= original=${originalSize}B)`);
        result = { buffer: inputBuffer, compressed: false, originalSize, compressedSize, reason: 'no_savings', elapsedMs: Date.now() - started };
      } else {
        const pct = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        console.log(`[pdfCompression:${label}] ${originalSize}B → ${compressedSize}B (-${pct}%, ${Date.now() - started}ms, preset=${preset})`);
        result = { buffer: outputBuffer, compressed: true, originalSize, compressedSize, elapsedMs: Date.now() - started };
      }
    }
  } catch (err) {
    console.error(`[pdfCompression:${label}] unexpected error — falling back to original buffer`, {
      error: err?.message || String(err),
      stack: err?.stack
    });
    result = { buffer: inputBuffer, compressed: false, originalSize, compressedSize: originalSize, reason: 'exception', elapsedMs: Date.now() - started };
  } finally {
    // Best-effort cleanup; temp files are small and os.tmpdir() is transient
    // on Cloud Run anyway, but we still clean up to avoid surprise disk use
    // on long-lived instances.
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }

  return result;
}

export default { compressPdfBuffer };
