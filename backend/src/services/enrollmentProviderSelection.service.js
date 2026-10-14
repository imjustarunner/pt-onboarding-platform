import { allowsProviderPreference } from '../utils/intakeProviderPreference.js';
import { listOfficeIntakeProviders } from './officeIntakeProviders.service.js';

const error = (message, status = 409) => Object.assign(new Error(message), { status });
const parse = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value || '{}'); } catch { return {}; } };

export function enrollmentSchedulingPreferences(bag = {}) {
  const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const allowedTimes = ['Morning', 'Afternoon', 'Evening'];
  const choices = (value, allowed) => [...new Set((Array.isArray(value) ? value : []).filter(item => allowed.includes(item)))];
  let timeZone = String(bag.preferred_time_zone || '').slice(0, 100) || 'America/Denver';
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()); } catch { timeZone = 'America/Denver'; }
  const result = { preferredDays: choices(bag.preferred_days, allowedDays), preferredTimes: choices(bag.preferred_times, allowedTimes),
    preferredSchedulingNotes: String(bag.preferred_scheduling_notes || '').trim().slice(0, 1000), preferredTimeZone: timeZone };
  const opening = bag.requested_opening_preference;
  if (opening) {
    const start = new Date(opening.startAt), end = new Date(opening.endAt);
    let openingTimeZone = String(opening.timeZone || timeZone).slice(0, 100);
    try { new Intl.DateTimeFormat('en-US', { timeZone: openingTimeZone }).format(new Date()); } catch { openingTimeZone = timeZone; }
    if (Number.isSafeInteger(Number(opening.providerId)) && Number(opening.providerId) > 0 && Number.isFinite(+start) && Number.isFinite(+end) && +end > +start && +end - +start <= 86400000) {
      result.requestedOpening = { providerId: Number(opening.providerId), startAt: start.toISOString(), endAt: end.toISOString(),
        modality: ['IN_PERSON', 'VIRTUAL'].includes(opening.modality) ? opening.modality : null,
        frequency: ['ONCE', 'WEEKLY', 'BIWEEKLY', 'EVERY_3_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY', 'EITHER'].includes(opening.frequency) ? opening.frequency : 'WEEKLY',
        timeZone: openingTimeZone };
    }
  }
  return result;
}

export function enrollmentModality(value) {
  const normalized = String(value || 'ALL').trim().toUpperCase().replace(/[ -]/g, '_');
  if (['VIRTUAL', 'IN_PERSON'].includes(normalized)) return normalized;
  if (['ALL', 'EITHER', 'BOTH', 'NO_PREFERENCE', ''].includes(normalized)) return 'ALL';
  throw error('Choose virtual, in person, or either before choosing a provider.', 400);
}

/** Derive placement requests from current tenant policies, never browser labels. */
export async function validateEnrollmentProviderSelection({ link, intakeData, agencyId, loadProviders = listOfficeIntakeProviders }) {
  const bag = intakeData?.responses?.submission;
  if (!bag || !allowsProviderPreference(link)) return null;
  delete bag.providerSelection;
  delete bag.providerSelections;
  delete bag.preferredProviderUserId;
  delete bag.preferredProviderId;
  const source = bag.enrollment_source === 'provider' ? 'provider' : 'general';
  const profileId = Number(bag.requested_profile_provider_id || 0);
  let ids = Array.isArray(bag.preferred_office_provider_ids) ? bag.preferred_office_provider_ids.map(Number) : [];
  // A profile entry is itself an explicit desired-provider request. Clinical
  // safety review may clear the chooser IDs, but must retain this staff context.
  if (source === 'provider') {
    if (!Number.isSafeInteger(profileId) || profileId <= 0) throw error('Choose an available provider or start general enrollment.', 400);
    ids = [profileId];
  }
  ids = [...new Set(ids)];
  if (ids.length > 3 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw error('Choose up to three valid provider preferences.', 400);
  if (!ids.length) {
    delete bag.preferred_office_provider_summary;
    delete bag.requested_opening_preference;
    return null;
  }
  const modality = enrollmentModality(bag.preferred_service_format || bag.preferred_modality || bag.preferredModality || bag.requested_opening_preference?.modality);
  const providers = await loadProviders(agencyId, { includeNotAccepting: false, includeWaitlist: true,
    serviceMode: bag.service_subject || bag.serviceSubject || '', programType: modality });
  const selections = ids.map(id => {
    const provider = providers.find(person => Number(person.id) === id);
    if (!provider) throw error('This provider is no longer open to enrollment requests for the selected format. Choose another provider or start general enrollment.');
    const formats = modality === 'ALL' ? ['IN_PERSON', 'VIRTUAL'] : [modality];
    const statuses = provider.intakeStatusByFormat;
    const open = statuses ? formats.some(format => statuses[format] === 'accepting') : provider.acceptingNewClients === true;
    const waitlist = statuses ? formats.some(format => statuses[format] === 'waitlist') : provider.waitlist === true;
    if (!open && !waitlist) throw error('This provider is closed for the selected format. Choose another provider or start general enrollment.');
    return { providerId: id, providerName: provider.name || provider.displayName, status: open ? 'REQUESTED' : 'WAITLIST',
      modality, source, requiresCareCoordination: true, confirmed: false };
  });
  const opening = bag.requested_opening_preference;
  if (opening && !ids.includes(Number(opening.providerId))) throw error('The preferred time belongs to another provider. Please choose it again.', 400);
  bag.preferred_office_provider_ids = selections.map(item => String(item.providerId));
  bag.preferred_office_provider_summary = selections.map((item, i) => `#${i + 1} ${item.providerName} (${item.status === 'WAITLIST' ? 'provider waitlist' : 'requested — pending care coordination'})`).join(', ');
  bag.providerSelection = selections[0];
  bag.providerSelections = selections;
  return selections[0];
}

/** Save a pending request and staff alert atomically. Never create clinical access. */
export async function recordEnrollmentProviderSelection(database, { agencyId, clientIds, submissionId, intakeData, canonicalOpening }) {
  const bag = intakeData?.responses?.submission;
  const selection = bag?.providerSelection;
  if (!submissionId) return;
  for (const clientId of [...new Set((clientIds || []).map(Number).filter(id => id > 0))]) {
    const connection = await database.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT id, provider_id, intake_preferences_json FROM clients WHERE id = ? AND agency_id = ? FOR UPDATE', [clientId, agencyId]);
      const row = rows[0];
      if (!row) { await connection.rollback(); continue; }
      const previous = parse(row.intake_preferences_json);
      const previousSelection = previous.providerSelection;
      const sameSubmission = Number(previousSelection?.submissionId) === Number(submissionId);
      if (!selection) {
        if (sameSubmission) {
          const cleared = { providerSelection: null, providerSelections: null, preferredProviderUserId: null,
            preferred_office_provider_ids: null, preferred_office_provider_summary: null, requestedOpening: null };
          if (previous.waitlist?.source === 'public_provider_selection') cleared.waitlist = { ...previous.waitlist, active: false, removedAt: new Date().toISOString() };
          await connection.execute(`UPDATE clients SET intake_preferences_json = JSON_MERGE_PATCH(COALESCE(intake_preferences_json, JSON_OBJECT()), CAST(? AS JSON)) WHERE id = ? AND agency_id = ?`,
            [JSON.stringify(cleared), clientId, agencyId]);
        }
        await connection.commit();
        continue;
      }
      const sameRequest = sameSubmission && Number(previousSelection?.providerId) === selection.providerId;
      const keepActiveWaitlist = sameRequest && [true, 1].includes(previous.waitlist?.active)
        && Number(previous.waitlist?.providerId || previousSelection?.providerId) === selection.providerId;
      const stamp = { ...selection, status: keepActiveWaitlist ? 'WAITLIST' : selection.status,
        submissionId: Number(submissionId), requestedAt: sameRequest ? previousSelection.requestedAt : new Date().toISOString() };
      const patch = { preferredProviderUserId: selection.providerId, preferred_office_provider_ids: bag.preferred_office_provider_ids,
        preferred_office_provider_summary: bag.preferred_office_provider_summary, providerSelection: stamp,
        providerSelections: bag.providerSelections, preferredModality: selection.modality,
        requestedOpening: null, ...enrollmentSchedulingPreferences(bag) };
      if (keepActiveWaitlist) {
        patch.providerSelections = (bag.providerSelections || [selection]).map(item => item.providerId === selection.providerId ? { ...item, status: 'WAITLIST' } : item);
        patch.preferred_office_provider_summary = patch.providerSelections.map((item, i) => `#${i + 1} ${item.providerName} (${item.status === 'WAITLIST' ? 'provider waitlist' : 'requested — pending care coordination'})`).join(', ');
      }
      if (canonicalOpening !== undefined) patch.requestedOpening = canonicalOpening;
      // Existing care relationships and waitlists stay under staff control.
      const [assignments] = await connection.execute(
        'SELECT id FROM client_provider_assignments WHERE client_id = ? AND is_active = 1 LIMIT 1', [clientId]);
      if (!row.provider_id && !assignments.length) {
        // A provider reopening intake is not a placement or staff removal.
        if (keepActiveWaitlist) patch.waitlist = previous.waitlist;
        else if (selection.status === 'WAITLIST' && !(sameRequest && [false, 0].includes(previous.waitlist?.active))) patch.waitlist = { active: true, providerId: selection.providerId,
          source: 'public_provider_selection', reason: `Requested ${selection.providerName}'s waitlist`, addedAt: stamp.requestedAt };
        else if (previous.waitlist?.source === 'public_provider_selection') patch.waitlist = { ...previous.waitlist, active: false };
      }
      await connection.execute(
        `UPDATE clients SET intake_preferences_json = JSON_MERGE_PATCH(COALESCE(intake_preferences_json, JSON_OBJECT()), CAST(? AS JSON)) WHERE id = ? AND agency_id = ?`,
        [JSON.stringify(patch), clientId, agencyId]);
      if (!sameRequest) await connection.execute(
        `INSERT INTO notifications (type, severity, title, message, audience_json, user_id, agency_id, related_entity_type, related_entity_id, actor_source)
         VALUES ('new_prospective_inquiry', 'info', ?, ?, ?, NULL, ?, 'client', ?, 'public_provider_enrollment')`,
        [selection.status === 'WAITLIST' ? 'Provider waitlist request' : 'Preferred provider enrollment request',
          `An enrollment requested ${selection.providerName}${selection.status === 'WAITLIST' ? "'s waitlist" : ' as the desired provider'}. Review the prospective client and coordinate fit and availability. This is not a confirmed provider assignment.`,
          JSON.stringify({ admin: true, provider: false, supervisor: true, clinicalPracticeAssistant: false, schoolStaff: false, guardian: false }), agencyId, clientId]);
      await connection.commit();
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  }
}
