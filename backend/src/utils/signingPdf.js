import { PDFDocument, EncryptedPDFError } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);

// Some official forms open without a password but carry PDF permission
// encryption, which pdf-lib cannot decrypt. Render those into a working copy;
// never modify the stored original or pretend ignoreEncryption decrypts it.
export async function loadSigningPdf(bytes) {
  try { return await PDFDocument.load(bytes); }
  catch (error) {
    // pdf-lib's transpiled Error subclasses do not retain their prototype.
    if (error?.message !== new EncryptedPDFError().message) throw error;
  }

  const directory = await mkdtemp(join(tmpdir(), 'hire-signing-pdf-'));
  try {
    // Ghostscript can exit successfully with a placeholder page when an opening
    // password is missing. Verify independent readability before converting.
    const { PDFParse } = await import('pdf-parse');
    const reader = new PDFParse({ data: Uint8Array.from(bytes) });
    let pageCount;
    try { pageCount = (await reader.getInfo()).total; }
    finally { await reader.destroy(); }
    const input = join(directory, 'source.pdf'), output = join(directory, 'working.pdf');
    await writeFile(input, bytes, { mode: 0o600 });
    await run(process.env.GHOSTSCRIPT_BINARY || 'gs', [
      '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7', '-dAutoRotatePages=/None',
      `-sOutputFile=${output}`, input
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const pdf = await PDFDocument.load(await readFile(output));
    if (!pageCount || pdf.getPageCount() !== pageCount) throw new Error('PDF pages were not preserved');
    return pdf;
  } catch {
    throw Object.assign(new Error('This PDF could not be prepared for signing. Ask People Operations to replace it with a readable PDF that opens without a password.'), { status: 409, statusCode: 409 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
