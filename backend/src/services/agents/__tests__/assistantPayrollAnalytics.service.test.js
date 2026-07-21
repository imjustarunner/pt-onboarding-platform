import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchDeterministicCapabilityIntent
} from '../assistantCapabilityCatalog.service.js';

// Keep Gemini off so CI needs no API key.
const PREV_GEMINI_ROUTER = process.env.ASK_ASSISTANT_GEMINI_ROUTER;
process.env.ASK_ASSISTANT_GEMINI_ROUTER = '0';
test.after(() => {
  if (PREV_GEMINI_ROUTER === undefined) delete process.env.ASK_ASSISTANT_GEMINI_ROUTER;
  else process.env.ASK_ASSISTANT_GEMINI_ROUTER = PREV_GEMINI_ROUTER;
  // Catalog import chain may open a DB pool; force exit so unit runs don't hang.
  setImmediate(() => process.exit(0));
});

function setOf(...items) {
  return new Set(items);
}

test('payroll analytics capability matches session and ranking prompts', async () => {
  const tools = setOf('queryPayrollAnalytics', 'getMyPayrollSummary', 'searchTrainingKnowledgeBase', 'navigateTo');
  const cases = [
    ['how many 90837 sessions has jordan had this year', 'queryPayrollAnalytics'],
    ['show me the top five compensations', 'queryPayrollAnalytics'],
    ['who sees the most clients', 'queryPayrollAnalytics'],
    ['who gets paid the most', 'queryPayrollAnalytics'],
    ['how many pto hours does taylor have as of today', 'queryPayrollAnalytics'],
    ['open payroll summary', 'getMyPayrollSummary'],
    ['what is the company policy on PTO?', 'searchTrainingKnowledgeBase']
  ];

  for (const [prompt, tool] of cases) {
    const intent = await matchDeterministicCapabilityIntent({
      prompt,
      allowedToolNames: tools
    });
    const names = (intent?.toolCalls || []).map((t) => t.name);
    assert.ok(names.includes(tool), `expected ${tool} for "${prompt}", got ${JSON.stringify(intent)}`);
  }
});

test('payroll analytics buildIntent carries service code and ytd', async () => {
  const tools = setOf('queryPayrollAnalytics');
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'how many 90837 sessions has jordan had year to date',
    allowedToolNames: tools
  });
  assert.equal(intent?.capabilityId, 'payroll_analytics');
  const args = intent?.toolCalls?.[0]?.args || {};
  assert.equal(args.intent, 'sessions');
  assert.equal(String(args.serviceCode || '').toUpperCase(), '90837');
  assert.equal(args.timeframe, 'ytd');
  assert.match(String(args.personName || ''), /jordan/i);
});

test('custom range without dates is requested via timeframe=custom args', async () => {
  const tools = setOf('queryPayrollAnalytics');
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'how many sessions has jordan had from this date to that date',
    allowedToolNames: tools
  });
  assert.equal(intent?.capabilityId, 'payroll_analytics');
  const args = intent?.toolCalls?.[0]?.args || {};
  assert.equal(args.intent, 'sessions');
  assert.equal(args.timeframe, 'custom');
});
