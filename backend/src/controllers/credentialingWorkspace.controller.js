import pool from '../config/database.js';
import {
  credentialingScope,
  credentialingWorkspace,
  saveCredentialingWorkflow
} from '../services/credentialingWorkspace.service.js';

export async function getCredentialingWorkspace(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store').json(await credentialingWorkspace(req.user, req.query));
  } catch (error) { next(error); }
}

export async function updateCredentialingWorkflow(req, res, next) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw Object.assign(new Error('Provide a credentialing update'), {status: 400});
    }
    const result = await saveCredentialingWorkflow(
      req.user, Number(req.params.agencyId), req.params.kind, Number(req.params.id), req.body
    );
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) { next(error); }
}

export async function getCredentialingWorkflowHistory(req, res, next) {
  try {
    const agencyId = Number(req.params.agencyId);
    await credentialingScope(req.user, agencyId);
    const recordId = Number(req.params.id);
    if (!['provider', 'group', 'payer'].includes(req.params.kind) || !Number.isSafeInteger(recordId) || recordId < 1) {
      throw Object.assign(new Error('Invalid credentialing record'), {status: 400});
    }
    const [items] = await pool.execute(
      `SELECT id, actor_user_id AS actorUserId, before_json AS previous,
        after_json AS changes, created_at AS createdAt
       FROM credentialing_workflow_events
       WHERE agency_id=? AND subject_type=? AND record_id=? ORDER BY id DESC LIMIT 100`,
      [agencyId, req.params.kind, recordId]
    );
    res.set('Cache-Control', 'no-store').json({items});
  } catch (error) { next(error); }
}

export async function getCredentialingOrganizations(req, res, next) {
  try {
    const {organizations} = await credentialingScope(req.user);
    res.set('Cache-Control', 'no-store').json({organizations});
  } catch (error) { next(error); }
}
