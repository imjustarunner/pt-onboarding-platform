// Owner-authorized October 17, 2026. Dry run by default; no client data or outbound email.
import crypto from 'node:crypto';
import pool from '../config/database.js';
import { appendSecurityEvidence } from '../services/securityEvidence.service.js';
const apply = process.argv.includes('--apply');
const actorId = Number(process.argv.find(a => a.startsWith('--actor-user-id='))?.split('=')[1]);
const expected = [
  { id: 538, first: 'Melissa', last: 'Mendez', role: 'admin', enabled: true },
  { id: 539, first: 'Kaitlyn', last: "O'Connell", role: 'super_admin', enabled: true },
  { id: 559, first: 'Hannah', last: 'Inyart', role: 'admin', enabled: true },
  { id: 555, first: 'Loriana', last: 'Pincente', role: 'admin', enabled: false }
];
const logo = '/assets/branding/TheInnerStrengthNowords.png';
const db = await pool.getConnection();
try {
  await db.beginTransaction();
  const [[manager]] = await db.execute("SELECT id FROM agencies WHERE id=1 AND slug='plottwistco' AND is_active=1 AND COALESCE(is_archived,0)=0 FOR UPDATE");
  if (!manager) throw new Error('Expected active PlotTwistCo identity is missing.');
  const [[actor]] = await db.execute("SELECT id,email,role FROM users WHERE id=? AND role='super_admin' AND is_active=1 AND COALESCE(is_archived,0)=0", [actorId || 0]);
  if (apply && !actor) throw new Error('An active authorizing superadmin --actor-user-id is required.');
  const before = { memberships: [] };
  for (const person of expected) {
    const [[account]] = await db.execute('SELECT id,first_name,last_name,role,status FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0 FOR UPDATE', [person.id]);
    if (!account || account.first_name !== person.first || account.last_name !== person.last || account.role !== person.role || !['ACTIVE','ACTIVE_EMPLOYEE'].includes(account.status)) throw new Error(`Account identity changed for ${person.id}; review before applying.`);
    const [memberships] = await db.execute('SELECT user_id,agency_id,is_active,has_billing_access FROM user_agencies WHERE user_id=? FOR UPDATE', [person.id]);
    if (!memberships.some(m => m.agency_id === manager.id && m.is_active)) throw new Error(`PlotTwistCo membership is missing for ${person.id}.`);
    before.memberships.push(...memberships);
  }
  const [[inner]] = await db.execute("SELECT id,logo_url,icon_id FROM agencies WHERE id=377 AND slug='tisi' FOR UPDATE");
  if (!inner || inner.icon_id || (inner.logo_url && inner.logo_url !== logo)) throw new Error('Inner Strength branding changed; review before replacing.');
  before.innerStrength = inner;
  const summary = { apply, managerAgencyId: manager.id, enabledUsers: expected.filter(p => p.enabled).map(p => p.id), disabledUser: 555, innerStrengthLogo: logo };
  if (apply) {
    for (const person of expected) {
      if (person.enabled) await db.execute('UPDATE user_agencies SET has_billing_access=1 WHERE user_id=? AND agency_id=? AND is_active=1', [person.id, manager.id]);
      else await db.execute('UPDATE user_agencies SET has_billing_access=0 WHERE user_id=?', [person.id]);
    }
    await db.execute('UPDATE agencies SET logo_url=? WHERE id=377', [logo]);
    await appendSecurityEvidence({ requestId: crypto.randomUUID(), phase: 'maintenance', userId: actor.id, email: actor.email, role: actor.role,
      method: 'CLI', route: 'maintenance/billing-review-team', clientIp: null, ipSource: 'authorized_maintenance', peerIp: null,
      action: 'billing_review_team_configured', outcome: 'success', statusCode: 200,
      details: { ...summary, before, reason: 'Owner requested explicit PlotTwistCo billing access for these employees, optional support billing, and the existing Inner Strength logo.' } }, db);
    await db.commit();
  } else await db.rollback();
  console.log(JSON.stringify({ ...summary, committed: apply }));
} catch (error) { await db.rollback(); throw error; }
finally { db.release(); await pool.end(); }
