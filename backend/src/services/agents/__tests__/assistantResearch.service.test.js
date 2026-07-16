import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeServiceCodeQuery,
  shouldAttemptAgencyResearch,
  buildResearchAssistantText,
  looksLikeBillingOrServiceCodeTopic,
  hitMatchesResearchQuery
} from '../assistantResearch.service.js';

test('service code detection', () => {
  assert.equal(looksLikeServiceCodeQuery('what is h2014'), true);
  assert.equal(looksLikeServiceCodeQuery('what is H2015'), true);
  assert.equal(looksLikeServiceCodeQuery('H0004 details'), true);
  assert.equal(looksLikeServiceCodeQuery('T1017 billing'), true);
  assert.equal(looksLikeServiceCodeQuery('pto policy'), false);
});

test('billing code topic detection', () => {
  assert.equal(looksLikeBillingOrServiceCodeTopic('what codes are for psychotherapy'), true);
  assert.equal(looksLikeBillingOrServiceCodeTopic('CPT codes for counseling'), true);
  assert.equal(looksLikeBillingOrServiceCodeTopic('parent child partnership session 1'), false);
  assert.equal(looksLikeBillingOrServiceCodeTopic('what is the PCP class about'), false);
});

test('class lesson plans are not valid hits for psychotherapy code asks', () => {
  const pcpHit = {
    kind: 'clinical',
    name: 'clinical/PCP/Parent Child Partnership Session Highlights.pdf',
    score: 2,
    snippets: [
      'Session 1 — Establishing the Foundation. Families work best when we start from understanding, not blame. Therapy themes for parents.'
    ]
  };
  assert.equal(hitMatchesResearchQuery(pcpHit, 'what codes are for psychotherapy'), false);

  const billingHit = {
    kind: 'clinical',
    name: 'billing/psychotherapy_codes.pdf',
    score: 4,
    snippets: [
      'Psychotherapy CPT codes: 90832, 90834, 90837. HCPCS and billing units for outpatient therapy.'
    ]
  };
  assert.equal(hitMatchesResearchQuery(billingHit, 'what codes are for psychotherapy'), true);
});

test('service codes never route to recent activity', async () => {
  const { matchDeterministicCapabilityIntent } = await import('../assistantCapabilityCatalog.service.js');
  const tools = new Set([
    'listMyRecentActivity',
    'searchTrainingKnowledgeBase',
    'openTodaysWorkspace',
    'navigateTo'
  ]);
  for (const p of ['what is H2014', 'what is H2015', 'H2014', 'explain T1017']) {
    const i = await matchDeterministicCapabilityIntent({ prompt: p, allowedToolNames: tools });
    assert.equal(i?.capabilityId, 'service_code_research', `Wrong route for "${p}"`);
    assert.equal(i?.followUpAgencyResearch, true);
    assert.notEqual(i?.toolCalls?.[0]?.name, 'listMyRecentActivity');
  }
});

test('shouldAttemptAgencyResearch covers definition and code asks', () => {
  assert.equal(shouldAttemptAgencyResearch('what is h2014'), true);
  assert.equal(shouldAttemptAgencyResearch('What service details can you tell me about H2014'), true);
  assert.equal(shouldAttemptAgencyResearch('explain remote work'), true);
  assert.equal(shouldAttemptAgencyResearch('what codes are for psychotherapy'), true);
  assert.equal(shouldAttemptAgencyResearch(''), false);
});

test('shouldAttemptAgencyResearch skips chat/meet-with-person asks', () => {
  assert.equal(shouldAttemptAgencyResearch('chat with melissa'), false);
  assert.equal(shouldAttemptAgencyResearch('meet with Bob'), false);
  assert.equal(shouldAttemptAgencyResearch('talk to Sarah'), false);
  assert.equal(shouldAttemptAgencyResearch('start a meeting with melissa'), false);
});

test('operational school client counts never go to document research', () => {
  assert.equal(shouldAttemptAgencyResearch('how many clients are active at Rudy Elementary'), false);
  assert.equal(shouldAttemptAgencyResearch('how many students at Twain'), false);
  assert.equal(shouldAttemptAgencyResearch('active clients at Lincoln Elementary'), false);
});

test('school client count prompts route to getSchoolClientStats', async () => {
  const { matchDeterministicCapabilityIntent } = await import('../assistantCapabilityCatalog.service.js');
  const tools = new Set(['getSchoolClientStats', 'searchSchools', 'searchTrainingKnowledgeBase', 'navigateTo']);
  for (const p of [
    'how many clients are active at Rudy Elementary',
    'how many students at Twain',
    'active clients at Lincoln Elementary'
  ]) {
    const i = await matchDeterministicCapabilityIntent({ prompt: p, allowedToolNames: tools });
    assert.equal(i?.toolCalls?.[0]?.name, 'getSchoolClientStats', `Wrong route for "${p}"`);
    assert.ok(i?.toolCalls?.[0]?.args?.query, `Expected school name query for "${p}"`);
  }
});

test('buildResearchAssistantText formats hits', () => {
  const text = buildResearchAssistantText({
    query: 'h2014',
    hits: [
      {
        kind: 'clinical',
        folder: 'clinical',
        name: 'H2014_billing.txt',
        snippets: ['Skill development and community support…']
      }
    ]
  });
  assert.match(text, /h2014/i);
  assert.match(text, /H2014_billing/);
  assert.match(text, /Skill development/);
});
