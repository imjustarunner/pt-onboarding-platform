// Plotline interviews reuse the meeting infrastructure without enabling general
// meetings, supervision, or another company's events. Normal handler-level
// interviewer authorization is still required after this product boundary.
export async function plotlineInterviewResource(req, agencyId, path, db) {
  const match = path.match(/^\/api\/team-meetings\/(?:join-info\/)?([\w-]+)(?:\/|$)/);
  if (!match) return false;
  const ref = match[1];
  const [[event]] = await db.execute(`SELECT id FROM provider_schedule_events
    WHERE agency_id=? AND meeting_subtype='interview' AND kind='TEAM_MEETING'
      AND (id=? OR host_join_token=? OR participant_join_token=?) LIMIT 1`,
    [agencyId, /^\d+$/.test(ref) ? Number(ref) : 0, ref, ref]);
  return !!event;
}
