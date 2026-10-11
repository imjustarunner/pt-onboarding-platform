import * as analytics from '../services/documentAnalytics.service.js';
import pool from '../config/database.js';
const handle = fn => async (req, res, next) => {
  try { res.set('Cache-Control', 'private, no-store'); res.json(await fn(req)); } catch (e) { next(e); }
};
export const start = handle(req => analytics.startDocumentReading(req.user, req.body));
export const event = handle(req => analytics.recordDocumentEvent(req.user, req.body));
export const report = handle(req => analytics.documentAnalyticsReport(req.user, Number(req.query.agencyId), req.query));
export const query = handle(req => analytics.queryDocumentAnalytics(req.user, Number(req.body.agencyId), req.body));
export const portal = action => handle(async req => {
  let documentKey = req.body.documentKey, versionId = req.body.versionId, session;
  if (action !== 'start') {
    const [[owned]] = await pool.execute('SELECT agency_id, document_key, version_id FROM document_reading_sessions WHERE id = ? AND user_id = ?', [req.body.sessionId, req.portalUser.id]);
    if (!owned) throw Object.assign(new Error('Reading session not found.'), { status: 404 });
    session = owned; documentKey = owned.document_key; versionId = owned.version_id;
  }
  // Match each existing reader: handbook access uses company membership (even
  // for legacy prehires without a journey); assigned guides use the hire journey.
  const [[row]] = await pool.execute(documentKey === 'workplace-handbook'
    ? 'SELECT u.*, ua.agency_id FROM users u JOIN user_agencies ua ON ua.user_id = u.id WHERE u.id = ? LIMIT 1'
    : 'SELECT u.*, j.agency_id FROM users u JOIN hire_journeys j ON j.user_id = u.id JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = j.agency_id WHERE u.id = ? LIMIT 1', [req.portalUser.id]);
  if (!row?.agency_id) throw Object.assign(new Error('Onboarding company not found.'), { status: 404 });
  if (session && Number(session.agency_id) !== Number(row.agency_id)) throw Object.assign(new Error('Company access denied.'), { status: 403 });
  const user = { ...row, analyticsPortalVerified: true }, input = { ...req.body, agencyId: row.agency_id, surface: row.status === 'ONBOARDING' ? 'onboarding' : 'prehire' };
  if (documentKey !== 'workplace-handbook') {
    const [[assignment]] = await pool.execute('SELECT id FROM company_document_learning WHERE agency_id = ? AND user_id = ? AND document_key = ? AND version_id = ? AND purpose = \'onboarding\' LIMIT 1', [row.agency_id, row.id, documentKey, versionId]);
    if (row.status !== 'ONBOARDING' || !assignment) throw Object.assign(new Error('Assigned guide not found.'), { status: 403 });
  }
  return action === 'start' ? analytics.startDocumentReading(user, input) : analytics.recordDocumentEvent(user, input);
});
