// Native scheduling uses the full suite's authenticated APIs. Each endpoint
// retains its own role, membership, assignment and mutation checks. Other EHR
// surfaces retain their explicit practice boundary. The demo uses its adapter.
export function usesSharedScheduleApi(route,url) {
  return ['appointments','my-schedule'].includes(route?.params?.section)
    && !/^\/(?:auricwell-preview|portal-admin)(?:\/|$)/.test(String(url));
}

const workspaceSections=new Set(['overview','appointments','my-schedule','clients','portal','documentation','billing','providers','reports','compliance','account','settings','payroll','notifications','announcements']);
// Shared components can open full-suite tools that have no AuricWell route.
// Leave the standalone entry for those links instead of rendering Page unavailable.
export function fullSuiteDestination(to,from) {
  if(to.name==='full-suite')return to.fullPath;
  if(!['appointments','my-schedule'].includes(from?.params?.section))return null;
  const section=to.params?.section;
  if(section&&!workspaceSections.has(section))return to.fullPath;
  if(!section&&['admin','dashboard','my-schedule','note-aid'].includes(to.params?.organizationSlug))return to.fullPath;
  return null;
}
