function safeTruncate(s, maxLen) {
  const t = String(s || '').replace(/\u0000/g, '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function isDocxMime(mt) {
  return mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mt === 'application/docx';
}

function isLegacyDocMime(mt) {
  return mt === 'application/msword';
}

function extractedText(value, method, maxChars) {
  const normalized = String(value || '').replace(/\u0000/g, '').trim();
  const requested = Number(maxChars);
  const limit = Number.isSafeInteger(requested) && requested > 0 ? requested : 200000;
  const text = safeTruncate(normalized, limit);
  return { status: text ? 'completed' : 'no_text', method, text, errorText: null, truncated: normalized.length > limit, extractedCharacters: normalized.length };
}

// Resume uploads retain their existing bound. Trusted reference ingestion may
// request a different explicit bound and gets reliable truncation evidence.
export async function extractResumeTextFromUpload({ buffer, mimeType, maxChars = 200000 }) {
  const mt = String(mimeType || '').toLowerCase();
  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    return { status: 'failed', method: 'none', text: '', errorText: 'Empty file buffer' };
  }

  // Cheapest path: handle PDFs with embedded (selectable) text and plain text files.
  if (mt === 'text/plain') {
    return extractedText(buffer.toString('utf8'), 'plain_text', maxChars);
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

      return extractedText(result?.text || '', 'pdf_text', maxChars);
    } catch (e) {
      return {
        status: 'failed',
        method: 'pdf_text',
        text: '',
        errorText: safeTruncate(e?.message || 'PDF text extraction failed', 900)
      };
    }
  }

  if (isDocxMime(mt)) {
    try {
      const mammoth = await import('mammoth');
      const extractRawText = mammoth?.default?.extractRawText || mammoth?.extractRawText;
      if (typeof extractRawText !== 'function') {
        return { status: 'failed', method: 'docx_text', text: '', errorText: 'mammoth extractRawText not found' };
      }
      const result = await extractRawText({ buffer });
      return extractedText(result?.value || '', 'docx_text', maxChars);
    } catch (e) {
      return {
        status: 'failed',
        method: 'docx_text',
        text: '',
        errorText: safeTruncate(e?.message || 'DOCX text extraction failed', 900)
      };
    }
  }

  if (isLegacyDocMime(mt)) {
    return {
      status: 'failed',
      method: 'unsupported',
      text: '',
      errorText: 'Legacy .doc files are not supported. Please upload a PDF or DOCX, or paste the resume text.'
    };
  }

  // Images/other are not supported in the cheapest path.
  return { status: 'failed', method: 'unsupported', text: '', errorText: `Unsupported resume type: ${mt || 'unknown'}` };
}
