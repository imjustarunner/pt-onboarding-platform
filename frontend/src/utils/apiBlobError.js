/** Axios blob responses hide JSON error bodies. Recover a readable message. */
export async function messageFromBlobError(error, fallback = 'Request failed') {
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
