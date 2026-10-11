import { kioskCookieName, kioskCookieOptions, readOfficeDevice } from '../services/officeKioskAccess.service.js';

// Fetch Metadata plus strict host-only cookies prevent cross-site setup and writes.
export function kioskSameOrigin(req, res, next) {
  if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: { message: 'Open this kiosk directly to continue.' } });
  const origin = req.get('Origin');
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.host !== req.get('Host') || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) return res.status(403).json({ error: { message: 'Open this kiosk directly to continue.' } });
    } catch { return res.sendStatus(403); }
  }
  next();
}
export async function requireOfficeDevice(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    const token = req.cookies?.[kioskCookieName()];
    const device = await readOfficeDevice(token);
    if (!device) return res.status(401).json({ error: { code: 'KIOSK_LOCKED', message: 'Enter your office code to unlock this kiosk.' } });
    if (req.params.locationId && Number(req.params.locationId) !== Number(device.locationId)) {
      return res.status(403).json({ error: { code: 'KIOSK_WRONG_OFFICE', message: 'This device belongs to a different office.' } });
    }
    if (device.renew) res.cookie(kioskCookieName(), token, kioskCookieOptions());
    req.officeDevice = device;
    next();
  } catch (error) { next(error); }
}
