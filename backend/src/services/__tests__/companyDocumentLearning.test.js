import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../documentAnalytics.service.js', () => ({ recordDocumentQuestion: vi.fn() }));
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), activity: vi.fn(), answer: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../hireJourney.service.js', () => ({ recordOnboardingActivity: mocks.activity }));
vi.mock('../workplaceHandbookAssistant.service.js', () => ({ answerFromHandbook: mocks.answer }));
import { referenceSource, referenceMetadata } from '../companyReferenceContent.js';
import { documentTrainingDefinitions, trainingDefinitionsFor, validateTrainingDefinition } from '../documentTrainingContent.js';
import { startGuideLearning, guideLearningDetail, markGuideReading, submitGuideQuiz, revealGuideReflection, heartbeatGuideLearning, submitGuideTime, documentTrainingCourse, onboardingGuideSteps, assertOnboardingGuideTraining, reviewDocumentTraining, answerGuideLearning, readGuide, learningContext, trainingReviewWorkspace } from '../companyDocumentLearning.service.js';
const def = documentTrainingDefinitions[0], source = referenceSource({ slug: 'itsco' }, 'provider-guide');
const db = { execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
let state;
const heartbeat = (sequence = 1, active = true) => ({ sessionId: '1234567890abcdef', sequence, active });
beforeEach(() => {
  vi.clearAllMocks(); mocks.getConnection.mockResolvedValue(db); mocks.activity.mockResolvedValue({ tracking: true, creditedSeconds: 15 });
  state = { agency: { id: 2, slug: 'itsco' }, user: { id: 7, status: 'ACTIVE_EMPLOYEE', role: 'provider' }, pref: null,
    journey: { agency_id: 2, onboarding_completed_at: null }, published: true, review: null,
    version: { id: 14, version_number: 1, is_draft: 0, document_id: 3, sections_json: source.sections, metadata_json: referenceMetadata(source) },
    enrollments: [], attempts: [], activity: { user_id: 7 }, days: [], claims: [], clock: '2026-10-10T12:00:00Z' };
  mocks.execute.mockImplementation(async (sql, args = []) => {
    if (sql.startsWith('SELECT * FROM users') || sql.startsWith('SELECT u.*')) return [[state.user]];
    if (sql.startsWith('SELECT id, name, slug')) return [[state.agency]];
    if (sql.startsWith('SELECT expected_school_work')) return [state.pref == null ? [] : [{ expected_school_work: state.pref }]];
    if (sql.includes('FROM hire_portal_packets')) return [[{ config_json: state.packet || {} }]];
    if (sql.includes('FROM hiring_profiles')) return [[{ prehire_config_json: state.job || {} }]];
    if (sql.includes('FROM hire_journeys')) return [state.journey ? [state.journey] : []];
    if (sql.includes('FROM company_document_training_reviews')) return [state.review ? [state.review] : []];
    if (sql.startsWith('SELECT * FROM company_reference_documents')) return [[{ id: 3, published_version_id: state.published ? state.version.id : null }]];
    if (sql.includes('FROM company_reference_documents d JOIN company_reference_versions')) return [state.published ? [state.version] : []];
    if (sql.includes('FROM company_reference_versions')) return [[state.version]];
    if (sql.startsWith('SELECT id FROM company_document_learning WHERE') && sql.includes("purpose = 'assigned'")) return [state.enrollments.filter(r => r.agency_id === args[0] && r.user_id === args[1] && r.document_key === args[2] && r.version_id === args[3] && r.purpose === 'assigned' && r.status === 'in_progress')];
    if (sql.startsWith('SELECT id FROM company_document_learning WHERE')) return [state.enrollments.filter(r => r.agency_id === args[0] && r.user_id === args[1] && r.document_key === args[2] && r.assignment_key === args[3])];
    if (sql.startsWith('INSERT INTO company_document_learning (')) { const [agency_id, user_id, document_key, version_id, course_revision, definition_json, assignment_key, purpose, assigned_by_user_id] = args; const id = state.enrollments.length + 1; state.enrollments.push({ id, agency_id, user_id, document_key, version_id, course_revision, definition_json, assignment_key, purpose, assigned_by_user_id, read_sections_json: '[]', status: 'in_progress' }); return [{ insertId: id }]; }
    if (sql.startsWith('SELECT * FROM company_document_learning WHERE')) return [state.enrollments.filter(r => Number(r.id) === Number(args[0]) && r.agency_id === args[1] && r.user_id === args[2])];
    if (sql.startsWith('SELECT id, document_key, status FROM company_document_learning')) return [state.enrollments.filter(r => r.purpose === 'onboarding')];
    if (sql.startsWith('UPDATE company_document_learning SET read_sections_json')) { state.enrollments.find(r => r.id === args[1]).read_sections_json = args[0]; return [{}]; }
    if (sql.startsWith('SELECT result_json FROM company_document_learning_attempts')) return [state.attempts.filter(r => r.learning_id === args[0] && r.request_key === args[1])];
    if (sql.startsWith('SELECT id, result_json')) return [state.attempts.filter(r => r.learning_id === args[0]).toReversed()];
    if (sql.startsWith('INSERT INTO company_document_learning_attempts')) { const previous = sql.includes('ON DUPLICATE') && state.attempts.find(a => a.learning_id === args[0] && a.request_key === args[1]); if (previous) previous.result_json = args[3]; else state.attempts.push({ id: state.attempts.length + 1, learning_id: args[0], request_key: args[1], result_json: args[3] }); return [{}]; }
    if (sql.startsWith("UPDATE company_document_learning SET status")) { state.enrollments.find(r => r.id === args[0]).status = 'completed'; return [{}]; }
    if (sql.startsWith('SELECT *, UTC_TIMESTAMP')) return [[{ ...state.activity, server_now: state.clock }]];
    if (sql.startsWith('UPDATE company_document_learning_activity')) { const [learning_id, session_id, sequence_number, active] = args; state.activity = { learning_id, session_id, sequence_number, active, seen_at: state.clock }; return [{}]; }
    if (sql.startsWith('INSERT INTO company_document_learning_time')) { const [learning_id, work_date, seconds] = args; const found = state.days.find(r => r.learning_id === learning_id && r.work_date === work_date); if (found) found.seconds += seconds; else state.days.push({ learning_id, work_date, seconds, submitted_seconds: 0, payroll_claim_ids_json: '[]' }); return [{}]; }
    if (sql.includes('FROM company_document_learning_time')) return [state.days.filter(r => r.learning_id === args[0])];
    if (sql.startsWith('INSERT INTO payroll_time_claims')) { state.claims.push(args); return [{ insertId: 50 + state.claims.length }]; }
    if (sql.startsWith('UPDATE company_document_learning_time')) { const found = state.days.find(r => r.learning_id === args[1] && r.work_date === args[2]); found.submitted_seconds = found.seconds; found.payroll_claim_ids_json = args[0]; return [{}]; }
    if (sql.startsWith('INSERT INTO company_document_training_reviews')) { state.review = { definition_json: args[3], revision: args[4] }; return [{}]; }
    if (sql.startsWith('INSERT IGNORE')) return [{}];
    throw new Error('Unhandled SQL: ' + sql);
  });
});
async function start(purpose = 'assigned', requestKey = 'start-request-0001') { return (await startGuideLearning(2, 7, 'provider-guide', { purpose, requestKey, expectedVersionId: 14 }, purpose === 'assigned' ? 9 : null)).id; }
async function readAll(id) { for (const slug of def.requiredSections) await markGuideReading(2, 7, id, slug); }
describe('saved edition and reading/quiz progression', () => {
  it('requires the new protocol only for a matching company facilitator profile and pays its onboarding through the existing ledger', async () => {
    const key = 'facilitator-coding-protocol';
    const protocol = referenceSource(state.agency, key);
    const definition = documentTrainingDefinitions.find(d => d.documentKey === key && d.tenants.includes('itsco'));
    state.user.status = 'ONBOARDING'; state.pref = false;
    state.version = { ...state.version, sections_json: protocol.sections, metadata_json: referenceMetadata(protocol) };
    await expect(startGuideLearning(2, 7, key, { purpose: 'onboarding', expectedVersionId: 14 })).rejects.toThrow('not required');
    state.user.credential = 'B.S.';
    const id = (await startGuideLearning(2, 7, key, { purpose: 'onboarding', expectedVersionId: 14 })).id;
    expect((await onboardingGuideSteps(state.user, 2)).find(s => s.documentKey === key)).toMatchObject({ required: true, complete: false });
    await heartbeatGuideLearning(2, 7, id, heartbeat());
    expect(mocks.activity).toHaveBeenCalled(); expect(state.claims).toHaveLength(0);
    for (const slug of definition.requiredSections) await markGuideReading(2, 7, id, slug);
    expect((await submitGuideQuiz(2, 7, id, { requestKey: 'facilitator-quiz-001', answers: definition.questions.map(q => q.correctAnswer) })).completed).toBe(true);
    expect((await onboardingGuideSteps(state.user, 2)).find(s => s.documentKey === key)).toMatchObject({ complete: true });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('ua.agency_role, ua.agency_position'))).toBe(true);
    state.user.agency_role = 'tutor';
    expect((await onboardingGuideSteps(state.user, 2)).some(s => s.documentKey === key)).toBe(false);
  });
  it('pins a published edition and retries enrollment creation without duplication', async () => {
    const id = await start(); expect(await start()).toBe(id); expect(await start('assigned', 'another-manager-001')).toBe(id); expect(state.enrollments).toHaveLength(1);
    expect(await guideLearningDetail(2, 7, id)).toMatchObject({ paid: true, book: { version: { id: 14 } }, definition: { questions: expect.arrayContaining([expect.not.objectContaining({ correctAnswer: expect.anything() })]) } });
    expect(db.commit).toHaveBeenCalled(); expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('reveals sourced answers and completes reflection regardless of the choices, with idempotent retries', async () => {
    const id = await start(), input = { requestKey: 'reflection-00001', answers: def.questions.map(q => (q.correctAnswer + 1) % q.options.length) };
    await expect(submitGuideQuiz(2, 7, id, input)).rejects.toThrow('Review each core section');
    await readAll(id);
    const result = await submitGuideQuiz(2, 7, id, input);
    expect(result).toMatchObject({ completed: true, reviewed: true });
    expect(result.score).toBeUndefined(); expect(result.passed).toBeUndefined();
    expect(result.feedback[0]).toMatchObject({ answer: def.questions[0].options[def.questions[0].correctAnswer], explanation: def.questions[0].explanation, sourceSlug: def.questions[0].sourceSlug });
    expect(state.enrollments[0].status).toBe('completed');
    expect(await submitGuideQuiz(2, 7, id, input)).toEqual(result); expect(state.attempts).toHaveLength(1);
    await expect(markGuideReading(2, 7, id, def.requiredSections[0])).rejects.toThrow('complete');
  });
  it('does not allow another user, agency or unregistered tenant to be opened', async () => {
    const id = await start(); await expect(guideLearningDetail(2, 8, id)).rejects.toThrow('not found'); await expect(guideLearningDetail(9, 7, id)).rejects.toThrow('not found');
    state.agency.slug = 'nlu'; await expect(guideLearningDetail(2, 7, id)).rejects.toThrow('not available');
  });
  it('blocks an unpublished/stale guide and stale expected edition before creating an assignment', async () => {
    state.published = false; await expect(start()).rejects.toThrow('edition changed'); state.published = true;
    state.version = { ...state.version, id: 15 }; await expect(start()).rejects.toThrow('edition changed'); state.version.id = 14;
    state.version.sections_json = structuredClone(source.sections); state.version.sections_json.find(s => s.slug === def.requiredSections[0]).body_html = '<p>New policy</p>';
    await expect(start()).rejects.toThrow('Review the questions'); expect(state.enrollments).toHaveLength(0);
  });
  it('supports legacy active staff and blocks inactive or archived learners', async () => {
    state.user.status = 'active'; await expect(start()).resolves.toBe(1);
    state.user.is_active = 0; await expect(start('practice')).rejects.toThrow('available');
    state.user.is_active = 1; state.user.is_archived = 1; await expect(start('practice')).rejects.toThrow('available');
  });
  it('prevents learner-created paid refreshers', async () => {
    await expect(startGuideLearning(2, 7, 'provider-guide', { purpose: 'assigned', requestKey: 'forged-request-001', expectedVersionId: 14 })).rejects.toThrow('authorized');
  });
  it('reviews questions using the published version and optimistic approval revision', async () => {
    await expect(reviewDocumentTraining(2, 'provider-guide', 9, { expectedVersionId: 11, definition: def })).rejects.toThrow('guide changed');
    state.review = { revision: 'newer' };
    await expect(reviewDocumentTraining(2, 'provider-guide', 9, { expectedVersionId: 14, definition: def })).rejects.toThrow('Another administrator');
    state.review = null; expect(await reviewDocumentTraining(2, 'provider-guide', 9, { expectedVersionId: 14, definition: def })).toHaveProperty('versionId', 14);
  });
  it('answers from the assigned book and rejects a mismatched question edition', async () => {
    const id = await start(); await expect(answerGuideLearning(2, 7, id, { expectedVersionId: 99, question: 'What do I do?' })).rejects.toThrow('Reload');
    await answerGuideLearning(2, 7, id, { expectedVersionId: 14, question: 'What do I do?' }); expect(mocks.answer.mock.calls[0][0].handbook.version.id).toBe(14);
  });
});
describe('paid versus own-time learning', () => {
  it('optional practice never records or submits pay, even with forged pay/duration fields', async () => {
    const id = await start('practice'); expect(await heartbeatGuideLearning(2, 7, id, { ...heartbeat(), paid: true, seconds: 3600 })).toEqual({ paid: false, tracking: false, creditedSeconds: 0 });
    await expect(submitGuideTime(2, 7, id)).rejects.toThrow('own time'); expect(state.days).toEqual([]); expect(state.claims).toEqual([]); expect(mocks.activity).not.toHaveBeenCalled();
  });
  it('records actual active time and submits partial training without requiring quiz success; repeat submits cannot duplicate claims', async () => {
    const id = await start(); await heartbeatGuideLearning(2, 7, id, heartbeat()); state.clock = '2026-10-10T12:00:15Z';
    expect((await heartbeatGuideLearning(2, 7, id, heartbeat(2))).creditedSeconds).toBe(15);
    await heartbeatGuideLearning(2, 7, id, heartbeat(2)); expect(state.days[0].seconds).toBe(15);
    expect((await submitGuideTime(2, 7, id)).claimIds).toHaveLength(1); await submitGuideTime(2, 7, id); expect(state.claims).toHaveLength(1);
    expect(JSON.parse(state.claims[0][4])).toMatchObject({ actualSeconds: 15, totalMinutes: 0.25, source: 'company_document_learning' });
    state.clock = '2026-10-10T12:00:30Z'; await heartbeatGuideLearning(2, 7, id, heartbeat(3)); await submitGuideTime(2, 7, id); expect(state.claims).toHaveLength(2);
    expect(state.enrollments[0].status).toBe('in_progress');
  });
  it('separates dates at UTC midnight without rounding away or adding seconds', async () => {
    const id = await start(); state.clock = '2026-10-10T23:59:50.500Z'; await heartbeatGuideLearning(2, 7, id, heartbeat()); state.clock = '2026-10-11T00:00:05.500Z'; await heartbeatGuideLearning(2, 7, id, heartbeat(2));
    expect(state.days.map(d => [d.work_date, d.seconds])).toEqual([['2026-10-10', 10], ['2026-10-11', 5]]);
  });
  it('uses only the existing onboarding ledger and rejects paid work from a different onboarding company', async () => {
    state.user.status = 'ONBOARDING'; const id = await start('onboarding'); await heartbeatGuideLearning(2, 7, id, heartbeat());
    expect(mocks.activity).toHaveBeenCalledWith(7, heartbeat()); expect((await submitGuideTime(2, 7, id)).onboardingTime).toBe(true); expect(state.claims).toHaveLength(0);
    state.journey.agency_id = 99; await expect(heartbeatGuideLearning(2, 7, id, heartbeat(2))).rejects.toThrow('onboarding company'); expect(mocks.activity).toHaveBeenCalledTimes(1);
  });
  it('does not let practice or a supervisor refresher substitute for required onboarding completion', async () => {
    state.user.status = 'ONBOARDING'; state.pref = false;
    const practiceId = await start('practice'); await readAll(practiceId); await submitGuideQuiz(2, 7, practiceId, { requestKey: 'practice-complete-1', answers: def.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const id = await start('onboarding'); await readAll(id); await submitGuideQuiz(2, 7, id, { requestKey: 'required-complete-1', answers: def.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const care = referenceSource(state.agency, 'counseling-guide'), careDefinition = documentTrainingDefinitions.find(d => d.documentKey === 'counseling-guide');
    state.version = { ...state.version, id: 15, sections_json: care.sections, metadata_json: referenceMetadata(care) };
    const careId = (await startGuideLearning(2, 7, 'counseling-guide', { purpose: 'onboarding', expectedVersionId: 15 })).id;
    for (const slug of careDefinition.requiredSections) await markGuideReading(2, 7, careId, slug);
    await submitGuideQuiz(2, 7, careId, { requestKey: 'care-complete-001', answers: careDefinition.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const skills = referenceSource(state.agency, 'skill-development-guide');
    const skillsDefinition = documentTrainingDefinitions.find(d => d.documentKey === 'skill-development-guide' && d.tenants.includes('itsco'));
    state.version = { ...state.version, id: 16, sections_json: skills.sections, metadata_json: referenceMetadata(skills) };
    const skillsId = (await startGuideLearning(2, 7, 'skill-development-guide', { purpose: 'onboarding', expectedVersionId: 16 })).id;
    for (const slug of skillsDefinition.requiredSections) await markGuideReading(2, 7, skillsId, slug);
    await submitGuideQuiz(2, 7, skillsId, { requestKey: 'skills-complete-001', answers: skillsDefinition.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const facilities = referenceSource(state.agency, 'facilities-guide');
    const facilitiesDefinition = documentTrainingDefinitions.find(d => d.documentKey === 'facilities-guide' && d.tenants.includes('itsco'));
    state.version = { ...state.version, id: 17, sections_json: facilities.sections, metadata_json: referenceMetadata(facilities) };
    const facilitiesId = (await startGuideLearning(2, 7, 'facilities-guide', { purpose: 'onboarding', expectedVersionId: 17 })).id;
    for (const slug of facilitiesDefinition.requiredSections) await markGuideReading(2, 7, facilitiesId, slug);
    await submitGuideQuiz(2, 7, facilitiesId, { requestKey: 'facilities-complete-001', answers: facilitiesDefinition.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const crisis = referenceSource(state.agency, 'crisis-response-guide');
    const crisisDefinition = documentTrainingDefinitions.find(d => d.documentKey === 'crisis-response-guide' && d.tenants.includes('itsco'));
    state.version = { ...state.version, id: 18, sections_json: crisis.sections, metadata_json: referenceMetadata(crisis) };
    const crisisId = (await startGuideLearning(2, 7, 'crisis-response-guide', { purpose: 'onboarding', expectedVersionId: 18 })).id;
    for (const slug of crisisDefinition.requiredSections) await markGuideReading(2, 7, crisisId, slug);
    await submitGuideQuiz(2, 7, crisisId, { requestKey: 'crisis-complete-001', answers: crisisDefinition.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const documentation = referenceSource(state.agency, 'service-documentation-standards');
    const documentationDefinition = documentTrainingDefinitions.find(d => d.documentKey === 'service-documentation-standards' && d.tenants.includes('itsco'));
    state.version = { ...state.version, id: 19, sections_json: documentation.sections, metadata_json: referenceMetadata(documentation) };
    const documentationId = (await startGuideLearning(2, 7, 'service-documentation-standards', { purpose: 'onboarding', expectedVersionId: 19 })).id;
    for (const slug of documentationDefinition.requiredSections) await markGuideReading(2, 7, documentationId, slug);
    await submitGuideQuiz(2, 7, documentationId, { requestKey: 'documentation-complete-001', answers: documentationDefinition.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).rejects.toThrow('required guide');
    const reporting = referenceSource(state.agency, 'mandated-reporting-sop');
    const reportingDefinition = documentTrainingDefinitions.find(d => d.documentKey === 'mandated-reporting-sop' && d.tenants.includes('itsco'));
    state.version = { ...state.version, id: 20, sections_json: reporting.sections, metadata_json: referenceMetadata(reporting) };
    const reportingId = (await startGuideLearning(2, 7, 'mandated-reporting-sop', { purpose: 'onboarding', expectedVersionId: 20 })).id;
    for (const slug of reportingDefinition.requiredSections) await markGuideReading(2, 7, reportingId, slug);
    await submitGuideQuiz(2, 7, reportingId, { requestKey: 'reporting-complete-001', answers: reportingDefinition.questions.map(q => q.correctAnswer) });
    await expect(assertOnboardingGuideTraining(7, 2)).resolves.toBeUndefined();
    expect(await onboardingGuideSteps(state.user, 2)).toEqual(Array.from({ length: 7 }, () => expect.objectContaining({ kind: 'guide-training', complete: true })));
    state.user.sees_clients = false; state.user.role = 'staff';
    expect(await onboardingGuideSteps(state.user, 2, db, { closed: true })).toEqual(Array.from({ length: 7 }, () => expect.objectContaining({ kind: 'guide-training', complete: true })));
  });
  it('does not treat a missing onboarding journey as an open onboarding assignment', async () => {
    state.user.status = 'ONBOARDING'; state.journey = null; await expect(start('onboarding')).rejects.toThrow('not required');
  });
});

describe('beta guide practice', () => {
  it('saves an immutable source edition, supports completion and never permits a payroll claim', async () => {
    state.published = false;
    const course = await documentTrainingCourse(state.agency, 'provider-guide');
    expect(course.status).toBe('beta');
    const { id } = await startGuideLearning(2, 7, 'provider-guide', { purpose: 'practice', requestKey: 'beta-practice-0001', expectedVersionId: 0, expectedBetaRevision: course.revision });
    expect(state.enrollments[0].version_id).toBe(0);
    state.published = true;
    state.version.sections_json = [{ slug: 'replaced', body_html: 'Different published edition' }];
    const detail = await guideLearningDetail(2, 7, id);
    expect(detail.book.metadata.beta).toBe(true); expect(detail.paid).toBe(false);
    expect(detail.book.sections.some(s => s.slug === def.requiredSections[0])).toBe(true);
    expect(detail.definition.betaBook).toBeUndefined(); expect(detail.definition.questions[0].correctAnswer).toBeUndefined();
    await readAll(id);
    expect((await submitGuideQuiz(2, 7, id, { requestKey: 'beta-quiz-submit-001', answers: def.questions.map(q => q.correctAnswer) })).completed).toBe(true);
    expect((await heartbeatGuideLearning(2, 7, id, heartbeat())).creditedSeconds).toBe(0);
    await expect(submitGuideTime(2, 7, id)).rejects.toThrow('own time'); expect(state.claims).toHaveLength(0);
  });
  it('rejects stale supplied-edition starts before creating learning records', async () => {
    state.published = false;
    await expect(startGuideLearning(2, 7, 'provider-guide', { purpose: 'practice', requestKey: 'beta-practice-0001', expectedVersionId: 0, expectedBetaRevision: 'stale' })).rejects.toThrow('beta edition changed');
    await expect(start()).rejects.toThrow('edition changed'); expect(state.enrollments).toHaveLength(0);
  });
});

it('offers every supplied ITSCO, NLU and ISI training source as a matching beta edition', async () => {
  state.published = false;
  for (const slug of ['itsco', 'next-level-up', 'the-inner-strength-institute']) {
    const agency = { id: 2, slug };
    const definitions = trainingDefinitionsFor(agency);
    expect(definitions.length).toBeGreaterThan(5);
    for (const definition of definitions) expect((await documentTrainingCourse(agency, definition.documentKey)).status, `${slug}:${definition.documentKey}`).toBe('beta');
  }
});

it('opens the available beta guide for reading without enrollment, completion, or payroll writes', async () => {
  state.user.status = 'ONBOARDING'; state.published = false;
  const result = await readGuide(2, 7, 'provider-guide');
  expect(result.status).toBe('beta'); expect(result.book.sections.length).toBeGreaterThan(0);
  expect(result.definition).toBeUndefined(); expect(state.enrollments).toHaveLength(0);
  expect(mocks.execute.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
});
it('uses retained guide requirements and keeps unrelated saved learning intact', async () => {
  state.user.status = 'ONBOARDING';
  state.packet = { onboardingTraining: { guideRequirements: { 'provider-guide': false, 'facilities-guide': true } } };
  const context = await learningContext(2, 7);
  expect(context.requiredKeys).not.toContain('provider-guide'); expect(context.requiredKeys).toContain('facilities-guide');
});

it('starts required onboarding directly from the supplied guide and saves its immutable edition', async () => {
  state.user.status = 'ONBOARDING'; state.published = false;
  const course = await documentTrainingCourse(state.agency, 'provider-guide');
  const { id } = await startGuideLearning(2, 7, 'provider-guide', { purpose: 'onboarding', expectedVersionId: 0, expectedBetaRevision: course.revision });
  const detail = await guideLearningDetail(2, 7, id);
  expect(detail.paid).toBe(true); expect(detail.onboardingTime).toBe(true); expect(detail.book.sections).toEqual(source.sections);
  expect(detail.definition.questions[0].correctAnswer).toBeUndefined();
  await readAll(id);
  expect((await submitGuideQuiz(2, 7, id, { requestKey: 'source-reflection-01', answers: def.questions.map(q => (q.correctAnswer + 1) % q.options.length) })).completed).toBe(true);
});

it('saves each scenario with an explanation, resumes it, and never completes from a reveal alone', async () => {
  const id = await start(), q = def.questions[0], input = { questionId: q.id, answer: (q.correctAnswer + 1) % q.options.length };
  await expect(revealGuideReflection(2, 7, id, input)).rejects.toThrow('Review this topic');
  await markGuideReading(2, 7, id, q.sourceSlug);
  const result = await revealGuideReflection(2, 7, id, input);
  expect(result).toMatchObject({ id: q.id, selectedAnswer: input.answer, answer: q.options[q.correctAnswer], explanation: q.explanation });
  expect(result.passed).toBeUndefined(); expect(result.score).toBeUndefined();
  expect(state.enrollments[0].status).toBe('in_progress');
  const detail = await guideLearningDetail(2, 7, id);
  expect(detail.reflections).toEqual([result]); expect(detail.attempts).toEqual([]);
  expect(detail.definition.questions[0].sourceSlug).toBe(q.sourceSlug);
  await revealGuideReflection(2, 7, id, { ...input, answer: q.correctAnswer });
  expect(state.attempts).toHaveLength(1);
  await expect(revealGuideReflection(2, 8, id, input)).rejects.toThrow('not found');
  await expect(revealGuideReflection(9, 7, id, input)).rejects.toThrow('not found');
  await expect(revealGuideReflection(2, 7, id, { ...input, answer: 99 })).rejects.toThrow('Choose a response');
});

it('edits source-edition visuals and answer explanations without publishing or changing an existing learning snapshot', async () => {
  state.published = false;
  const workspace = await trainingReviewWorkspace(2, 'provider-guide');
  const original = await startGuideLearning(2, 7, 'provider-guide', { purpose: 'practice', requestKey: 'before-visual-edit', expectedVersionId: 0, expectedBetaRevision: workspace.revision });
  const definition = structuredClone(def), slug = definition.requiredSections[0];
  definition.lessonPresentation = { [slug]: { title: 'Your first steps', facts: ['Read the scope of your role.', 'Ask your supervisor when unsure.'], imageUrl: '/assets/rise/therapy.webp', imageAlt: 'A conversation' } };
  definition.questions[0].choiceExplanations = definition.questions[0].options.map((_, i) => i === definition.questions[0].correctAnswer ? 'Clarification keeps the work within your role.' : 'A request alone does not establish authorization.');
  const input = { expectedVersionId: 0, expectedSourceRevision: workspace.sourceRevision, expectedReviewRevision: null, definition };
  await expect(reviewDocumentTraining(2, 'provider-guide', 9, { ...input, expectedSourceRevision: 'old' })).rejects.toThrow('supplied guide changed');
  await reviewDocumentTraining(2, 'provider-guide', 9, input);
  const updated = await trainingReviewWorkspace(2, 'provider-guide');
  expect(updated.definition.lessonPresentation[slug].facts).toEqual(definition.lessonPresentation[slug].facts);
  const next = await startGuideLearning(2, 7, 'provider-guide', { purpose: 'practice', requestKey: 'after-visual-edit', expectedVersionId: 0, expectedBetaRevision: updated.revision });
  expect((await guideLearningDetail(2, 7, original.id)).definition.lessonPresentation).toBeUndefined();
  expect((await guideLearningDetail(2, 7, next.id)).definition.lessonPresentation[slug].title).toBe('Your first steps');
  await markGuideReading(2, 7, next.id, def.questions[0].sourceSlug);
  expect((await revealGuideReflection(2, 7, next.id, { questionId: def.questions[0].id, answer: 0 })).choiceExplanation).toBe('A request alone does not establish authorization.');
  await expect(reviewDocumentTraining(2, 'provider-guide', 9, input)).rejects.toThrow('Another administrator');
});
it('validates lesson photo links and optional choice explanations', () => {
  const definition = structuredClone(def), book = { sections: source.sections };
  definition.lessonPresentation = { [def.requiredSections[0]]: { imageUrl: 'javascript:alert(1)', facts: ['A point'] } };
  expect(() => validateTrainingDefinition(definition, book)).toThrow('HTTPS image');
  definition.lessonPresentation = {}; definition.questions[0].choiceExplanations = ['Only one'];
  expect(() => validateTrainingDefinition(definition, book)).toThrow('one optional explanation');
});
