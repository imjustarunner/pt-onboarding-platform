import UserCommunication from '../models/UserCommunication.model.js';

/**
 * 1x1 transparent GIF, base64-decoded ahead of time.
 *
 * Same payload used by the hiring-reference open pixel — small enough to embed
 * inline so we never hit disk to serve it.
 */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64'
);

const sendPixel = (res) => {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).send(TRANSPARENT_GIF);
};

/**
 * Public open-tracking endpoint.
 *
 *   GET /api/email/track-open/:token
 *   GET /api/email/track-open/:token.gif
 *
 * Always responds with a 1x1 GIF (HTTP 200) so the recipient never sees a broken
 * image. Whether the open is recorded is best-effort. We strip an optional `.gif`
 * suffix so URLs can include the extension for mail clients that prefetch only
 * known image extensions.
 *
 * Notes / caveats:
 *   * Many clients (Gmail in particular) proxy image requests, which means the
 *     first observed open is the moment the recipient first views the message —
 *     we record only that first open and ignore subsequent hits.
 *   * Image-blocking by the recipient (or "ask before showing images" settings)
 *     means absence of an open event does not prove the email was not read.
 */
export const trackEmailOpen = async (req, res, next) => {
  try {
    const raw = String(req.params?.token || '').trim();
    const token = raw.replace(/\.(gif|png|jpg|jpeg)$/i, '');
    if (!token) {
      sendPixel(res);
      return;
    }
    try {
      await UserCommunication.markOpenedByToken(token);
    } catch (err) {
      // Open tracking must never break the pixel response.
      console.warn('[trackEmailOpen] failed to record open', err?.message || err);
    }
    sendPixel(res);
  } catch (e) {
    // As above — fall through to the pixel even on unexpected errors so the
    // recipient's mail client doesn't show a broken-image placeholder.
    sendPixel(res);
    return next(e);
  }
};
