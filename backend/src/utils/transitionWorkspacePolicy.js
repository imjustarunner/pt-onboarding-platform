import { randomUUID } from 'node:crypto';
import { emptyTransitionVideo, transitionVideoCatalog } from '../content/transitionWeek.js';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (value, max) => typeof value === 'string' && value.length <= max ? value.trim() : fail('Enter a shorter description.');
const date = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value);
export const TRANSITION_CHECKS = {
  people: ['clients_current','records','schedules','families','training','login','google','therapynotes','transitioned'],
  groups: ['clients_current','records','schedules','families','meeting','training','login','google','therapynotes'],
  clients: ['upToDate','records','schedule','familyReady','transitioned']
};
export function updateTransitionItem(state, input, staff, actorUserId, now = new Date(), agencyId = null) {
  const kind = input.kind;
  if (!TRANSITION_CHECKS[kind]) fail('Choose a person, group or client checklist.');
  const key = String(input.key || '');
  if (kind === 'clients' ? !/^[1-9]\d*:[1-9]\d*$/.test(key) : !/^[1-9]\d*$/.test(key)) fail('Choose a valid checklist.');
  if (kind === 'groups' && !state.ranking?.rows.some(p => p.cohort === Number(key))) fail('Confirm the group order before saving a group checklist.');
  const personId = Number(key.split(':')[0]);
  if (kind !== 'groups' && !staff.some(p => p.id === personId)) fail('Choose an active employee in this practice.');
  const workspace = state.workspace || { people: {}, groups: {}, clients: {} };
  const old = workspace[kind]?.[key] || {};
  const row = { ...old, checks: { ...old.checks }, meetingIds: old.meetingIds || [] };
  const patch = input.patch || {};
  for (const field of ['ownerUserId','recordsOwnerUserId','scheduleOwnerUserId']) {
    if (patch[field] === undefined) continue;
    const value = patch[field] === null || patch[field] === '' ? null : Number(patch[field]);
    if (value !== null && !staff.some(p => p.id === value)) fail('Assign an active staff member from this practice.');
    row[field] = value;
  }
  if (patch.dueDate !== undefined) { row.dueDate = text(patch.dueDate,10); if (!date(row.dueDate)) fail('Choose a valid due date.'); }
  if (patch.note !== undefined) row.note = text(patch.note,1500);
  if (patch.checks !== undefined) {
    if (!patch.checks || Array.isArray(patch.checks) || typeof patch.checks !== 'object') fail('Choose a checklist step.');
    for (const [step, done] of Object.entries(patch.checks)) {
      if (!TRANSITION_CHECKS[kind].includes(step) || typeof done !== 'boolean') fail('Choose a valid checklist step.');
      if (done && !staff.some(p => p.id === (kind === 'clients' ? (step === 'schedule' ? row.scheduleOwnerUserId : row.recordsOwnerUserId) : row.ownerUserId))) fail('Assign the responsible person before checking off this work.');
      if (done !== Boolean(old.checks?.[step]?.done)) row.checks[step] = { done, at: now.toISOString(), by: actorUserId };
    }
  }
  if (kind === 'clients' && row.checks.transitioned?.done && ['upToDate','records','schedule','familyReady'].some(k => !row.checks[k]?.done)) fail('Finish the client’s records, schedule and family checks before marking the transition complete.');
  if (kind === 'people' && row.checks.transitioned?.done && TRANSITION_CHECKS.people.filter(k=>k!=='transitioned' && !(Number(agencyId)===377 && ['login','google'].includes(k))).some(k=>!row.checks[k]?.done)) fail('Finish this employee’s checklist before marking the transition complete.');
  row.updatedAt = now.toISOString(); row.updatedByUserId = actorUserId;
  return { ...state, workspace: { ...workspace, [kind]: { ...workspace[kind], [key]: row } } };
}
export function editTransitionVideo(state, input, agencyId, actorUserId, now = new Date()) {
  const all = transitionVideoCatalog(agencyId, { ...state, removedVideoIds: [] });
  const existing = all.find(v => v.id === input.id);
  if (input.operation === 'remove' || input.operation === 'restore') {
    if (!existing) fail('Choose a training video in this practice.');
    const removed = new Set(state.removedVideoIds || []);
    if (input.operation === 'remove') removed.add(input.id); else removed.delete(input.id);
    return { ...state, removedVideoIds: [...removed] };
  }
  if (input.operation !== 'add') fail('Choose a supported video action.');
  if ((state.customVideos || []).length >= 100) fail('Use up to 100 additional videos.');
  const title = text(input.title,180), outcome = text(input.outcome || '',1000), dueDate = text(input.dueDate || '',10);
  if (!title || !dueDate || !date(dueDate)) fail('Add a title and a valid due date.');
  const id = `custom_${randomUUID()}`;
  return { ...state, customVideos: [...(state.customVideos || []), { id,title,outcome,dueDate,role:'Assigned trainer',minutes:null,createdByUserId:actorUserId,createdAt:now.toISOString() }], videos: { ...state.videos, [id]: { ...emptyTransitionVideo(),dueDate } } };
}
