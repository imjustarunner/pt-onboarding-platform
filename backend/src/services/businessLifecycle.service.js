import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { BUSINESS_JOURNEY, BusinessLifecycleError, emptyLifecycle, validateLifecycle, businessFinancialSnapshot } from './businessLifecyclePolicy.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const financial = state => ({ agreements: state.agreements, revenue: state.revenue });
export function createBusinessLifecycleService(pool) {
  async function resolve(db, scope, lock = false) {
    if (scope.requestId) {
      const [[request]] = await db.execute(`SELECT id, agency_id, status FROM business_onboarding_requests WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [scope.requestId]);
      if (!request) throw new BusinessLifecycleError(404, 'Business request not found.');
      if (lock && ['activated', 'declined'].includes(request.status)) throw new BusinessLifecycleError(409, request.status === 'activated' ? 'This business has a workspace. Continue its journey from company settings.' : 'A declined request cannot be edited.');
      return { column: 'request_id', value: request.id, agencyId: request.agency_id || null };
    }
    const id = Number(scope.agencyId);
    if (!Number.isSafeInteger(id) || id < 1) throw new BusinessLifecycleError(400, 'Choose a valid company.');
    const [[agency]] = await db.execute(`SELECT id, organization_type FROM agencies WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!agency) throw new BusinessLifecycleError(404, 'Company not found.');
    if (!['agency', 'clubwebapp', 'life_coach', 'consultant'].includes(agency.organization_type || 'agency')) throw new BusinessLifecycleError(400, 'Open the parent company to manage its business journey.');
    return { column: 'agency_id', value: id, agencyId: id };
  }
  async function read(db, target, lock = false) {
    const [[row]] = await db.execute(`SELECT * FROM business_lifecycles WHERE ${target.column}=?${lock ? ' FOR UPDATE' : ''}`, [target.value]);
    return row || null;
  }
  const response = (row, target) => ({ state: row ? parse(row.state_json) : emptyLifecycle(), revision: row?.revision || 0, agencyId: target.agencyId, stages: BUSINESS_JOURNEY, updatedAt: row?.updated_at || null });
  return {
    async get(scope) {
      const target = await resolve(pool, scope);
      return response(await read(pool, target), target);
    },
    async save(scope, input, actor) {
      const state = validateLifecycle(input?.state);
      if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw new BusinessLifecycleError(400, 'Reload the business journey before saving.');
      const db = await pool.getConnection();
      try {
        await db.beginTransaction();
        const target = await resolve(db, scope, true);
        const row = await read(db, target, true);
        const before = row ? parse(row.state_json) : emptyLifecycle();
        if ((row?.revision || 0) !== input.revision) throw new BusinessLifecycleError(409, 'Someone else updated this journey. Reload it before saving your changes.');
        if (actor.role !== 'super_admin' && !isDeepStrictEqual(financial(before), financial(state))) throw new BusinessLifecycleError(403, 'Only PlotTwistCo platform administrators can change signed pricing or confirm revenue.');
        if (target.agencyId && !isDeepStrictEqual(financial(before), financial(state))) {
          const [invoices] = await db.execute("SELECT period_start FROM agency_billing_invoices WHERE agency_id=? AND billing_domain='agency_subscription'", [target.agencyId]);
          for (const invoice of invoices) {
            const month = invoice.period_start instanceof Date ? invoice.period_start.toISOString().slice(0, 7) : String(invoice.period_start).slice(0, 7);
            if (!isDeepStrictEqual(businessFinancialSnapshot(before, month), businessFinancialSnapshot(state, month))) throw new BusinessLifecycleError(409, `An invoice already exists for ${month}. Keep its terms and revenue unchanged; add a future agreement version instead.`);
          }
        }
        const id = row?.id || crypto.randomUUID(), revision = input.revision + 1;
        if (row) {
          await db.execute('UPDATE business_lifecycles SET state_json=?,revision=?,updated_by=? WHERE id=?', [JSON.stringify(state), revision, actor.id, id]);
        } else {
          await db.execute('INSERT INTO business_lifecycles (id,request_id,agency_id,state_json,revision,updated_by) VALUES (?,?,?,?,?,?)', [id, scope.requestId || null, target.agencyId, JSON.stringify(state), revision, actor.id]);
        }
        await db.execute('INSERT INTO business_lifecycle_events (lifecycle_id,revision,actor_user_id,state_json) VALUES (?,?,?,?)', [id, revision, actor.id, JSON.stringify(state)]);
        const result = response(await read(db, target), target);
        await db.commit();
        return result;
      } catch (error) { await db.rollback(); throw error; }
      finally { db.release(); }
    },
    async billingState(agencyId) {
      const [[row]] = await pool.execute('SELECT state_json FROM business_lifecycles WHERE agency_id=?', [agencyId]);
      return row ? parse(row.state_json) : emptyLifecycle();
    },
    async withBillingLock(agencyId, expectedState, createInvoice) {
      const db = await pool.getConnection();
      try {
        await db.beginTransaction();
        // All existing subscription accounts can invoice, including affiliated orgs.
        // Lock the agency exactly as lifecycle saves do, without imposing company UI rules.
        await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
        const row = await read(db, { column: 'agency_id', value: agencyId }, true);
        if (!isDeepStrictEqual(financial(row ? parse(row.state_json) : emptyLifecycle()), financial(expectedState))) throw new BusinessLifecycleError(409, 'Billing terms changed while preparing this invoice. Generate it again using the saved terms.');
        const result = await createInvoice(db);
        await db.commit();
        return result;
      } catch (error) { await db.rollback(); throw error; }
      finally { db.release(); }
    }
  };
}
