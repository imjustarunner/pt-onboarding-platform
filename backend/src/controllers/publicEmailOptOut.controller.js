import {
  resolveOptOutToken,
  applyEmailOptOutFromToken
} from '../services/emailOptOut.service.js';

export async function getEmailOptOutPreview(req, res, next) {
  try {
    const row = await resolveOptOutToken(req.params.token);
    if (!row) {
      return res.status(404).json({ error: { message: 'This opt-out link is invalid.' } });
    }
    if (row.expired) {
      return res.status(400).json({
        error: {
          message:
            row.reason === 'already_used'
              ? 'This opt-out link was already used.'
              : 'This opt-out link has expired.'
        },
        code: row.reason
      });
    }
    res.json({
      ok: true,
      email: row.email,
      agencyName: row.agency_name || null,
      agencyId: row.agency_id || null
    });
  } catch (e) {
    next(e);
  }
}

export async function postEmailOptOutConfirm(req, res, next) {
  try {
    const result = await applyEmailOptOutFromToken(req.params.token, { source: 'email_link' });
    res.json(result);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
}
