export function publicUploadsUrlFromStoredPath(storedPath) {
  const p = String(storedPath || '').trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const rel = p.startsWith('uploads/') ? p.substring('uploads/'.length) : p;
  const base = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
  return base ? `${base}/uploads/${rel}` : `/uploads/${rel}`;
}

