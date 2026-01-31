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
      // pdf-parse is CommonJS; dynamic import works under ESM in Node 18.
      const mod = await import('pdf-parse');
      const pdfParse = mod?.default || mod;
      const data = await pdfParse(buffer);
      const text = safeTruncate(data?.text || '', 200000);
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

