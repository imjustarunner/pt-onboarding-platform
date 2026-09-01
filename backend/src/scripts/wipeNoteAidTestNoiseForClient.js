/**
 * Wipe Note Aid test noise for one client OR an entire agency:
 * - All scale-over-time objective ratings
 * - Auto "Intake Treatment Plan — …" chart plans (not Note Aid imported plans)
 *
 * Does NOT delete: imported treatment plans, intake notes, diagnoses, demographics,
 * signed progress notes, or client records.
 *
 * Run:
 *   node src/scripts/wipeNoteAidTestNoiseForClient.js [clientId] [agencyId]
 *   node src/scripts/wipeNoteAidTestNoiseForClient.js --agency 377
 *   node src/scripts/wipeNoteAidTestNoiseForClient.js --agency "The Inner Strength Institute"
 *
 * Default (no args): agency 377 (The Inner Strength Institute)
 */
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalTreatmentObjectiveRating from '../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import { isIntakeAutoTreatmentPlan } from '../services/treatmentPlanPrecedence.service.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const agencyFlagIdx = args.findIndex((a) => a === '--agency' || a === '-a');
  if (agencyFlagIdx >= 0) {
    return { mode: 'agency', agencyArg: args[agencyFlagIdx + 1] || '377' };
  }
  if (!args.length) {
    return { mode: 'agency', agencyArg: '377' };
  }
  return {
    mode: 'client',
    clientId: Number(args[0]),
    agencyId: Number(args[1] || 0) || null
  };
}

async function resolveAgencyId(agencyArg) {
  const asNum = Number(agencyArg);
  if (Number.isInteger(asNum) && asNum > 0) return asNum;
  const name = String(agencyArg || '').trim();
  if (!name) return null;
  const [rows] = await pool.execute(
    `SELECT id, name FROM agencies WHERE name = ? OR name LIKE ? ORDER BY id LIMIT 5`,
    [name, `%${name}%`]
  );
  if (!rows?.length) return null;
  if (rows.length > 1) {
    console.error('Multiple agencies matched; pass a numeric agency id:');
    for (const r of rows) console.error(`  ${r.id}  ${r.name}`);
    return null;
  }
  return Number(rows[0].id);
}

async function wipeClient({ clientId, agencyId = null }) {
  const ratingDeleted = await ClinicalTreatmentObjectiveRating.deleteByClient({ clientId, agencyId });
  console.log(`  client ${clientId}: deleted ${ratingDeleted} rating row(s)`);

  const planParams = agencyId ? [clientId, agencyId] : [clientId];
  const [planRows] = await clinicalPool.execute(
    agencyId
      ? `SELECT id, title, status, source_tool_id, agency_id
         FROM clinical_treatment_plans
         WHERE client_id = ? AND agency_id = ?`
      : `SELECT id, title, status, source_tool_id, agency_id
         FROM clinical_treatment_plans
         WHERE client_id = ?`,
    planParams
  );

  const intakePlans = (planRows || []).filter((p) => isIntakeAutoTreatmentPlan(p));
  let plansDeleted = 0;
  for (const plan of intakePlans) {
    const pid = Number(plan.id);
    const conn = await clinicalPool.getConnection();
    try {
      await conn.beginTransaction();
      const [objRows] = await conn.execute(
        `SELECT o.id
         FROM clinical_treatment_plan_objectives o
         INNER JOIN clinical_treatment_plan_goals g ON g.id = o.goal_id
         WHERE g.treatment_plan_id = ?`,
        [pid]
      );
      const objectiveIds = (objRows || []).map((o) => Number(o.id)).filter(Boolean);
      if (objectiveIds.length) {
        const ph = objectiveIds.map(() => '?').join(',');
        await conn.execute(
          `DELETE FROM clinical_treatment_objective_ratings WHERE objective_id IN (${ph})`,
          objectiveIds
        );
        await conn.execute(
          `DELETE FROM clinical_treatment_plan_objectives WHERE id IN (${ph})`,
          objectiveIds
        );
      }
      await conn.execute(`DELETE FROM clinical_treatment_plan_goals WHERE treatment_plan_id = ?`, [pid]);
      try {
        await conn.execute(`DELETE FROM clinical_treatment_plan_diagnoses WHERE treatment_plan_id = ?`, [pid]);
      } catch {
        // optional table
      }
      await conn.execute(`DELETE FROM clinical_treatment_plans WHERE id = ?`, [pid]);
      await conn.commit();
      plansDeleted += 1;
      console.log(`  client ${clientId}: deleted intake auto plan #${pid}: ${plan.title}`);
    } catch (e) {
      await conn.rollback();
      console.error(`  client ${clientId}: failed deleting plan #${pid}:`, e?.message || e);
    } finally {
      conn.release();
    }
  }

  try {
    const [result] = await clinicalPool.execute(
      agencyId
        ? `UPDATE clinical_treatment_plan_objectives o
           INNER JOIN clinical_treatment_plan_goals g ON g.id = o.goal_id
           INNER JOIN clinical_treatment_plans p ON p.id = g.treatment_plan_id
           SET o.scale_current = COALESCE(o.scale_start, o.scale_current)
           WHERE p.client_id = ? AND p.agency_id = ?`
        : `UPDATE clinical_treatment_plan_objectives o
           INNER JOIN clinical_treatment_plan_goals g ON g.id = o.goal_id
           INNER JOIN clinical_treatment_plans p ON p.id = g.treatment_plan_id
           SET o.scale_current = COALESCE(o.scale_start, o.scale_current)
           WHERE p.client_id = ?`,
      planParams
    );
    const n = Number(result?.affectedRows || 0);
    if (n) console.log(`  client ${clientId}: reset scale_current on ${n} objective(s)`);
  } catch (e) {
    console.warn(`  client ${clientId}: could not reset scale_current:`, e?.message || e);
  }

  return { ratingDeleted, plansDeleted };
}

async function listAgencyClientIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT c.id
     FROM clients c
     WHERE c.agency_id = ?
        OR EXISTS (
          SELECT 1 FROM client_agency_assignments caa
          WHERE caa.client_id = c.id AND caa.agency_id = ? AND caa.is_active = TRUE
        )
     ORDER BY c.id`,
    [agencyId, agencyId]
  );
  return (rows || []).map((r) => Number(r.id)).filter(Boolean);
}

const parsed = parseArgs(process.argv);

if (parsed.mode === 'agency') {
  const agencyId = await resolveAgencyId(parsed.agencyArg);
  if (!agencyId) {
    console.error('Could not resolve agency. Usage: --agency 377');
    process.exit(1);
  }
  const [agencyRows] = await pool.execute('SELECT id, name FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
  const agencyName = agencyRows?.[0]?.name || `Agency #${agencyId}`;
  const clientIds = await listAgencyClientIds(agencyId);
  console.log(`Wiping Note Aid test noise for ${agencyName} (agency_id=${agencyId}), ${clientIds.length} client(s).`);

  // Agency-scoped rating wipe covers any orphan rows even if client list drifts.
  const [ratingResult] = await clinicalPool.execute(
    'DELETE FROM clinical_treatment_objective_ratings WHERE agency_id = ?',
    [agencyId]
  );
  console.log(`Deleted ${Number(ratingResult?.affectedRows || 0)} rating row(s) agency-wide.`);

  let plansDeleted = 0;
  for (const clientId of clientIds) {
    const result = await wipeClient({ clientId, agencyId });
    plansDeleted += result.plansDeleted;
  }

  // Catch intake auto-plans for this agency even if client no longer matches membership query.
  const [leftover] = await clinicalPool.execute(
    `SELECT id, client_id, title FROM clinical_treatment_plans WHERE agency_id = ?`,
    [agencyId]
  );
  for (const plan of (leftover || []).filter((p) => isIntakeAutoTreatmentPlan(p))) {
    const result = await wipeClient({ clientId: Number(plan.client_id), agencyId });
    plansDeleted += result.plansDeleted;
  }

  console.log(`Done. Removed ${plansDeleted} intake auto treatment plan(s) for ${agencyName}. Imported plans and client files kept.`);
  process.exit(0);
}

const { clientId, agencyId } = parsed;
if (!Number.isInteger(clientId) || clientId <= 0) {
  console.error('Usage: node src/scripts/wipeNoteAidTestNoiseForClient.js [clientId] [agencyId]');
  console.error('   or: node src/scripts/wipeNoteAidTestNoiseForClient.js --agency 377');
  process.exit(1);
}

console.log(`Wiping Note Aid test noise for client_id=${clientId}${agencyId ? ` agency_id=${agencyId}` : ''}.`);
const result = await wipeClient({ clientId, agencyId });
console.log(`Done. Removed ${result.plansDeleted} intake auto treatment plan(s). Imported plans and client files kept.`);
process.exit(0);
