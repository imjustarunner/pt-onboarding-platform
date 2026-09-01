/**
 * Wipe Note Aid test noise for one client:
 * - All scale-over-time objective ratings
 * - Auto "Intake Treatment Plan — …" chart plans (not Note Aid imported plans)
 *
 * Does NOT delete: imported treatment plans, intake notes, diagnoses, demographics,
 * signed progress notes, or client records.
 *
 * Run: node src/scripts/wipeNoteAidTestNoiseForClient.js [clientId] [agencyId]
 * Default clientId: 2031 (Frank W. Meyers IV in stage — chart display ID 623647 is not clients.id)
 */
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalTreatmentObjectiveRating from '../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import { isIntakeAutoTreatmentPlan } from '../services/treatmentPlanPrecedence.service.js';

const clientId = Number(process.argv[2] || 2031);
const agencyId = Number(process.argv[3] || 0) || null;
if (!Number.isInteger(clientId) || clientId <= 0) {
  console.error('Usage: node src/scripts/wipeNoteAidTestNoiseForClient.js [clientId] [agencyId]');
  process.exit(1);
}

const ratingDeleted = await ClinicalTreatmentObjectiveRating.deleteByClient({ clientId, agencyId });
console.log(`Deleted ${ratingDeleted} objective rating row(s) for client_id=${clientId}.`);

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
    console.log(`Deleted intake auto plan #${pid}: ${plan.title}`);
  } catch (e) {
    await conn.rollback();
    console.error(`Failed deleting plan #${pid}:`, e?.message || e);
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
  console.log(`Reset scale_current on ${Number(result?.affectedRows || 0)} objective(s).`);
} catch (e) {
  console.warn('Could not reset scale_current:', e?.message || e);
}

console.log(`Done. Removed ${plansDeleted} intake auto treatment plan(s). Imported plans and client files kept.`);
process.exit(0);
