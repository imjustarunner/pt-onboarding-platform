const unlimitedViewerRoles = new Set(['admin', 'support', 'super_admin']);

export function hasUnlimitedFileViews(req) {
  return !!req?.user?.id && !req.user.switchedFromUserId
    && unlimitedViewerRoles.has(req.user.role);
}

// Only established read-only viewing endpoints qualify. A query/header cannot
// turn a download, export, print, or direct storage request into a view.
export function isClientFileView(req) {
  if (!['GET', 'HEAD'].includes(req?.method)) return false;
  let url, path;
  try {
    url = new URL(req.originalUrl || req.path || '/', 'http://local');
    path = decodeURIComponent(url.pathname).replace(/\/+/g, '/').toLowerCase();
  } catch { return false; }
  if ([...url.searchParams.keys()].some(key => /download|attachment|export/i.test(key))) return false;
  return /^\/api\/phi-documents\/(?:\d+\/view|signed-school-packets\/\d+|clients\/\d+\/chart-artifacts\/[^/]+\/view)\/?$/.test(path);
}
