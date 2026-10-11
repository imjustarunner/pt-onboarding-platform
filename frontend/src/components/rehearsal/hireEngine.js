// Browser-only rehearsal engine. No API, account, email, payroll, or database writes.
export function createHireRehearsalEngine(bundle) {
 const companies=[bundle.agency], PREEMPLOYMENT_FIELDS=bundle.profileFields;
 const bookFor=(_company,key)=>JSON.parse(JSON.stringify(bundle.books[key]));
 const referenceCatalogFor=()=>bundle.catalog.filter(c=>c.key!=='workplace-handbook');
 const trainingDefinitionsFor=()=>bundle.definitions;
 const requiredTrainingKeys=(_agency,person,school)=>bundle.required[`${person.role}:${school}`]||[];
const learnerDefinition = definition => ({ ...definition, sectionHashes: undefined, previousEditions: undefined, questions: definition.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) });
function gradeDocumentQuiz(definition, answers) {
  if (!Array.isArray(answers) || answers.length !== definition.questions.length || answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= definition.questions[i].options.length)) fail('Answer every question before submitting.');
  const feedback = definition.questions.map((q, i) => ({ id: q.id, correct: answers[i] === q.correctAnswer, correctAnswer: q.correctAnswer, explanation: q.explanation, sourceSlug: q.sourceSlug }));
  const score = Math.round(feedback.filter(f => f.correct).length / feedback.length * 100);
  return { score, passed: feedback.every(f => f.correct), feedback };
}
function validateTrainingHeartbeat(input) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(input?.sessionId || '') || !Number.isSafeInteger(input.sequence) || input.sequence < 1 || typeof input.active !== 'boolean') fail('Invalid training activity heartbeat.');
  return { sessionId: input.sessionId, sequence: input.sequence, active: input.active };
}
function trainingCreditSeconds(row, input, now) {
  const elapsed = (new Date(now) - new Date(row?.seen_at)) / 1000;
  return row?.session_id === input.sessionId && input.sequence > Number(row.sequence_number) && row.active && input.active && elapsed > 0 && elapsed <= 45 ? Math.min(30, Math.floor(elapsed)) : 0;
}
function validatePreemployment(input, complete = false) {
  const data = {};
  for (const f of PREEMPLOYMENT_FIELDS) {
    data[f.key] = String(input?.[f.key] || '').trim().slice(0, f.type === 'textarea' ? 8000 : 255);
    if (complete && f.required && !data[f.key]) throw Object.assign(new Error(`${f.label} is required.`), { status: 400 });
    if (data[f.key] && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[f.key])) throw Object.assign(new Error(`Enter a valid ${f.label.toLowerCase()}.`), { status: 400 });
    if (data[f.key] && f.type === 'date') {
      const date = new Date(`${data[f.key]}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data[f.key]) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data[f.key] || date > new Date()) throw Object.assign(new Error('Enter a valid date of birth.'), { status: 400 });
    }
  }
  return data;
}
function summarizeSteps(steps) {
  const required = steps.filter((s) => s.required !== false && s.kind !== 'review');
  const completed = required.filter((s) => s.complete).length;
  return { total: required.length, completed, percent: required.length ? Math.round(completed * 100 / required.length) : 0, allDone: required.length > 0 && completed === required.length };
}

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function createDemo({ company = 'itsco', role = 'facilitator', school = true, phase = 'prehire' } = {}) {
  const agency = companies.find(c => c.slug === company);
  if (!agency || !['facilitator', 'provider', 'intern', 'staff'].includes(role)) fail('Choose a demo agency and role.');
  const state = { agency, role, school: agency.slug === 'itsco' && !!school, status: phase === 'onboarding' ? 'ONBOARDING' : 'PREHIRE_OPEN', prehireDone: phase === 'onboarding', onboardingDone: false, activated: false, saved: {}, records: [], messages: [], audit: [], analytics: [], seconds: 0, nextId: 1 };
  state.profile = Object.fromEntries(PREEMPLOYMENT_FIELDS.map(f => [f.key, f.type === 'date' ? '1994-04-12' : f.type === 'email' ? 'alex.demo@example.test' : f.type === 'phone' ? '7195550100' : f.key === 'full_legal_name' ? 'Alex Demo' : 'Sample information — fictional']));
  return state;
}
const definitionsFor = s => trainingDefinitionsFor(s.agency);
const requiredFor = s => requiredTrainingKeys(s.agency, { role: s.role, credential: s.role === 'facilitator' ? 'BA' : s.role === 'provider' ? 'LPC' : '', status: 'ONBOARDING' }, s.school);
function recordEvent(s, action) { s.audit.unshift({ at: new Date().toISOString(), action }); }
function snapshot(s) {
  const saved = (phase, key) => s.saved[`${phase}:${key}`];
  const step = (phase, key, kind, title, extra = {}) => ({ key, kind, title, required: true, complete: phase === 'pre_hire' && s.prehireDone || !!saved(phase, key), ...extra });
  const pre = [step('pre_hire','background','demo-check','Reference release & screening'), step('pre_hire','job-description','demo-check','Your job description'), step('pre_hire','agreement','demo-check','Employment agreement'), step('pre_hire','work-email','work-email','Choose your work email'), step('pre_hire','profile','profile','Pre-employment information'), step('pre_hire','headshot','demo-check','Your professional headshot'), step('pre_hire','handbook','handbook','Workplace handbook · Reference',{ required: false, instructions: 'Read, search and reference your agency handbook. Formal review and acknowledgment are part of onboarding.' })];
  const on = [step('onboarding','account','demo-check','Account setup'), step('onboarding','user-setup','user-setup','Your user setup', { clinical: false, demographicFields: [], values: saved('onboarding','user-setup')?.values || { contact: { phone: '7195550100', street: '100 Example Way', line2: '', city: 'Colorado Springs', state: 'CO', postalCode: '80919', emergency: 'Jordan Demo · 7195550101' }, demographics: {}, languages: ['English'], credential: s.role === 'facilitator' ? 'BA · Facilitator' : s.role, typicalAvailability: [] } }), step('onboarding','communications','demo-check','Communication preferences'), ...(s.role === 'intern' ? [step('onboarding','student-agreement','demo-check','Student training agreement & supervision')] : []), step('onboarding','handbook','handbook','Review the workplace handbook'), ...requiredFor(s).map(key => ({ key: `guide-${key}`, kind: 'guide-training', documentKey: key, title: definitionsFor(s).find(d => d.documentKey === key).title, required: true, complete: s.records.some(r => r.document_key === key && r.purpose === 'onboarding' && r.status === 'completed') })), step('onboarding','orientation','demo-check','Meet your supervisor & next steps')];
  for (const [phase, list] of [['pre_hire',pre],['onboarding',on]]) list.push({ key: 'review', kind: 'review', title: 'Final review', required: false, complete: phase === 'pre_hire' ? s.prehireDone : s.onboardingDone });
  return {
    agency: s.agency, candidate: { firstName: 'Alex', lastName: 'Demo', status: s.status, appliedRole: `${s.role === 'facilitator' ? 'Bachelor’s-level facilitator' : s.role === 'intern' ? 'Student intern' : s.role === 'staff' ? 'Administrative staff' : 'Licensed mental health provider'}${s.school ? ' · School assignment' : ' · Office assignment'}`, workEmail: s.status === 'ONBOARDING' ? 'alex.demo@example.test' : null },
    journey: { prehireCompletedAt: s.prehireDone ? '2026-10-10T12:00:00Z' : null, onboardingCompletedAt: s.onboardingDone ? '2026-10-10T13:00:00Z' : null },
    workflow: { config: { tagline: 'Your next chapter starts here.' }, steps: { pre_hire: pre, onboarding: on }, progress: { pre_hire: summarizeSteps(pre), onboarding: summarizeSteps(on) }, profile: s.profile, profileFields: PREEMPLOYMENT_FIELDS, preferredWorkEmail: saved('pre_hire','work-email')?.email || 'alex.demo@example.test', supervisor: { name: 'Taylor Morgan · Demo supervisor' } },
    demo: { role: s.role, school: s.school, activated: s.activated, seconds: s.seconds, messages: s.messages, audit: s.audit, analytics: s.analytics, library: [{ key: 'workplace-handbook', title: 'Workplace Handbook', description: 'Current company policies, searchable sections and linked updates.' }, ...referenceCatalogFor(s.agency)], required: requiredFor(s), records: s.records.map(({ heartbeat, ...r }) => r) }
  };
}
function answerExcerpt(book, question) {
  const words = String(question || '').toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !['what','when','where','does','with','this','that','have','should','about'].includes(w)) || [];
  const ranked = book.sections.filter(s => s.body_html).map(s => { const text = s.body_html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); return { s, text, score: words.reduce((n,w) => n + (s.title.toLowerCase().includes(w) ? 5 : 0) + (text.toLowerCase().includes(w) ? 1 : 0),0) }; }).sort((a,b) => b.score-a.score);
  if (!ranked[0]?.score) return { status: 'not_found', message: 'Demo passage lookup found no matching section. Try a specific policy term or use the table of contents.', paragraphs: [] };
  const { s, text } = ranked[0];
  return { status: 'answered', message: 'Demo passage lookup · This is a source excerpt, not a generated AI answer. No question is sent to an AI service.', version: { number: 1 }, paragraphs: [{ text: text.slice(0,700) + (text.length > 700 ? '…' : ''), citations: [{ slug: s.slug, title: s.title, path: s.title, quote: text.slice(0,700) }] }] };
}
function handleDemo(s, method, path, body = {}, now = Date.now()) {
  if (path === '/skip' && method === 'POST') { const phase=s.status==='ONBOARDING'?'onboarding':'pre_hire'; for(const step of snapshot(s).workflow.steps[phase]) { if(step.kind==='guide-training'){const r=startRecord(s,step.documentKey,'onboarding');r.status='completed';}else if(step.kind!=='review')s.saved[`${phase}:${step.key}`]={sample:true}; } recordEvent(s,'Rehearsal shortcut: required steps marked complete, no real credit');return snapshot(s); }
  if (path === '/state') return snapshot(s);
  if (path === '/library') return bookFor(s.agency, body.key || 'workplace-handbook');
  if (path === '/answer') { s.analytics.push({ type:'question', question: String(body.question).slice(0,2000), documentKey: body.key || 'workplace-handbook' }); return answerExcerpt(bookFor(s.agency, body.key || 'workplace-handbook'),body.question); }
  if (path === '/submit' && method === 'POST') {
    const phase = s.status === 'ONBOARDING' ? 'onboarding' : 'pre_hire';
    if (!snapshot(s).workflow.progress[phase].allDone) fail('Complete the required steps and guide quizzes before submitting.');
    if (phase === 'pre_hire') { s.prehireDone = true; s.status = 'PREHIRE_REVIEW'; } else s.onboardingDone = true;
    recordEvent(s, `${phase === 'pre_hire' ? 'Prehire' : 'Onboarding'} submitted for simulated review`); return snapshot(s);
  }
  if (path === '/advance' && method === 'POST') {
    if (s.status === 'PREHIRE_REVIEW') { s.status = 'ONBOARDING'; recordEvent(s,'Demo administrator approved prehire and opened onboarding'); }
    else if (s.onboardingDone) { s.activated = true; recordEvent(s,'Demo administrator reviewed onboarding; employee experience unlocked'); }
    else fail('Submit the current package before administrator review.');
    return snapshot(s);
  }
  if (path === '/messages' && method === 'POST') { if (!String(body.text || '').trim()) fail('Write a demo message.'); s.messages.push({ text: String(body.text).slice(0,2000), at: new Date(now).toISOString() }); return { saved: true }; }
  if (path === '/assign' && method === 'POST') {
    if (s.status !== 'ONBOARDING') fail('Open onboarding before assigning a refresher.');
    if (!definitionsFor(s).some(d => d.documentKey === body.key)) fail('Unknown training.');
    if (!s.records.some(r => r.document_key === body.key && r.purpose === 'assigned' && r.status !== 'completed')) startRecord(s,body.key,'assigned');
    recordEvent(s, `Demo supervisor assigned paid refresher: ${body.key}`); return { saved: true };
  }
  path = path.replace(/^\/prehire-portal\/demo/, '');
  if(path==='/account/suggestions')return {suggestions:['alex.demo@example.test','a.demo@example.test'],domain:'example.test'};
  if (path === '/resources/handbook') return { available: true, handbook: bookFor(s.agency,'workplace-handbook') };
  if (path === '/resources/handbook/answer') return handleDemo(s,'POST','/answer',{ ...body, key: 'workplace-handbook' });
  if (path.startsWith('/workflow/') && method === 'POST') {
    const key = path.split('/')[2], phase = s.status === 'ONBOARDING' ? 'onboarding' : 'pre_hire';
    if (s.status === 'PREHIRE_REVIEW' || s.onboardingDone) fail('This submitted package is read-only.');
    const step = snapshot(s).workflow.steps[phase].find(x => x.key === key);
    if (!step || step.kind === 'guide-training' || step.kind === 'review') fail('Use the step’s completion flow.');
    if (key === 'profile') { if (body.complete !== false) validatePreemployment(body.values, true); s.profile = { ...body.values }; }
    if (key === 'work-email' && !/^[^@]+@example\.test$/.test(body.email || '')) fail('Use a fictional @example.test email in this demo.');
    if (key === 'handbook' && (!body.acknowledged || phase === 'onboarding' && (!body.signatureData || body.handbookVersionId !== bookFor(s.agency,'workplace-handbook').version.id))) fail('Review and sign the displayed handbook edition.');
    if (body.complete !== false) { s.saved[`${phase}:${key}`] = body; recordEvent(s, `Saved ${phase}: ${step.title}`); }
    return { saved: true };
  }
  if (path.startsWith('/document-analytics/')) { if (path.endsWith('/sessions')) s.analytics.push({ type:'open', documentKey: body.documentKey, surface: body.surface }); else if (['section','link','helpful','not_helpful'].includes(body.type)) s.analytics.push({ type: body.type, section: body.sectionSlug, href: body.href }); return { saved: true }; }
  if (path === '/document-learning') return { courses: definitionsFor(s).map(d => ({ key: d.documentKey, title: d.title, description: d.description, status: 'ready', version: bookFor(s.agency,d.documentKey).version, questionCount: d.questions.length, readingCount: d.requiredSections.length, onboardingRequired: requiredFor(s).includes(d.documentKey), enrollments: s.records.filter(r => r.document_key === d.documentKey) })) };
  const start = path.match(/^\/document-learning\/courses\/([a-z-]+)\/start$/);
  if (start && method === 'POST') {
    if (s.status !== 'ONBOARDING') fail('Training begins during onboarding.');
    const key = start[1], purpose = body.purpose;
    if (!definitionsFor(s).some(d => d.documentKey === key) || !['onboarding','practice'].includes(purpose)) fail('Unknown training.');
    if (purpose === 'onboarding' && !requiredFor(s).includes(key)) fail('This guide is not required for this role.');
    const existing = s.records.find(r => r.document_key === key && r.purpose === purpose && (purpose === 'onboarding' || r.requestKey === body.requestKey));
    return { id: existing?.id || startRecord(s,key,purpose,body.requestKey).id };
  }
  const m = path.match(/^\/document-learning\/enrollments\/(\d+)(?:\/(\w+))?$/);
  const r = m && s.records.find(r => r.id === Number(m[1]));
  if (r) {
    const d = definitionsFor(s).find(d => d.documentKey === r.document_key), paid = r.purpose !== 'practice';
    if (method === 'GET') return { ...r, key:r.document_key, paid, onboardingTime: r.purpose === 'onboarding', definition: learnerDefinition(d), book:bookFor(s.agency,r.document_key), time:[] };
    if (m[2] === 'reading') { if (!d.requiredSections.includes(body.slug)) fail('Unknown reading section.'); r.readSections = [...new Set([...r.readSections,body.slug])]; return { readSections:r.readSections }; }
    if (m[2] === 'quiz') {
      if (d.requiredSections.some(slug => !r.readSections.includes(slug))) fail('Review every core section first.');
      const previous = r.attempts.find(a => a.requestKey === body.requestKey); if (previous) return previous;
      const result = { id:r.attempts.length+1, requestKey:body.requestKey, ...gradeDocumentQuiz(d,body.answers) }; r.attempts.unshift(result);
      if (result.passed) { r.status='completed'; recordEvent(s,`${r.purpose} training completed: ${d.title}`); } return result;
    }
    if (m[2] === 'heartbeat') {
      validateTrainingHeartbeat(body);
      const creditedSeconds = paid && r.status !== 'completed' ? trainingCreditSeconds(r.heartbeat,body,now) : 0;
      if (!r.heartbeat || body.sessionId !== r.heartbeat.session_id || body.sequence > r.heartbeat.sequence_number) r.heartbeat = { session_id:body.sessionId, sequence_number:body.sequence, active:body.active, seen_at:now };
      r.seconds += creditedSeconds; s.seconds += creditedSeconds; return { tracking:paid && body.active, creditedSeconds, paid };
    }
    if (m[2] === 'time') return { message: `Demo only: ${r.seconds} seconds of active training recorded. No payroll claim created.`, claimIds:[] };
    if (m[2] === 'answer') return handleDemo(s,'POST','/answer',{ ...body,key:r.document_key });
  }
  fail('This action is not implemented in the local demo.');
}
function startRecord(s,key,purpose,requestKey) { const r = { id:s.nextId++, agency_id:s.agency.id, document_key:key, purpose, requestKey, status:'in_progress', readSections:[], attempts:[], seconds:0 }; s.records.push(r); return r; }

 let state=createDemo();
 const copy=v=>JSON.parse(JSON.stringify(v));
 const request=async(method,path,body={})=>{
  if(path==='/reset'){state=createDemo(body);path='/state';}
  if(path==='/form')return {data:{fields:bundle.formFields}};
  return {data:copy(handleDemo(state,method,path,body))};
 };
 return {defaults:{baseURL:'/rehearsal-only'},get:(path,options={})=>request('GET',path,options.params),post:(path,body)=>request('POST',path,body)};
}
