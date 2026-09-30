import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { authenticate, requireActiveStatus } from './auth.middleware.js';
import { assertPreviewActor, constrainPreviewInput, previewError, previewRouteAllowed } from '../services/auricwellPreviewPolicy.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

export async function requirePreviewAdmin(req, res, next) {
  try {
    const actor = await User.findById(req.user?.id);
    assertPreviewActor(actor, req.authClaims || req.user);
    req.previewActor = { id: actor.id, role: actor.role, first_name: actor.first_name, last_name: actor.last_name, email: actor.email };
    next();
  } catch (error) { next(error); }
}
export async function assertPreviewRecord(db, table, id, agencyId) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw previewError(400, 'Invalid record.');
  // table is always from the literal mappings below, never request input.
  const [[row]] = await db.execute(`SELECT agency_id FROM ${table} WHERE id=?`, [Number(id)]);
  if (!row || Number(row.agency_id) !== agencyId) throw previewError(404, 'Record unavailable in this practice.');
}
export async function checkPreviewBody(req) {
  const agencyId = req.auricwellPreview?.agencyId;
  if (!agencyId) return;
  constrainPreviewInput(req.body, agencyId);
  const keys = {
    clientId: [pool, 'clients'], client_id: [pool, 'clients'],
    clinicalSessionId: [clinicalPool, 'clinical_sessions'], clinical_session_id: [clinicalPool, 'clinical_sessions'],
    officeEventId: [pool, 'office_events'], office_event_id: [pool, 'office_events'],
    draftId: [pool, 'clinical_note_drafts'], noteId: [clinicalPool, 'clinical_notes']
  };
  for (const [key, [db, table]] of Object.entries(keys)) {
    if (req.body?.[key]) await assertPreviewRecord(db, table, req.body[key], agencyId);
  }
}
export function auricwellPreviewBoundary(req, res, next) {
  const raw = req.get('X-AuricWell-Practice');
  if (!raw) return next();
  authenticate(req, res, error => {
    if (error) return next(error);
    requireActiveStatus(req, res, error => {
      if (error) return next(error);
      requirePreviewAdmin(req, res, async error => {
        if (error) return next(error);
        try {
          const agencyId = Number(raw);
          if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw previewError(400, 'Invalid practice.');
          const agency = await Agency.findById(agencyId);
          if (!agency?.is_active || !['agency', 'clinical'].includes(agency.organization_type || 'agency')) throw previewError(404, 'Practice unavailable.');
          const path = req.path.replace(/\/$/, '') || '/';
          if (!previewRouteAllowed(req.method, path)) throw previewError(403, 'This action is not yet available in the AuricWell preview.');
          req.auricwellPreview = { agencyId };
          constrainPreviewInput(req.query, agencyId);
          req.query.agencyId = String(agencyId);
          req.query.agency_id = String(agencyId);
          req.query.allAccessible = '0';
          req.query.all_agencies = '0';
          for (const [pattern, db, table] of [
            [/^\/clients\/(\d+)/, pool, 'clients'],
            [/^\/medical-billing\/clients\/(\d+)/, pool, 'clients'],
            [/^\/medical-billing\/notes\/(\d+)/, clinicalPool, 'clinical_notes'],
            [/^\/medical-billing\/(?:claimmd\/)?claims\/(\d+)/, clinicalPool, 'clinical_claims'],
            [/^\/clinical-notes\/drafts\/(\d+)/, pool, 'clinical_note_drafts'],
            [/^\/clinical-data\/sessions\/(\d+)/, clinicalPool, 'clinical_sessions'],
            [/^\/appointments\/(\d+)/, pool, 'appointments']
          ]) {
            const match = path.match(pattern);
            if (match) await assertPreviewRecord(db, table, match[1], agencyId);
          }
          const agencyMatch = path.match(/\/agencies\/(\d+)/);
          if (agencyMatch && Number(agencyMatch[1]) !== agencyId) throw previewError(404, 'Practice unavailable.');
          const userMatch = path.match(/^\/users\/(\d+)\/preferences$/);
          if (userMatch && Number(userMatch[1]) !== Number(req.user.id)) throw previewError(404, 'Preferences unavailable.');
          if (req.query.clientId) await assertPreviewRecord(pool, 'clients', req.query.clientId, agencyId);
          for (const id of String(req.query.clientIds || '').split(',').filter(Boolean)) await assertPreviewRecord(pool, 'clients', id, agencyId);
          await checkPreviewBody(req);
          // Do not ingest files through the preview before upload/consent acceptance.
          if (req.is('multipart/form-data')) throw previewError(403, 'File uploads are not enabled in this preview.');
          if (!['GET', 'HEAD'].includes(req.method)) await logAuditEvent(req, { actionType: 'auricwell_preview_action', agencyId, metadata: { method: req.method, path, actorUserId: req.user.id } });
          next();
        } catch (err) { next(err); }
      });
    });
  });
}
