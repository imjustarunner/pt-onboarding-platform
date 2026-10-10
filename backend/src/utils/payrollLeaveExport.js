/** Use the applied payroll snapshot, never submitted leave requests, for export. */
export function appliedLeaveExportHours(snapshot, adjustment = {}) {
  const source = snapshot ?? adjustment;
  const amount = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const sick = amount(source.sickPtoHours ?? source.sick_pto_hours);
  const training = amount(source.trainingPtoHours ?? source.training_pto_hours);
  // Historical payroll used one PTO field. Preserve that amount only when the
  // snapshot has no split hours; do not consult newer, unrun adjustments.
  const legacy = amount(source.ptoHours ?? source.pto_hours);
  const sickHours = sick + training > 0 ? sick : legacy;
  return { sickHours, trainingHours: training, totalHours: sickHours + training };
}
