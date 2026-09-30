import api from './api';

// Inbox requests must settle so loading/saving controls can recover after a
// connection stalls. Never retry mutations automatically: a send may have landed.
export function messagingRequestOptions(config = {}) {
  return { timeout: 30000, skipGlobalLoading: true, ...config };
}
const messagingApi = (config) => api(messagingRequestOptions(config));
for (const method of ['get', 'delete', 'head']) {
  messagingApi[method] = (url, config) => api[method](url, messagingRequestOptions(config));
}
for (const method of ['post', 'put', 'patch']) {
  messagingApi[method] = (url, data, config) => api[method](url, data, messagingRequestOptions(config));
}
export function messagingError(error, fallback) {
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    return 'The connection took too long. Please try again.';
  }
  return error?.response?.data?.error?.message || fallback;
}
export default messagingApi;
