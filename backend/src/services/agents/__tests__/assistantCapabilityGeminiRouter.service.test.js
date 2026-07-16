import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCapabilityRouterJson,
  verifyOrCorrectCapabilityRoute,
  askAssistantGeminiRouterEnabled
} from '../assistantCapabilityGeminiRouter.service.js';
import {
  matchDeterministicCapabilityIntent,
  matchSemanticCapabilityIntent
} from '../assistantCapabilityCatalog.service.js';

test('parseCapabilityRouterJson accepts capabilityId', () => {
  assert.deepEqual(parseCapabilityRouterJson('{"capabilityId":"payroll_summary","confidence":"high"}'), {
    capabilityId: 'payroll_summary',
    confidence: 'high'
  });
  assert.equal(parseCapabilityRouterJson('{"capabilityId":null}').capabilityId, null);
  assert.equal(
    parseCapabilityRouterJson('```json\n{"capabilityId":"training_kb_search"}\n```').capabilityId,
    'training_kb_search'
  );
});

test('askAssistantGeminiRouterEnabled defaults on', () => {
  const prev = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  assert.equal(askAssistantGeminiRouterEnabled(), true);
  process.env.ASK_ASSISTANT_GEMINI_ROUTER = '0';
  assert.equal(askAssistantGeminiRouterEnabled(), false);
  if (prev === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = prev;
});

test('verifyOrCorrect accepts TF-IDF top pick', async () => {
  const entries = [
    { id: 'payroll_summary', prompt: 'Open payroll summary', semanticExamples: ['paycheck'] },
    { id: 'training_kb_search', prompt: 'PTO policy', semanticExamples: ['handbook'] }
  ];
  const ranked = [
    { capabilityId: 'payroll_summary', score: 0.4, entry: entries[0] },
    { capabilityId: 'training_kb_search', score: 0.1, entry: entries[1] }
  ];
  const out = await verifyOrCorrectCapabilityRoute({
    prompt: 'how much was my last paycheck',
    ranked,
    eligibleEntries: entries,
    callGemini: async () => ({ text: '{"capabilityId":"payroll_summary","confidence":"high"}' })
  });
  assert.equal(out.capabilityId, 'payroll_summary');
  assert.equal(out.geminiVerified, true);
  assert.equal(out.geminiCorrected, false);
});

test('verifyOrCorrect course-corrects wrong TF-IDF pick', async () => {
  const entries = [
    { id: 'payroll_summary', prompt: 'Open payroll summary' },
    { id: 'training_kb_search', prompt: 'PTO policy', semanticExamples: ['remote work'] }
  ];
  const ranked = [
    { capabilityId: 'payroll_summary', score: 0.22, entry: entries[0] },
    { capabilityId: 'training_kb_search', score: 0.2, entry: entries[1] }
  ];
  const out = await verifyOrCorrectCapabilityRoute({
    prompt: 'look up remote work policy',
    ranked,
    eligibleEntries: entries,
    callGemini: async () => ({ text: '{"capabilityId":"training_kb_search","confidence":"high"}' })
  });
  assert.equal(out.capabilityId, 'training_kb_search');
  assert.equal(out.geminiCorrected, true);
  assert.equal(out.tfidfTopId, 'payroll_summary');
});

test('verifyOrCorrect null means no route', async () => {
  const entries = [{ id: 'payroll_summary', prompt: 'Open payroll summary' }];
  const out = await verifyOrCorrectCapabilityRoute({
    prompt: 'what is the meaning of life',
    ranked: [{ capabilityId: 'payroll_summary', score: 0.05, entry: entries[0] }],
    eligibleEntries: entries,
    callGemini: async () => ({ text: '{"capabilityId":null,"confidence":"low"}' })
  });
  assert.equal(out.capabilityId, null);
});

test('verifyOrCorrect rejects id outside closed set', async () => {
  const entries = [{ id: 'payroll_summary', prompt: 'Open payroll summary' }];
  const out = await verifyOrCorrectCapabilityRoute({
    prompt: 'payroll',
    ranked: [],
    eligibleEntries: entries,
    callGemini: async () => ({ text: '{"capabilityId":"hacked_tool"}' })
  });
  assert.equal(out.capabilityId, null);
  assert.equal(out.error, 'invalid_id');
});

test('Gemini down falls back to clear TF-IDF winner', async () => {
  const prev = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  process.env.ASK_ASSISTANT_GEMINI_ROUTER = '1';
  const tools = new Set(['getMyPayrollSummary', 'searchTrainingKnowledgeBase', 'navigateTo']);
  const intent = await matchSemanticCapabilityIntent({
    prompt: 'how much was my last paycheck',
    allowedToolNames: tools,
    callGemini: async () => {
      throw new Error('Vertex Gemini request failed');
    }
  });
  assert.ok(intent, 'Expected TF-IDF fallback after Gemini failure');
  assert.equal(intent.toolCalls?.[0]?.name, 'getMyPayrollSummary');
  assert.ok(intent.geminiRouterError);
  if (prev === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = prev;
});

test('Gemini course-corrects catalog intent', async () => {
  const prev = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  process.env.ASK_ASSISTANT_GEMINI_ROUTER = '1';
  const tools = new Set(['getMyPayrollSummary', 'searchTrainingKnowledgeBase', 'navigateTo']);
  const intent = await matchSemanticCapabilityIntent({
    prompt: 'look up remote work policy for me',
    allowedToolNames: tools,
    callGemini: async () => ({ text: '{"capabilityId":"training_kb_search","confidence":"high"}' })
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'searchTrainingKnowledgeBase');
  assert.equal(intent?.capabilityId, 'training_kb_search');
  if (prev === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = prev;
});

test('hard paths never need Gemini mock', async () => {
  let geminiCalls = 0;
  const callGemini = async () => {
    geminiCalls += 1;
    return { text: '{"capabilityId":null}' };
  };
  const tools = new Set([
    'getSchoolClientStats',
    'searchSchools',
    'searchTrainingKnowledgeBase',
    'startMeeting',
    'searchUsers',
    'listMyRecentActivity',
    'navigateTo'
  ]);

  const code = await matchDeterministicCapabilityIntent({
    prompt: 'what is H2014',
    allowedToolNames: tools,
    callGemini
  });
  assert.equal(code?.capabilityId, 'service_code_research');

  const school = await matchDeterministicCapabilityIntent({
    prompt: 'how many clients are active at Rudy Elementary',
    allowedToolNames: tools,
    callGemini
  });
  assert.equal(school?.toolCalls?.[0]?.name, 'getSchoolClientStats');

  const meeting = await matchDeterministicCapabilityIntent({
    prompt: 'start a meeting with Melissa',
    allowedToolNames: tools,
    callGemini
  });
  assert.equal(meeting?.toolCalls?.[0]?.name, 'searchUsers');

  assert.equal(geminiCalls, 0, 'Hard matchers must not call Gemini');
});

test('router disabled uses TF-IDF only', async () => {
  const prev = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  process.env.ASK_ASSISTANT_GEMINI_ROUTER = '0';
  let geminiCalls = 0;
  const tools = new Set(['getMyPayrollSummary', 'searchTrainingKnowledgeBase', 'navigateTo']);
  const intent = await matchSemanticCapabilityIntent({
    prompt: 'how much was my last paycheck',
    allowedToolNames: tools,
    callGemini: async () => {
      geminiCalls += 1;
      return { text: '{"capabilityId":null}' };
    }
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'getMyPayrollSummary');
  assert.equal(geminiCalls, 0);
  if (prev === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = prev;
});
