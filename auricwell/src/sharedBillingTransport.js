import { api } from './api.js';

// Shared billing components use an axios-shaped interface. Keep every request on
// the current AuricWell session and practice; never use the full-suite auth cookie.
export function sharedBillingTransport(base) {
  async function request(method, path, body, params) {
    if (!path.startsWith('/medical-billing/')) throw new Error('Unsupported billing route.');
    const search = new URLSearchParams(Object.entries(params || {}).filter(([, value]) => value != null)).toString();
    try {
      const data = await api(`${base}/shared-billing/${path.slice('/medical-billing/'.length)}${search ? `?${search}` : ''}`, { method, body });
      return { data };
    } catch (error) {
      error.response = { status: error.status, data: { error: { message: error.message } } };
      throw error;
    }
  }
  return {
    get: (path, options) => request('GET', path, undefined, options?.params),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
  };
}
