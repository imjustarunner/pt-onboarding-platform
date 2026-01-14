/**
 * Helpers for building absolute URLs to the backend `/uploads/*` routes.
 *
 * In production, the frontend is served from a different origin than the backend,
 * so relative `/uploads/...` URLs will hit the frontend Cloud Run service (404).
 */
export function getBackendBaseUrl() {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  // Remove trailing "/api" because uploads are served from the backend root
  return baseURL.replace('/api', '') || 'http://localhost:3000';
}

export function normalizeUploadsPath(path) {
  if (!path) return null;
  let cleaned = path;
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
  return cleaned;
}

export function toUploadsUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  // Already absolute
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;

  const cleaned = normalizeUploadsPath(pathOrUrl);
  const apiBase = getBackendBaseUrl();
  return `${apiBase}/uploads/${cleaned}`;
}

