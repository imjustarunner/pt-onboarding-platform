import { TRANSITION_STATUSES, TRANSITION_METRICS, TRANSITION_VIDEO_STATUSES, transitionTaskCatalog, transitionVideoCatalog, emptyTransitionVideo } from '../content/transitionWeek.js';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value.trim() : fail('A transition field is missing or too long.');
export function validateTransitionState(input, previous, agencyId = null, actorUserId = null) {
  if (!input || typeof input !== 'object') fail('Transition state is required.');
  const catalog = transitionTaskCatalog(agencyId);
  const state = { ...previous, tasks: { ...previous.tasks }, metrics: {}, videos: { ...previous.videos }, ranking: previous.ranking, cohorts: previous.cohorts };
  for (const definition of catalog) {
    const row = input.tasks?.[definition.id];
    if (!row || !TRANSITION_STATUSES.includes(row.status)) fail('Choose a valid status for every task.');
    state.tasks[definition.id] = { status: row.status, owner: text(row.owner, 120), backup: text(row.backup, 120), evidence: text(row.evidence, 1500), nextAction: text(row.nextAction, 800) };
    if (row.status === 'passed' && (!row.owner.trim() || !row.evidence.trim())) fail('Passed tasks require an owner and evidence.');
    if (['failed', 'deferred'].includes(row.status) && (!row.owner.trim() || !row.nextAction.trim())) fail('Failed or deferred tasks require an owner and next action.');
  }
  for (const task of catalog) {
    if (state.tasks[task.id].status === 'passed' && task.requires.some(id => state.tasks[id].status !== 'passed')) fail(`Complete prerequisites before passing: ${task.title}`);
  }
  if (state.tasks.owners.status === 'passed' && catalog.some(task => !state.tasks[task.id].owner || !state.tasks[task.id].backup)) fail('Assign every task an owner and backup before completing workstream assignments.');
  for (const definition of transitionVideoCatalog(agencyId, previous)) {
    const old = previous.videos?.[definition.id] || { ...emptyTransitionVideo(), dueDate: definition.dueDate };
    const row = input.videos?.[definition.id] || old;
    if (!TRANSITION_VIDEO_STATUSES.includes(row.status)) fail('Choose a valid video production status.');
    const result = { status: row.status, owner: text(row.owner,120), reviewer: text(row.reviewer,120), dueDate: text(row.dueDate,10), url: text(row.url,2000), evidence: text(row.evidence,1500), nextAction: text(row.nextAction,800), completedAt: old.completedAt, completedByUserId: old.completedByUserId };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.dueDate) || !Number.isFinite(Date.parse(result.dueDate)) || new Date(result.dueDate).toISOString().slice(0,10) !== result.dueDate) fail('Every video needs a valid due date.');
    if (result.status !== 'not_started' && !result.owner) fail('Assign the video creator before starting production.');
    if (result.status === 'blocked' && !result.nextAction) fail('Blocked videos require a next action.');
    if (result.url) {
      try { const url = new URL(result.url,'https://app.example.invalid'); if ((!result.url.startsWith('/') && url.protocol !== 'https:') || result.url.startsWith('//') || url.username || url.password || /[\\\u0000-\u0020]/.test(result.url)) throw Error(); }
      catch { fail('Use a permanent HTTPS or authenticated app link for the video.'); }
    }
    if (result.status === 'published') {
      if (!result.url || !result.evidence || !result.reviewer || result.reviewer.toLowerCase() === result.owner.toLowerCase()) fail('Published videos require a watch link, independent reviewer and review evidence.');
      const changed = old.status !== 'published' || ['url','owner','reviewer','evidence'].some(key => old[key] !== result[key]);
      if (changed) { result.completedAt = new Date().toISOString(); result.completedByUserId = actorUserId; }
    } else { result.completedAt = null; result.completedByUserId = null; }
    state.videos[definition.id] = result;
  }
  if (catalog.some(t => t.id === 'videos_ready') && state.tasks.videos_ready.status === 'passed' && transitionVideoCatalog(agencyId, previous).some(v => state.videos[v.id].status !== 'published')) fail('Publish and review every required video before marking training videos ready.');
  if (Number(agencyId) === 2 && state.tasks.cohort_ranking.status === 'passed' && !state.ranking?.rows?.length) fail('The named ITSCO groups need providers with payroll activity before review can be completed.');
  for (const [taskId,stage] of [['cohort_google','google_retired'],['cohort_ehr','ehr_retired'],['cohort_observation','observed']]) {
    if (Number(agencyId) === 2 && state.tasks[taskId].status === 'passed' && !state.cohorts[1]?.[stage]) fail('Record actual first-cohort acceptance before checking off that stage.');
  }
  for (const id of TRANSITION_METRICS) {
    const row = input.metrics?.[id];
    if (!row || (row.total !== null && (!Number.isSafeInteger(row.total) || row.total < 0)) || !Number.isSafeInteger(row.completed) || row.completed < 0 || !Number.isSafeInteger(row.blocked) || row.blocked < 0) fail('Counts must be nonnegative whole numbers; unknown totals stay blank.');
    if ((row.total === null && row.completed + row.blocked > 0) || (row.total !== null && row.completed + row.blocked > row.total)) fail('Reconcile completed and blocked counts with the total.');
    state.metrics[id] = { total: row.total, completed: row.completed, blocked: row.blocked };
  }
  if (catalog.some(t => t.id === 'closure') && state.tasks.closure.status === 'passed' && TRANSITION_METRICS.filter(id => Number(agencyId) === 6 || id !== 'provider_updates').some(id => state.metrics[id].total === null || state.metrics[id].completed !== state.metrics[id].total || state.metrics[id].blocked)) fail('Before closing the subscription, confirm every total is known and all items are complete.');
  return state;
}

export function freezeTransitionRanking(rows, providers, sourceReference, now = new Date()) {
  if (!Array.isArray(rows) || rows.length !== providers.length || !providers.length || rows.length > 1000) fail('Supply counts for the complete current provider roster.');
  const source = text(sourceReference, 1000);
  if (!source) fail('Record the verified source for the session counts.');
  const seen = new Set();
  const ranked = rows.map(row => {
    const providerId = Number(row.providerId), provider = providers.find(p => p.id === providerId);
    if (!provider || seen.has(providerId)) fail('Provider IDs must match the active roster exactly, without duplicates.');
    seen.add(providerId);
    if (!Number.isSafeInteger(row.completedFourWeeks) || row.completedFourWeeks < 0 || !Number.isSafeInteger(row.upcomingWeek) || row.upcomingWeek < 0) fail('Missing or invalid session counts cannot be ranked as zero.');
    return { providerId, name: provider.name, completedFourWeeks: row.completedFourWeeks, weeklyAverage: row.completedFourWeeks / 4, upcomingWeek: row.upcomingWeek };
  }).sort((a, b) => a.completedFourWeeks - b.completedFourWeeks || a.upcomingWeek - b.upcomingWeek || a.providerId - b.providerId);
  return { sourceReference: source, frozenAt: now.toISOString(), periodStart: '2026-10-19', periodEnd: '2026-11-15', rows: ranked.map((row, i) => ({ ...row, rank: i + 1, cohort: Math.floor(i / 5) + 1 })) };
}

export function updateTransitionCohort(state, number, input, actorUserId, now = new Date()) {
  if (!state.ranking?.rows.some(row => row.cohort === number)) fail('Freeze the ranking before reviewing a cohort.');
  const allowed = ['google_ready', 'google_retired', 'clinical_ready', 'ehr_retired', 'observed'];
  if (!allowed.includes(input.stage)) fail('Choose a cohort stage.');
  const index = allowed.indexOf(input.stage), existing = state.cohorts[number] || {};
  if (index && !existing[allowed[index - 1]]) fail('Complete Google, clinical and observation stages in order.');
  if (number > 1 && !state.cohorts[number - 1]?.observed) fail('The previous cohort must complete a monitored workday first.');
  if (existing[input.stage]) fail('This stage is already recorded; preserve its evidence.');
  const evidence = text(input.evidence, 1500);
  if (!evidence) fail('Provide evidence for the stage.');
  if (input.stage === 'observed') {
    const start = Date.parse(existing.ehr_retired?.at);
    if (!Number.isFinite(start) || now - start < 24 * 60 * 60 * 1000 || input.monitoredWorkdayConfirmed !== true) fail('Confirm an actual monitored workday at least 24 hours after clinical retirement.');
  }
  return { ...state, cohorts: { ...state.cohorts, [number]: { ...existing, [input.stage]: { evidence, actorUserId, at: now.toISOString() } } } };
}

export function assertTransitionBookingCohort(state, providerIds) {
  const rows = state.ranking?.rows || [];
  const selected = providerIds.map(id => rows.find(row => row.providerId === id));
  if (selected.some(row => !row) || new Set(selected.map(row => row?.cohort)).size !== 1) fail('Select providers from one frozen group of five. New or unranked providers need a documented transition review.');
  const number = selected[0].cohort;
  if (!state.cohorts[number]?.clinical_ready || (number > 1 && !state.cohorts[number - 1]?.observed)) fail('Complete this group’s Google and clinical readiness and the previous monitored workday before enabling booking.');
}
