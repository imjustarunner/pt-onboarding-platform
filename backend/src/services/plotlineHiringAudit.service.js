import {withQaAutomationAttribution} from '../utils/qaAutomationAttribution.js';

// Run inside the mutation's transaction. A retry that reuses a form does not
// manufacture a second creation event; existing historical gaps stay intact.
export async function appendPlotlineHiringEvent(executor, {agencyId, actorUserId, action, objectId, metadata = {}}) {
  await executor.execute(`INSERT INTO plotline_audit_events
    (agency_id,actor_user_id,action,object_id,metadata_json,created_at)
    SELECT agency_id,?,?,?,?,? FROM plotline_companies WHERE agency_id=?`,
    [actorUserId, action, String(objectId), JSON.stringify(withQaAutomationAttribution(metadata, actorUserId) || {}), new Date().toISOString().slice(0, 19).replace('T', ' '), agencyId]);
}
