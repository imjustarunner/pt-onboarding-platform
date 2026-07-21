import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilityUiPayload,
  getCapabilityCatalogForTests,
  matchCatalogBackedPageNavigationIntent,
  matchDeterministicCapabilityIntent,
  matchProfileSectionJumpIntent,
  rankCorrectionChoices
} from '../assistantCapabilityCatalog.service.js';

function setOf(...items) {
  return new Set(items);
}

// Existing suite exercises hard matchers + TF–IDF; keep Gemini off so CI needs no API key.
const PREV_GEMINI_ROUTER = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
process.env.ASK_ASSISTANT_GEMINI_ROUTER = '0';
test.after(() => {
  if (PREV_GEMINI_ROUTER === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = PREV_GEMINI_ROUTER;
});

test('deterministic acceptance matrix for top prompts', async () => {
  const allTools = setOf(
    'openTodaysWorkspace',
    'startMeeting',
    'searchUsers',
    'rescheduleMeeting',
    'pushTodaysRemainingMeetings',
    'cancelMeeting',
    'cancelTodaysRemainingMeetings',
    'findNextMeeting',
    'findMyMeetings',
    'findIntakeOpenings',
    'findProvidersByApproach',
    'searchReferralDirectory',
    'searchSchools',
    'searchEvents',
    'navigateTo',
    'getMyPayrollSummary',
    'getOfficeSchedule',
    'listOfficeRoster',
    'getEventResponses',
    'searchAgencyActivity',
    'getAgencyActivityStats',
    'listMyRecentActivity',
    'listTeamPresence',
    'searchTrainingKnowledgeBase'
  );

  const cases = [
    ['Open my workspace for today', 'openTodaysWorkspace'],
    ['what is active right now', 'openTodaysWorkspace'],
    ['start a meeting with Sarah', 'searchUsers'],
    ['start a virtual meeting with melissa', 'searchUsers'],
    ['schedule a meeting with melissa', 'searchUsers'],
    ['start a zoom meeting with Bob', 'searchUsers'],
    ['hop on a call with Jane', 'searchUsers'],
    ['set up a video meeting with Alex', 'searchUsers'],
    ['chat with melissa', 'searchUsers'],
    ['meet with melissa', 'searchUsers'],
    ['talk to melissa', 'searchUsers'],
    ['call with melissa', 'searchUsers'],
    ['video chat with melissa', 'searchUsers'],
    ['Move my 3pm to 4pm', 'findMyMeetings'],
    ['push everything 30 minutes', null],
    ['cancel the meeting with Sarah', 'findMyMeetings'],
    ['cancel my next meeting', 'findNextMeeting'],
    ['cancel the rest of my day because I am sick', null],
    ['who has an intake opening today', 'findIntakeOpenings'],
    ['who uses cbt', 'findProvidersByApproach'],
    ['find pediatric psychiatry referrals', 'searchReferralDirectory'],
    ['open Twain school portal', 'searchSchools'],
    ['open upcoming events', 'navigateTo'],
    ['open payroll summary', 'getMyPayrollSummary'],
    ['show my paycheck summary', 'getMyPayrollSummary'],
    ['what offices are open today', 'getOfficeSchedule'],
    ['who has an office today', 'listOfficeRoster'],
    ['who is booked in the windchime office today', 'listOfficeRoster'],
    ['whos working right now', 'listTeamPresence'],
    ['how long has rachel been idle', 'listTeamPresence'],
    ['who rsvp for this friday event', 'getEventResponses'],
    ['what activity happened in my agency this week', 'searchAgencyActivity'],
    ['show me what i did today', 'listMyRecentActivity'],
    ['when did I last log in?', 'listMyRecentActivity'],
    ['whats the company policy on PTO', 'searchTrainingKnowledgeBase'],
    ['What does the handbook say about sick leave?', 'searchTrainingKnowledgeBase'],
    ['dress code policy', 'searchTrainingKnowledgeBase'],
    ['go to training knowledge base', 'navigateTo'],
    ['open training reference doc', 'navigateTo'],
    ['add handbook link', 'navigateTo'],
    ['add training doc', 'navigateTo']
  ];

  for (const [prompt, expectedToolName] of cases) {
    const intent = await matchDeterministicCapabilityIntent({ prompt, allowedToolNames: allTools });
    assert.ok(intent, `Expected deterministic intent for "${prompt}"`);
    if (expectedToolName) {
      assert.equal(intent.toolCalls?.[0]?.name, expectedToolName, `Wrong tool for "${prompt}"`);
    }
  }
});

test('capability payload only returns role/tool-eligible prompts', () => {
  const providerTools = setOf(
    'openTodaysWorkspace',
    'findIntakeOpenings',
    'findProvidersByApproach',
    'searchReferralDirectory',
    'listMyRecentActivity'
  );
  const payload = buildCapabilityUiPayload({ role: 'provider', allowedToolNames: providerTools });

  const allPrompts = [
    ...(payload.suggestions || []),
    ...((payload.groups || []).flatMap((g) => g.prompts || []))
  ];
  assert.ok(allPrompts.length > 0, 'Expected capability prompts for provider');
  assert.equal(allPrompts.some((p) => /payroll/i.test(p)), false, 'Provider payload should not include payroll without payroll tool');
  assert.equal(allPrompts.some((p) => /twain school portal/i.test(p)), false, 'Provider payload should not include school portal without searchSchools tool');
});

test('drift guard: every visible prompt maps to a deterministic capability and catalog id', async () => {
  const adminTools = setOf(
    'openTodaysWorkspace',
    'startMeeting',
    'searchUsers',
    'rescheduleMeeting',
    'pushTodaysRemainingMeetings',
    'cancelMeeting',
    'cancelTodaysRemainingMeetings',
    'findNextMeeting',
    'findMyMeetings',
    'findIntakeOpenings',
    'findProvidersByApproach',
    'searchReferralDirectory',
    'searchSchools',
    'searchEvents',
    'navigateTo',
    'getMyPayrollSummary',
    'getOfficeSchedule',
    'listOfficeRoster',
    'getEventResponses',
    'searchAgencyActivity',
    'getAgencyActivityStats',
    'listMyRecentActivity',
    'searchTrainingKnowledgeBase'
  );
  const payload = buildCapabilityUiPayload({ role: 'admin', allowedToolNames: adminTools });
  const catalogIds = new Set(getCapabilityCatalogForTests().map((c) => c.id));

  const prompts = new Set([
    ...(payload.suggestions || []),
    ...((payload.groups || []).flatMap((g) => g.prompts || []))
  ]);

  for (const prompt of prompts) {
    const capabilityId = payload.promptToCapabilityId?.[prompt];
    assert.ok(capabilityId, `Prompt "${prompt}" missing prompt->capability mapping`);
    assert.ok(catalogIds.has(capabilityId), `Prompt "${prompt}" points to unknown capability id "${capabilityId}"`);
    const intent = await matchDeterministicCapabilityIntent({ prompt, allowedToolNames: adminTools });
    assert.ok(intent, `Visible prompt "${prompt}" is not deterministically routable`);
    assert.equal(
      String(intent.capabilityId || ''),
      String(capabilityId || ''),
      `Visible prompt "${prompt}" routed to mismatched capability id`
    );
  }
});

test('generic page navigation fallback is catalog-backed', () => {
  const tools = setOf('navigateTo');
  const nav = matchCatalogBackedPageNavigationIntent({
    prompt: 'take me to referral directory',
    allowedToolNames: tools
  });
  assert.ok(nav, 'Expected generic nav intent');
  assert.equal(nav.toolCalls?.[0]?.name, 'navigateTo');
  assert.equal(nav.toolCalls?.[0]?.args?.routeName, 'ReferralDirectory');
});

test('short prompt gear navigates to GearInventory off-profile', () => {
  const tools = setOf('navigateTo');
  const nav = matchCatalogBackedPageNavigationIntent({
    prompt: 'gear',
    allowedToolNames: tools
  });
  assert.ok(nav);
  assert.equal(nav.toolCalls?.[0]?.args?.routeName, 'GearInventory');
});

test('profile section jump: gear opens lifecycle equipment on profile', () => {
  const intent = matchProfileSectionJumpIntent({
    prompt: 'gear',
    context: { routeName: 'UserProfile', profileUserId: 42, path: '/admin/users/42' }
  });
  assert.ok(intent);
  assert.equal(intent.uiCommands?.[0]?.type, 'profileJump');
  assert.equal(intent.uiCommands?.[0]?.tabId, 'lifecycle');
  assert.equal(intent.uiCommands?.[0]?.sectionId, 'lifecycle-equipment');
});

test('profile section jump: licenses opens account licenses', () => {
  const intent = matchProfileSectionJumpIntent({
    prompt: 'open licenses',
    context: { routeName: 'OrganizationUserProfile', profileUserId: 7 }
  });
  assert.ok(intent);
  assert.equal(intent.uiCommands?.[0]?.tabId, 'account');
  assert.equal(intent.uiCommands?.[0]?.sectionId, 'licenses');
});

test('profile section jump: specialties opens clinical subtab', () => {
  const intent = matchProfileSectionJumpIntent({
    prompt: 'specialties',
    context: { path: '/org/admin/users/9', profileUserId: 9 }
  });
  assert.ok(intent);
  assert.equal(intent.uiCommands?.[0]?.tabId, 'provider_info');
  assert.equal(intent.uiCommands?.[0]?.clinicalSubTab, 'specialties');
});

test('profile section jump ignored off-profile', () => {
  const intent = matchProfileSectionJumpIntent({
    prompt: 'gear',
    context: { routeName: 'Dashboard', path: '/dashboard' }
  });
  assert.equal(intent, null);
});

test('manage handbook phrases navigate; policy questions search', async () => {
  const tools = setOf('navigateTo', 'searchTrainingKnowledgeBase');
  const open = await matchDeterministicCapabilityIntent({
    prompt: 'add handbook link',
    allowedToolNames: tools
  });
  assert.equal(open?.toolCalls?.[0]?.name, 'navigateTo');
  assert.equal(open?.toolCalls?.[0]?.args?.routeName, 'TrainingKnowledgeBase');

  const search = await matchDeterministicCapabilityIntent({
    prompt: 'whats the company policy on PTO',
    allowedToolNames: tools
  });
  assert.equal(search?.toolCalls?.[0]?.name, 'searchTrainingKnowledgeBase');
});

test('soft routing matches training kb open from loose phrasing', async () => {
  const tools = setOf('navigateTo', 'searchTrainingKnowledgeBase');
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'upload handbook google doc please',
    allowedToolNames: tools
  });
  assert.ok(intent, 'Expected soft or hard route for handbook upload phrasing');
  assert.equal(intent.toolCalls?.[0]?.name, 'navigateTo');
});

test('presence follow-up extracts name query for idle duration', async () => {
  const tools = setOf('listTeamPresence');
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'How long has rachel been idle',
    allowedToolNames: tools
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'listTeamPresence');
  assert.equal(String(intent?.toolCalls?.[0]?.args?.nameQuery || '').toLowerCase(), 'rachel');
});

test('office roster extracts location query and correction chips prefer office intents', async () => {
  const tools = setOf(
    'listOfficeRoster',
    'getOfficeSchedule',
    'openTodaysWorkspace',
    'startMeeting',
    'searchUsers',
    'findMyMeetings',
    'cancelMeeting',
    'pushTodaysRemainingMeetings'
  );
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'who is booked in the windchime office today',
    allowedToolNames: tools
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'listOfficeRoster');
  assert.equal(String(intent?.toolCalls?.[0]?.args?.locationQuery || '').toLowerCase(), 'windchime');

  const choices = rankCorrectionChoices({
    prompt: 'who is booked in the windchime office today',
    role: 'admin',
    allowedToolNames: tools,
    excludeCapabilityId: 'office_schedule',
    limit: 6
  });
  assert.ok(choices.length > 0);
  assert.equal(choices.some((c) => c.id === 'office_roster'), true);
  assert.equal(choices.some((c) => c.id === 'office_schedule'), false);
  assert.ok(choices.length <= 6);
});

