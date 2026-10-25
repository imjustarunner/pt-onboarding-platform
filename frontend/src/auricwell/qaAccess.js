export const QA_SLUG = 'auricwell-qa-demo';
export function qaSections(role) {
  const base=['overview','appointments','clients','providers','notifications','account','settings','reports'];
  if(role==='provider') return [...base,'documentation','payroll'];
  if(role==='support') return base;
  if(role==='admin') return [...base,'documentation','billing','payroll'];
  return [];
}
