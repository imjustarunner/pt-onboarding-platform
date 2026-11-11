import crypto from 'node:crypto';
import IntakeLink from '../models/IntakeLink.model.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import { addressAutocomplete } from '../services/addressAutocomplete.service.js';
import { validateAddressEditContext } from '../services/addressEditContext.service.js';

export function createAddressAutocompleteHandlers({ service = addressAutocomplete, links = IntakeLink, validateContext = validateAddressEditContext } = {}) {
  async function scope(req, publicContextMode, familyMode) {
    if (familyMode) {
      const userId = Number(req.family?.userId), agencyId = Number(req.family?.agencyId);
      if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(agencyId) || agencyId < 1) throw Object.assign(new Error('Open your family dashboard to use address suggestions.'), {status:401,code:'ADDRESS_LOGIN_REQUIRED'});
      return `family:${agencyId}:${userId}`;
    }
    if (publicContextMode) {
      let authorized;
      try { authorized = await validateContext(req.body?.publicContext); } catch { /* Invalid/expired token remains manual. */ }
      if (!authorized) throw Object.assign(new Error('This address editing link is not available.'), {status:404,code:'ADDRESS_EDIT_LINK_NOT_AVAILABLE'});
      return `context:${crypto.createHash('sha256').update(JSON.stringify([authorized,req.body?.publicContext,getClientIpAddress(req)||req.ip])).digest('hex')}`;
    }
    const publicKey = String(req.params?.publicKey || '');
    if (publicKey) {
      const link = await links.findByPublicKey(publicKey);
      if (!link || ![true, 1, '1'].includes(link.is_active)) throw Object.assign(new Error('This enrollment link is not available.'), { status: 404, code: 'INTAKE_LINK_NOT_AVAILABLE' });
      return `intake:${crypto.createHash('sha256').update(`${publicKey}:${getClientIpAddress(req) || req.ip}`).digest('hex')}`;
    }
    if (!req.user?.id) throw Object.assign(new Error('Sign in to use address suggestions.'), { status: 401, code: 'ADDRESS_LOGIN_REQUIRED' });
    return req.auricwellPreview?.agencyId ? `practice:${Number(req.auricwellPreview.agencyId)}:user:${Number(req.user.id)}` : `user:${Number(req.user.id)}`;
  }
  const handler = (action, publicContextMode = false, familyMode = false) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const authorizedScope = await scope(req, publicContextMode, familyMode);
      const result = await service[action]({
        ...(action === 'suggest' ? { query: req.body?.query, sessionToken: req.body?.sessionToken } : { selectionToken: req.body?.selectionToken }),
        locale: req.body?.locale, scope: authorizedScope
      });
      return res.json(action === 'suggest' ? { suggestions: result } : { address: result });
    } catch (error) {
      // Never log typed addresses, upstream request URLs, API keys, or raw provider responses.
      const publicCodes = ['ADDRESS_EDIT_LINK_NOT_AVAILABLE', 'INTAKE_LINK_NOT_AVAILABLE', 'ADDRESS_LOGIN_REQUIRED', 'INVALID_ADDRESS_QUERY', 'ADDRESS_SELECTION_EXPIRED', 'ADDRESS_NEEDS_REVIEW'];
      const status = publicCodes.includes(error.code) && [400, 401, 404].includes(error.status) ? error.status : 503;
      return res.status(status).json({ error: { code: status === 503 ? 'ADDRESS_LOOKUP_UNAVAILABLE' : error.code, message: status === 503 ? 'Address suggestions are unavailable. Enter the address manually.' : error.message } });
    }
  };
  return { suggest: handler('suggest'), select: handler('select'), contextSuggest: handler('suggest', true), contextSelect: handler('select', true), familySuggest: handler('suggest', false, true), familySelect: handler('select', false, true) };
}
export const addressAutocompleteHandlers = createAddressAutocompleteHandlers();
