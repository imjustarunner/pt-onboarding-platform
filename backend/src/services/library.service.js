/**
 * Detect Google Docs / Drive / Sheets / Slides share URLs and normalize for embedding.
 */

export function isGoogleWorkspaceUrl(url) {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return false;
  return u.includes('docs.google.com') || u.includes('drive.google.com');
}

export function detectGoogleFileType(url) {
  const u = String(url || '');
  if (/\/document\/d\//i.test(u)) return 'google_doc';
  if (/\/spreadsheets\/d\//i.test(u)) return 'google_sheet';
  if (/\/presentation\/d\//i.test(u)) return 'google_slides';
  if (/\/drawings\/d\//i.test(u)) return 'google_drawing';
  if (/drive\.google\.com/i.test(u)) return 'google_drive';
  return 'google_doc';
}

export function googlePreviewUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!u) return null;
  try {
    const m = u.match(
      /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation|drawings)\/d\/([a-zA-Z0-9_-]+)(\/[^?#]*)?([?#].*)?$/i
    );
    if (m) {
      return `https://docs.google.com/${m[1].toLowerCase()}/d/${m[2]}/preview`;
    }
    const m2 = u.match(
      /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)(\/[^?#]*)?([?#].*)?$/i
    );
    if (m2) {
      return `https://drive.google.com/file/d/${m2[1]}/preview`;
    }
    const parsed = new URL(u);
    if (parsed.hostname === 'drive.google.com') {
      const id = parsed.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
  } catch {
    return null;
  }
  return null;
}

export function inferFileTypeFromMime(mime, filename = '') {
  const m = String(mime || '').toLowerCase();
  const f = String(filename || '').toLowerCase();
  if (m.includes('pdf') || f.endsWith('.pdf')) return 'pdf';
  if (m.includes('word') || f.endsWith('.doc') || f.endsWith('.docx')) return 'word';
  if (m.includes('sheet') || m.includes('excel') || f.endsWith('.xls') || f.endsWith('.xlsx') || f.endsWith('.csv')) {
    return 'spreadsheet';
  }
  if (m.includes('presentation') || m.includes('powerpoint') || f.endsWith('.ppt') || f.endsWith('.pptx')) {
    return 'presentation';
  }
  if (m.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(f)) return 'image';
  if (m.startsWith('text/') || f.endsWith('.txt')) return 'text';
  return 'file';
}

export function parseAudience(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map(String).map((t) => t.trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map((t) => t.trim()).filter(Boolean);
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}
