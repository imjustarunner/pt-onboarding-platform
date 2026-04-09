/**
 * Helpers for building absolute URLs to the backend `/uploads/*` routes.
 *
 * In production, the frontend is served from a different origin than the backend,
 * so relative `/uploads/...` URLs will hit the frontend Cloud Run service (404).
 */
export function getBackendBaseUrl() {
  // Keep the API base as-is. We serve uploads from `/api/uploads/*` as well as `/uploads/*`,
  // so this works for:
  // - split-origin deployments (backend origin differs from frontend origin)
  // - single-domain deployments where backend is path-routed under `/api`
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return String(baseURL || 'http://localhost:3000/api').replace(/\/$/, '');
}

export function normalizeUploadsPath(path) {
  if (!path) return null;
  let cleaned = path;
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  // Strip any existing uploads prefix (with or without the api/ segment)
  if (cleaned.startsWith('api/uploads/')) cleaned = cleaned.substring('api/uploads/'.length);
  else if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
  return cleaned;
}

export function toUploadsUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  // Already absolute
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;

  const cleaned = normalizeUploadsPath(pathOrUrl);
  const apiBase = getBackendBaseUrl();
  // Encode each segment so filenames with spaces or special chars form a valid URL
  const encodedPath = cleaned.split('/').map(seg => encodeURIComponent(seg)).join('/');
  return `${apiBase}/uploads/${encodedPath}`;
}

