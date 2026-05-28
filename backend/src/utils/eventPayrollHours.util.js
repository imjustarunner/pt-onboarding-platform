export function roundEventPayrollHours(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Compute direct/indirect split from clock times and event direct-hours cap. */
export function computeEventDirectIndirectHours({ clockInAt, clockOutAt, directHoursCap = 0 }) {
  const tIn = clockInAt ? new Date(clockInAt) : null;
  const tOut = clockOutAt ? new Date(clockOutAt) : null;
  if (!tIn || !tOut || !Number.isFinite(tIn.getTime()) || !Number.isFinite(tOut.getTime())) {
    return { workedHours: 0, directHours: 0, indirectHours: 0, directHoursCap: roundEventPayrollHours(directHoursCap) };
  }
  const cap = Number.isFinite(Number(directHoursCap)) && Number(directHoursCap) > 0 ? Number(directHoursCap) : 0;
  const workedHours = Math.max(0, (tOut.getTime() - tIn.getTime()) / 3600000);
  const directHours = Math.min(cap, workedHours);
  const indirectHours = Math.max(0, workedHours - directHours);
  return {
    workedHours: roundEventPayrollHours(workedHours),
    directHours: roundEventPayrollHours(directHours),
    indirectHours: roundEventPayrollHours(indirectHours),
    directHoursCap: roundEventPayrollHours(cap)
  };
}
