import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { TutoringSessionNote } from '../models/TutoringSessionLearning.model.js';
import { generateClinicalRecordPdf } from './clinicalRecordPdf.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import { recordClientDemographics, recordClientGuardians } from './recordClientIdentity.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
const fail = (status, message) => Object.assign(new Error(message), { status });

// Call only after assigned-session access has been verified by the route.
export async function tutoringSessionPdf(req, sessionId, dependencies = {}) {
  const db = dependencies.db || pool, render = dependencies.render || generateClinicalRecordPdf;
  const note = await (dependencies.notes || TutoringSessionNote).findBySession(Number(sessionId));
  if (!note) throw fail(404, 'Save the session record before downloading its PDF.');
  const [[session]] = await db.execute(`SELECT s.*, c.organization_id FROM learning_class_sessions s
    JOIN learning_program_classes c ON c.id=s.learning_class_id
    JOIN tutoring_session_clients sc ON sc.session_id=s.id AND sc.client_id=? WHERE s.id=?`, [note.client_id, Number(sessionId)]);
  if (!session || Number(session.organization_id) !== Number(note.agency_id)) throw fail(409, 'This session record needs a student-link review before export.');
  const [client, agency, tutor] = await Promise.all([
    (dependencies.clients || Client).findById(note.client_id), (dependencies.agencies || Agency).findById(note.agency_id),
    (dependencies.users || User).findById(session.provider_user_id)
  ]);
  if (!client || !agency) throw fail(409, 'The student or organization record is unavailable.');
  const [demographics, guardians] = await Promise.all([(dependencies.recordDemographics || recordClientDemographics)(client), (dependencies.recordGuardians || recordClientGuardians)(note.client_id)]);
  client.recordDemographics = demographics; client.recordGuardians = guardians;
  const tutorName = [tutor?.first_name, tutor?.last_name].filter(Boolean).join(' ') || 'Assigned tutor';
  const timeZone = agency.timezone || 'America/Denver';
  const actualComplete = !!(session.actual_started_at && session.actual_ended_at);
  const start = actualComplete ? session.actual_started_at : session.starts_at, end = actualComplete ? session.actual_ended_at : session.ends_at;
  const dateOfService = start ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utcMysqlToIso(start))) : null;
  const localTime = instant => instant ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(utcMysqlToIso(instant))) : null;
  const actualDuration = session.actual_started_at && session.actual_ended_at ? Math.max(0, Math.round((new Date(utcMysqlToIso(session.actual_ended_at)) - new Date(utcMysqlToIso(session.actual_started_at))) / 60000)) : null;
  const sessionType = session.delivery_context || note.session_type;
  const history = (note.metadata_json?.documentationHistory || []).map((entry, index) => ({
    entry_kind: 'correction', created_at: entry.savedAt, created_by_user_id: entry.savedByUserId,
    entry_reason: `Earlier session documentation ${index + 1}; retained when the session record was updated.`,
    body: { summary: entry.summary, nextSteps: entry.nextSteps, strengthsObserved: entry.strengthsObserved,
      challengesObserved: entry.challengesObserved, homework: entry.homework, parentUpdateDraft: entry.parentUpdateDraft }
  }));
  const record = { ...note, title: 'Tutoring Session Record', created_by_user_id: note.created_by_user_id,
    note_payload: { sections: { 'Session summary': note.summary || 'No summary recorded.', ...(note.metadata_json?.planChecklist ? {} : Object.fromEntries([['Strengths observed',note.strengths_observed],['Challenges observed',note.challenges_observed],['Next steps',note.next_steps],['Homework',note.homework]].filter(([,value])=>value))) } },
    metadata_json: { dateOfService, serviceCode: 'Tutoring',
      sessionContext: { startTimeLocal: localTime(start), endTimeLocal: localTime(end), durationMinutes: actualDuration, participantsDetail: note.metadata_json?.planChecklist?.participantDetails || null, participants: { student: client.full_name, assignedTutor: tutorName },
        locationLabel: sessionType === 'virtual' ? 'Virtual tutoring' : sessionType === 'in_person' ? 'In person' : null },
      structuredChart: { ...(note.metadata_json?.planChecklist?.planTitle ? { learningPlan: note.metadata_json.planChecklist.planTitle } : {}), sessionTiming: actualDuration != null ? 'Recorded actual session times' : 'Scheduled session times; actual duration not recorded', ...(!actualComplete && session.actual_started_at ? { recordedActualStart: utcMysqlToIso(session.actual_started_at) } : {}), ...(!actualComplete && session.actual_ended_at ? { recordedActualEnd: utcMysqlToIso(session.actual_ended_at) } : {}) } } };
  const names = { [session.provider_user_id]: tutorName };
  for (const actorId of new Set([note.saved_by_user_id, ...history.map(entry => entry.created_by_user_id)].filter(Boolean))) {
    if (!names[actorId]) { const actor = await (dependencies.users || User).findById(actorId); names[actorId] = [actor?.first_name, actor?.last_name].filter(Boolean).join(' ') || 'Recorded tutor'; }
  }
  const bytes = await render({ client, agency, recordType: 'tutoring', singleDocument: true, recordTitle: 'Tutoring Session Record', names,
    notes: [{ note: record, session: { scheduled_start_at: start ? utcMysqlToIso(start) : null, scheduled_end_at: end ? utcMysqlToIso(end) : null, source_timezone: timeZone }, addenda: history }] });
  await (dependencies.audit || clinicalAudit)({ req, kind: 'tutoring', sessionId: Number(sessionId), agencyId: note.agency_id, actor: `user-${req.user.id}` }, 'tutoring_session_pdf_exported', { noteId: note.id });
  return { bytes, filename: `tutoring-session-${Number(sessionId)}.pdf` };
}
