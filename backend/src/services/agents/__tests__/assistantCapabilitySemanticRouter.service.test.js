import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilityDocumentText,
  pickBestCapabilityBySimilarity,
  rankCapabilitiesBySimilarity,
  tokenizeForCapabilityRouting
} from '../assistantCapabilitySemanticRouter.service.js';
import {
  matchDeterministicCapabilityIntent,
  matchSemanticCapabilityIntent,
  rankSemanticCapabilityMatches
} from '../assistantCapabilityCatalog.service.js';

const PREV_GEMINI_ROUTER = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
process.env.ASK_ASSISTANT_GEMINI_ROUTER = '0';
test.after(() => {
  if (PREV_GEMINI_ROUTER === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = PREV_GEMINI_ROUTER;
});

test('tokenize drops stopwords and keeps content terms', () => {
  const toks = tokenizeForCapabilityRouting('What is the company policy on PTO?');
  assert.ok(toks.includes('company'));
  assert.ok(toks.includes('policy'));
  assert.ok(toks.includes('pto'));
  assert.equal(toks.includes('what'), false);
  assert.equal(toks.includes('the'), false);
});

test('TF-IDF ranks handbook ask above school portal', () => {
  const entries = [
    {
      id: 'training_kb_search',
      prompt: "What's the company policy on PTO?",
      group: 'Handbook',
      subtitleTag: 'handbook',
      routeHints: ['pto', 'sick leave', 'company policy'],
      semanticExamples: ['look up remote work policy']
    },
    {
      id: 'school_portal_lookup',
      prompt: 'Open Twain school portal',
      group: 'Schools',
      subtitleTag: 'schools',
      routeHints: ['school portal'],
      semanticExamples: ['find elementary school portal']
    }
  ];
  const best = pickBestCapabilityBySimilarity({
    prompt: 'look up the remote work policy in the handbook',
    entries
  });
  assert.equal(best?.capabilityId, 'training_kb_search');
  assert.ok(best.score > 0.18);
});

test('ambiguous prompts return null without a clear margin', () => {
  const entries = [
    { id: 'a', prompt: 'company handbook policy leave', group: 'x', subtitleTag: 'handbook' },
    { id: 'b', prompt: 'company handbook policy vacation', group: 'x', subtitleTag: 'handbook' }
  ];
  const best = pickBestCapabilityBySimilarity({
    prompt: 'company handbook policy',
    entries,
    minScore: 0.01,
    margin: 0.15
  });
  // Near-ties → no clear winner.
  assert.equal(best, null);
});

test('document text includes examples', () => {
  const text = buildCapabilityDocumentText({
    id: 'payroll_summary',
    prompt: 'Open payroll summary',
    semanticExamples: ['show my paycheck']
  });
  assert.match(text, /paycheck/);
  assert.match(text, /payroll summary/i);
});

test('semantic router does not steal service codes or write meetings', async () => {
  const tools = new Set([
    'searchTrainingKnowledgeBase',
    'startMeeting',
    'searchUsers',
    'listMyRecentActivity',
    'getMyPayrollSummary',
    'navigateTo'
  ]);
  assert.equal(await matchSemanticCapabilityIntent({ prompt: 'what is H2014', allowedToolNames: tools }), null);
  assert.equal(
    await matchSemanticCapabilityIntent({ prompt: 'start a meeting with Melissa', allowedToolNames: tools }),
    null
  );
});

test('loose handbook paraphrase routes via semantic fallback', async () => {
  const tools = new Set(['navigateTo', 'searchTrainingKnowledgeBase', 'getMyPayrollSummary']);
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'look up remote work policy for me',
    allowedToolNames: tools
  });
  assert.ok(intent);
  assert.equal(intent.toolCalls?.[0]?.name, 'searchTrainingKnowledgeBase');
});

test('paycheck paraphrase can semantic-route to payroll', async () => {
  const tools = new Set(['getMyPayrollSummary', 'searchTrainingKnowledgeBase', 'navigateTo']);
  const ranked = rankSemanticCapabilityMatches({
    prompt: 'how much was my last paycheck',
    allowedToolNames: tools
  });
  assert.ok(ranked.length);
  assert.equal(ranked[0].capabilityId, 'payroll_summary');

  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'how much was my last paycheck',
    allowedToolNames: tools
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'getMyPayrollSummary');
});

test('school client counts stay hard-routed not document research', async () => {
  const tools = new Set([
    'getSchoolClientStats',
    'searchSchools',
    'searchTrainingKnowledgeBase',
    'navigateTo'
  ]);
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'how many clients are active at Rudy Elementary',
    allowedToolNames: tools
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'getSchoolClientStats');
  assert.equal(intent?.semanticRouted, undefined);
});

test('rankCapabilitiesBySimilarity returns descending scores', () => {
  const ranked = rankCapabilitiesBySimilarity({
    prompt: 'pto sick leave handbook policy',
    entries: [
      { id: 'training_kb_search', prompt: 'company policy on PTO sick leave handbook', routeHints: ['pto', 'handbook'] },
      { id: 'payroll_summary', prompt: 'Open payroll summary paycheck policy', routeHints: ['payroll', 'paycheck'] }
    ]
  });
  assert.ok(ranked.length >= 2);
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.equal(ranked[0].capabilityId, 'training_kb_search');
});
