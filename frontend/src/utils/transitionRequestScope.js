// The transition workspace deliberately does not change the navigation shell's
// company. Every chart/file request therefore carries the selected practice.
export function transitionRequestScope(api, agencyId) {
  const config = value => ({ ...value, headers: { ...value?.headers, 'X-Agency-Id': String(agencyId()) } });
  return {
    get: (url, options) => api.get(url, config(options)),
    post: (url, body, options) => api.post(url, body, config(options)),
    put: (url, body, options) => api.put(url, body, config(options))
  };
}
