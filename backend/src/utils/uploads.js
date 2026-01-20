export function publicUploadsUrlFromStoredPath(storedPath) {
  const p = String(storedPath || '').trim();
  if (!p) return null;
  const rel = p.startsWith('uploads/') ? p.substring('uploads/'.length) : p;
  return `/uploads/${rel}`;
}

