/** Preserve all sections on databases that have not received clinical migration 016 yet. */
export async function persistTreatmentPlanSections(connection, { planId, agencyId, clientId, sections }) {
  const fields = new Map([
    ['presenting_problem', sections.presentingProblem || null],
    ['prescribed_frequency', sections.prescribedFrequency || null],
    ['discharge_plan', sections.dischargePlan || null]
  ]);
  const legacy = [
    sections.presentingProblem ? `Presenting Problem\n${sections.presentingProblem}` : '',
    sections.prescribedFrequency ? `Prescribed Frequency of Treatment\n${sections.prescribedFrequency}` : '',
    sections.dischargePlan ? `Discharge Criteria/Planning\n${sections.dischargePlan}` : ''
  ].filter(Boolean).join('\n\n');
  // Retry at most twice, removing only the two optional fields from migration 016.
  for (;;) {
    try {
      await connection.execute(
        `UPDATE clinical_treatment_plans SET ${[...fields.keys()].map((name) => `${name} = ?`).join(', ')}, updated_at = NOW() WHERE id = ? AND agency_id = ? AND client_id = ?`,
        [...fields.values(), planId, agencyId, clientId]
      );
      return;
    } catch (error) {
      const missing = String(error.sqlMessage || error.message || '').match(/['`](presenting_problem|prescribed_frequency)['`]/i)?.[1]?.toLowerCase();
      // Do not suppress permissions, outages or unrelated SQL errors.
      if (error.code !== 'ER_BAD_FIELD_ERROR' || !missing || !fields.has(missing)) throw error;
      fields.delete(missing);
      fields.set('discharge_plan', legacy || null);
    }
  }
}
