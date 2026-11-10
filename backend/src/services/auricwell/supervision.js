import pool from '../../config/database.js';
import { owningAgency } from './sharedPatients.js';
import { staffIdentity } from './sharedProviders.js';
import { has, requireAddon, fail } from './policy.js';

export async function supervisionActor(ctx, d = { pool, owningAgency, staffIdentity }) {
  requireAddon(ctx, 'supervision');
  if (!has(ctx, 'clinical') && !has(ctx, 'supervise') && !has(ctx, 'admin')) throw fail(403, 'Clinical or supervision permission is required.');
  const agencyId = await d.owningAgency(ctx, d.pool), identity = await d.staffIdentity(ctx, ctx.accountId, d.pool);
  if (!identity?.active) throw fail(403, 'Connect an active shared staff identity before using supervision.');
  const [[user]] = await d.pool.execute('SELECT * FROM users WHERE id=? AND is_active=1', [identity.userId]);
  if (!user) throw fail(403, 'Shared staff identity is unavailable.');
  return { user, agencyId, canManage: has(ctx, 'supervise') || has(ctx, 'admin'), admin: has(ctx, 'admin') };
}
