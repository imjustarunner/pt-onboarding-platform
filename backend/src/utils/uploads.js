export function publicUploadsUrlFromStoredPath(storedPath) {
  const p = String(storedPath || '').trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const cleaned = p.replace(/^\/+/, '');
  const rel = cleaned.startsWith('uploads/') ? cleaned.substring('uploads/'.length) : cleaned;
  const base = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
  return base ? `${base}/uploads/${rel}` : `/uploads/${rel}`;
}

