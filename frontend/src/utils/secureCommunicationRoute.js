const adaptiveJoinNames=new Set(['AdaptiveJoinHub','AdaptiveJoinService','OrganizationAdaptiveJoinAlt','OrganizationAdaptiveJoinService']);
const callRouteNames=new Set([
  'CounselingSession','CounselingJoin','CounselingInvite','OrganizationCounselingSession','OrganizationCounselingJoin','OrganizationCounselingInvite',
  'JoinSupervision','OrganizationJoinSupervision','JoinTeamMeeting','OrganizationJoinTeamMeeting','JoinMyRoom',
  'PersonalMeetingInvitation','InterviewRsvp','PrivateVirtualOffice','OrganizationPrivateVirtualOffice'
]);

// Clinical frames hide surrounding chrome, but authenticated comments and their
// sharing notice remain usable there. Only the actual public/join route excludes
// these hosts; server-side session, relationship and recipient checks still apply.
export function isSecureCommunicationRouteExcluded(route={}) {
  const path=String(route.path || ''),meta=route.meta || {};
  return adaptiveJoinNames.has(route.name) || callRouteNames.has(route.name)
    || path.startsWith('/schoolcarebridge')
    || meta.publicQuickView===true || meta.publicMarketingHub===true || meta.publicPageDesignPreview===true
    || path.startsWith('/quick-view/')
    || /\/(?:counseling\/(?:session|join|invite)|join\/(?:team-meeting|supervision|my-room|invitation))\//.test(path);
}
