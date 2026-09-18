// Liveness can succeed while the application loads. Readiness must not:
// Cloud Run must not promote a revision whose security prerequisites failed.
export function bootstrapResponse(url, { appLoaded = false, loadError = null } = {}) {
  const path = String(url || '/').split('?')[0];
  const health = ['/', '/health', '/healthz', '/readyz'].includes(path);
  const ready = appLoaded && !loadError;
  return {
    statusCode: health && (path !== '/readyz' || ready) ? 200 : 503,
    body: {
      status: ready ? 'ok' : (loadError ? 'degraded' : 'starting'),
      phase: ready ? 'ready' : (loadError ? 'degraded' : 'bootstrap'),
      // Detailed errors belong in operator logs, not an unauthenticated response.
      message: ready ? 'Server is ready' : (loadError ? 'Application unavailable' : 'Server is loading, please retry')
    }
  };
}
