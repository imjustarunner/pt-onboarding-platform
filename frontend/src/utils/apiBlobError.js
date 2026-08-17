/** Axios blob responses hide JSON error bodies. Recover a readable message. */
export async function messageFromBlobError(error, fallback = 'Request failed') {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code === 'ECONNABORTED' || /timeout of \d+ms exceeded/i.test(msg)) {
    return 'The packet is still being prepared. Wait a few seconds and try again — it is saved after the first successful render.';
  }
  const data = error?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      const msg = parsed?.error?.message || parsed?.message || parsed?.status;
      if (msg) return String(msg);
    } catch {
      /* not JSON */
    }
  }
  return error?.response?.data?.error?.message || error?.message || fallback;
}
