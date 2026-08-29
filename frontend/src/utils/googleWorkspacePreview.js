/**
 * Normalize Google Docs / Sheets / Slides / Drive share URLs into embeddable /preview URLs.
 */

export function isGoogleWorkspaceUrl(url) {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return false;
  return u.includes('docs.google.com') || u.includes('drive.google.com');
}

export function getGoogleWorkspacePreviewUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!u) return null;
  if (!isGoogleWorkspaceUrl(u)) return null;

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

export function detectGoogleResourceLabel(url) {
  const u = String(url || '');
  if (/\/document\/d\//i.test(u)) return 'Google Doc';
  if (/\/spreadsheets\/d\//i.test(u)) return 'Google Sheet';
  if (/\/presentation\/d\//i.test(u)) return 'Google Slides';
  if (/\/drawings\/d\//i.test(u)) return 'Google Drawing';
  if (/drive\.google\.com/i.test(u)) return 'Google Drive file';
  return 'Google Workspace';
}
