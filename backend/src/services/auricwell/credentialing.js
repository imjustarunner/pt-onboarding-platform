import pool from '../../config/database.js';
import { owningAgency } from './sharedPatients.js';
import { staffIdentity } from './sharedProviders.js';
import { has, fail, requireAddon } from './policy.js';
import { createCredentialingActor } from '../credentialingAccess.service.js';

export async function credentialingActor(ctx, d = { pool, owningAgency, staffIdentity }) {
  if (!has(ctx, 'admin') && !has(ctx, 'credentialing')) throw fail(403, 'Practice credentialing permission is required.');
  requireAddon(ctx, 'credentialing');
  const agencyId = Number(await d.owningAgency(ctx, d.pool));
  const identity = await d.staffIdentity(ctx, ctx.accountId, d.pool);
  if (!identity?.active) throw fail(403, 'Connect an active shared staff identity before using credentialing.');
  const [[user]] = await d.pool.execute('SELECT * FROM users WHERE id=? AND is_active=1', [identity.userId]);
  if (!user) throw fail(403, 'The shared staff identity is unavailable.');
  return { user: createCredentialingActor(user, agencyId), agencyId };
}

export async function authenticateCredentialingProduct(req, _res, next) {
  try {
    const actor = await credentialingActor(req.aw);
    const pathAgency = /^\/([1-9]\d*)\/credentialing(?:\/|$)/.exec(req.path)?.[1];
    if (pathAgency && Number(pathAgency) !== actor.agencyId) throw fail(403, 'Credentialing is limited to this practice.');
    for (const input of [req.query, req.body]) {
      if (input?.agencyId != null && Number(input.agencyId) !== actor.agencyId) throw fail(403, 'Credentialing is limited to this practice.');
    }
    req.user = actor.user;
    req.query.agencyId = actor.agencyId;
    next();
  } catch (error) { next(error); }
}
