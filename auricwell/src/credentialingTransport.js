// The existing credentialing editor uses an Axios-shaped transport. Requests
// stay within AuricWell's authenticated practice routes, including file uploads.
export function credentialingTransport(base) {
  async function request(method, path, body, options = {}) {
    if (!/^\/agencies\/(?:credentialing(?:\/|$)|[1-9]\d*\/credentialing(?:\/|$))/.test(path)) throw new Error('Credentialing operation is unavailable.');
    const search = new URLSearchParams(Object.entries(options.params || {}).filter(([, value]) => value != null));
    const isForm = body instanceof FormData;
    const response = await fetch(`/api/auricwell${base}/shared-credentialing${path.slice('/agencies'.length)}${search.size ? `?${search}` : ''}`, {
      method, credentials: 'same-origin', headers: { 'X-AuricWell': '1', ...(!isForm ? { 'Content-Type': 'application/json' } : {}) },
      ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) })
    });
    if (!response.ok) { const data = await response.json(); throw Object.assign(new Error(data.error?.message || 'Credentialing request failed.'), { response: { status: response.status, data } }); }
    return { data: options.responseType === 'blob' ? await response.blob() : await response.json() };
  }
  return { get: (path, options) => request('GET', path, undefined, options), post: (path, body, options) => request('POST', path, body, options), patch: (path, body, options) => request('PATCH', path, body, options), put: (path, body, options) => request('PUT', path, body, options), delete: (path, options) => request('DELETE', path, options?.data, options) };
}
