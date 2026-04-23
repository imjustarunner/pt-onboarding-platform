import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilityUiPayload,
  getCapabilityCatalogForTests,
  matchCatalogBackedPageNavigationIntent,
  matchDeterministicCapabilityIntent
} from '../assistantCapabilityCatalog.service.js';

function setOf(...items) {
  return new Set(items);
}

test('deterministic acceptance matrix for top prompts', () => {
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
    'getEventResponses',
    'searchAgencyActivity',
    'getAgencyActivityStats',
    'listMyRecentActivity'
  );

  const cases = [
    ['Open my workspace for today', 'openTodaysWorkspace'],
    ['what is active right now', 'openTodaysWorkspace'],
    ['start a meeting with Sarah', 'searchUsers'],
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
    ['who rsvp for this friday event', 'getEventResponses'],
    ['what activity happened in my agency this week', 'searchAgencyActivity'],
    ['show me what i did today', 'listMyRecentActivity'],
    ['when did I last log in?', 'listMyRecentActivity']
  ];

  for (const [prompt, expectedToolName] of cases) {
    const intent = matchDeterministicCapabilityIntent({ prompt, allowedToolNames: allTools });
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

test('drift guard: every visible prompt maps to a deterministic capability and catalog id', () => {
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
    'getEventResponses',
    'searchAgencyActivity',
    'getAgencyActivityStats',
    'listMyRecentActivity'
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
    const intent = matchDeterministicCapabilityIntent({ prompt, allowedToolNames: adminTools });
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

