function safeTruncate(s, maxLen) {
  const t = String(s || '').replace(/\u0000/g, '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

export async function extractResumeTextFromUpload({ buffer, mimeType }) {
  const mt = String(mimeType || '').toLowerCase();
  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    return { status: 'failed', method: 'none', text: '', errorText: 'Empty file buffer' };
  }

  // Cheapest path: handle PDFs with embedded (selectable) text and plain text files.
  if (mt === 'text/plain') {
    const text = safeTruncate(buffer.toString('utf8'), 200000);
    return { status: text ? 'completed' : 'no_text', method: 'plain_text', text, errorText: null };
  }

  if (mt === 'application/pdf') {
    try {
      // pdfjs-dist expects DOMMatrix in some environments (Cloud Run / Node).
      // Provide a lightweight polyfill so PDF parsing can run server-side.
      if (typeof globalThis.DOMMatrix === 'undefined') {
        const dm = await import('dommatrix');
        const CSSMatrix = dm?.default;
        if (typeof CSSMatrix === 'function') {
          globalThis.DOMMatrix = CSSMatrix;
        }
      }

      // pdf-parse@2.x exports a PDFParse class (no default function).
      const mod = await import('pdf-parse');
      const PDFParse = mod?.PDFParse;
      if (typeof PDFParse !== 'function') {
        return { status: 'failed', method: 'pdf_text', text: '', errorText: 'pdf-parse PDFParse export not found' };
      }

      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();

      const text = safeTruncate(result?.text || '', 200000);
      return { status: text ? 'completed' : 'no_text', method: 'pdf_text', text, errorText: null };
    } catch (e) {
      return {
        status: 'failed',
        method: 'pdf_text',
        text: '',
        errorText: safeTruncate(e?.message || 'PDF text extraction failed', 900)
      };
    }
  }

  // DOC/DOCX/images are not supported in the cheapest path.
  return { status: 'failed', method: 'unsupported', text: '', errorText: `Unsupported resume type: ${mt || 'unknown'}` };
}

