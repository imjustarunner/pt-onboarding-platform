export const isFundthredPath = (path = '') => /^\/fundthred(?:[/?#]|$)/.test(String(path));
export const isFundthredWorkspacePath = (path = '') => /^\/(?:[^/]+\/)?finance-operations(?:[/?#]|$)/.test(String(path)) || /^\/fundthred\/app(?:[/?#]|$)/.test(String(path));
export const isFundthredLogin = route => route?.query?.product === 'fundthred' || isFundthredWorkspacePath(route?.query?.redirect || '');
export const fundthredWorkspacePath = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || '')) ? `/${slug}/finance-operations` : '/finance-operations';
export function fundthredLoginLocation(redirect = '/fundthred/app') {
  const destination = isFundthredWorkspacePath(redirect) && !/[\\\r\n]/.test(redirect) ? redirect : '/fundthred/app';
  return { path: '/login', query: { product: 'fundthred', redirect: destination } };
}
