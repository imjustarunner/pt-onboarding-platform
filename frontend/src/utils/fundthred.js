export const isFundthredPath = (path = '') => /^\/fundthred(?:[/?#]|$)/.test(String(path));
export const isFundthredWorkspacePath = (path = '') => /^\/(?:[^/]+\/)?finance-operations(?:[/?#]|$)/.test(String(path)) || /^\/fundthred\/app(?:[/?#]|$)/.test(String(path));
export const isFundthredLogin = route => route?.query?.product === 'fundthred' || isFundthredWorkspacePath(route?.query?.redirect || '');
export const fundthredWorkspacePath = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || '')) ? `/${slug}/finance-operations` : '/finance-operations';
export function fundthredLoginLocation(redirect = '/fundthred/app') {
  const destination = isFundthredWorkspacePath(redirect) && !/[\\\r\n]/.test(redirect) ? redirect : '/fundthred/app';
  return { path: '/login', query: { product: 'fundthred', redirect: destination } };
}

export const isFundthredHost = (host = '') => ['fundthred.com', 'www.fundthred.com'].includes(String(host).toLowerCase().split(':')[0]);
export const fundthredPaths = {
  internal(value) {
    const path = String(value);
    if (/^\/(?=[?#]|$)/.test(path)) return path.replace(/^\//, '/fundthred');
    if (/^\/(product|solutions|services|pricing|resources|start|app)(?:[/?#]|$)/.test(path)) {
      const workspace = path.match(/^\/app\/([a-z0-9-]+)\/?([?#].*)?$/);
      if (workspace?.[1] === 'collections') return '/fundthred/app/collections';
      if (workspace) return `${fundthredWorkspacePath(workspace[1])}${workspace[2] || ''}`;
      return `/fundthred${path}`;
    }
    return path;
  },
  clean(value) {
    const path = String(value).replace(/^\/fundthred(?=[/?#]|$)/, '').replace(/^([?#]|$)/, '/$1');
    return path.replace(/^\/([a-z0-9-]+)\/finance-operations(?=[?#]|$)/, '/app/$1');
  }
};
