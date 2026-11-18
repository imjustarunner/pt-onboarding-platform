import pool from '../config/database.js';
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';
import { TRANSITION_WEEK, TRANSITION_ROLES, TRANSITION_PRACTICES, transitionTaskCatalog, transitionVideoCatalog, emptyTransitionState, hydrateTransitionState } from '../content/transitionWeek.js';
import { validateTransitionState, freezeTransitionRanking, updateTransitionCohort } from '../utils/transitionWeekPolicy.js';
import { sessionBookingProviders } from './clientSessionBookingRollout.service.js';
import { transitionStaff, assertTransitionClient, assertTransitionMeeting } from './transitionWorkspace.service.js';
import { updateTransitionItem, editTransitionVideo } from '../utils/transitionWorkspacePolicy.js';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
function seal(agencyId, state) {
  if (!isChatEncryptionConfigured()) throw Object.assign(new Error('Encryption is required for transition evidence.'), { status: 503 });
  return JSON.stringify(encryptChatText(JSON.stringify({ agencyId, week: TRANSITION_WEEK, state })));
}
function open(agencyId, payload) {
  const value = JSON.parse(decryptChatText(parse(payload)));
  if (value.agencyId !== agencyId || value.week !== TRANSITION_WEEK) throw new Error('Transition evidence context does not match.');
  return hydrateTransitionState(value.state);
}
const response = (agencyId, revision, state) => ({ week: TRANSITION_WEEK, revision, catalog: transitionTaskCatalog(agencyId), videoCatalog: transitionVideoCatalog(agencyId, state), removedVideos: transitionVideoCatalog(agencyId, { ...state, removedVideoIds: [] }).filter(v => state.removedVideoIds.includes(v.id)), practice: TRANSITION_PRACTICES.find(p => p.id === agencyId) || null, roles: TRANSITION_ROLES, state });
export async function readTransitionWeek(agencyId, db = pool) {
  const [[row]] = await db.execute('SELECT revision,payload_json FROM practice_transition_weeks WHERE agency_id=? AND week_start=?', [agencyId, TRANSITION_WEEK]);
  return response(agencyId, Number(row?.revision || 0), row ? open(agencyId,row.payload_json) : emptyTransitionState());
}
export async function saveTransitionWeek({ agencyId, actorUserId, input }, dbPool = pool) {
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('INSERT IGNORE INTO practice_transition_weeks (agency_id,week_start,payload_json,updated_by_user_id) VALUES (?,?,?,?)', [agencyId, TRANSITION_WEEK, seal(agencyId, emptyTransitionState()), actorUserId]);
    const [[row]] = await db.execute('SELECT revision,payload_json FROM practice_transition_weeks WHERE agency_id=? AND week_start=? FOR UPDATE', [agencyId, TRANSITION_WEEK]);
    if (!Number.isSafeInteger(input?.revision) || input.revision !== Number(row.revision)) throw Object.assign(new Error('This board changed. Refresh before saving; your evidence has not been overwritten.'), { status: 409 });
    let state = open(agencyId, row.payload_json);
    if (input.action === 'save') state = validateTransitionState(input.state, state, agencyId, actorUserId);
    else if (input.action === 'freeze_ranking' || input.action === 'freeze_workspace_ranking') {
      if (agencyId !== 2) throw Object.assign(new Error('Groups-of-five ranking belongs to ITSCO.'), { status: 400 });
      if (state.ranking) throw Object.assign(new Error('The ranking is frozen. Preserve it and document exceptions in the tracker.'), { status: 409 });
      const providers = input.action === 'freeze_workspace_ranking' ? await transitionStaff(agencyId, db) : await sessionBookingProviders(agencyId, db);
      state.ranking = freezeTransitionRanking(input.rows, providers, input.sourceReference);
      await db.execute(`UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.transitionWeek',CAST(? AS JSON)) WHERE id=?`, [JSON.stringify({ week: TRANSITION_WEEK, enforceCohorts: true }), agencyId]);
    } else if (input.action === 'workspace_item') {
      const staff = await transitionStaff(agencyId, db);
      state = updateTransitionItem(state, input, staff, actorUserId, new Date(), agencyId);
      if (input.kind === 'clients') { const [providerId,clientId] = String(input.key).split(':').map(Number); await assertTransitionClient(agencyId,providerId,clientId,db); }
    } else if (input.action === 'ranking_draft') {
      if (agencyId !== 2 || state.ranking) throw Object.assign(new Error('The confirmed order is retained. Use the existing groups.'), { status: 409 });
      const staff = await transitionStaff(agencyId, db);
      const rows = Array.isArray(input.rows) ? input.rows : [];
      if (rows.length > 1000 || new Set(rows.map(r=>r.providerId)).size !== rows.length || rows.some(r => !staff.some(p=>p.id===r.providerId) || ['completedFourWeeks','upcomingWeek'].some(k=>r[k]!==null && (!Number.isSafeInteger(r[k]) || r[k]<0)))) throw Object.assign(new Error('Use whole session counts; leave unknown counts blank.'), {status:400});
      const sourceReference = typeof input.sourceReference === 'string' ? input.sourceReference.trim() : '';
      if (sourceReference.length > 1000) throw Object.assign(new Error('Shorten the source note.'), {status:400});
      state.workspace.rankingDraft = { rows,sourceReference,updatedAt:new Date().toISOString(),updatedByUserId:actorUserId };
    } else if (input.action === 'video') {
      state = editTransitionVideo(state,input,agencyId,actorUserId);
      if (state.tasks.videos_ready?.status === 'passed') state.tasks.videos_ready = { ...state.tasks.videos_ready, status:'in_progress', nextAction:'Review the changed video list before marking training videos ready.' };
    } else if (input.action === 'link_meeting') {
      if (!['people','groups'].includes(input.kind) || !Number.isSafeInteger(input.eventId)) throw Object.assign(new Error('Choose a group or employee and a meeting.'), {status:400});
      state = updateTransitionItem(state,{...input,patch:{}},await transitionStaff(agencyId,db),actorUserId);
      await assertTransitionMeeting(agencyId,actorUserId,input.eventId,db);
      const item = state.workspace[input.kind][input.key];
      item.meetingIds = [...new Set([...(item.meetingIds || []),input.eventId])];
    } else if (input.action === 'cohort') state = updateTransitionCohort(state, Number(input.cohort), input, actorUserId);
    else throw Object.assign(new Error('Choose a supported transition action.'), { status: 400 });
    const revision = Number(row.revision) + 1, payload = seal(agencyId, state);
    await db.execute('UPDATE practice_transition_weeks SET revision=?,payload_json=?,updated_by_user_id=?,updated_at=UTC_TIMESTAMP(3) WHERE agency_id=? AND week_start=?', [revision, payload, actorUserId, agencyId, TRANSITION_WEEK]);
    await db.execute('INSERT INTO practice_transition_week_events (agency_id,week_start,revision,actor_user_id,payload_json) VALUES (?,?,?,?,?)', [agencyId, TRANSITION_WEEK, revision, actorUserId, payload]);
    await db.commit();
    return response(agencyId, revision, state);
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
