import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchDeterministicCapabilityIntent
} from '../assistantCapabilityCatalog.service.js';

test('forceCapabilityId overrides normal routing', async () => {
  const tools = new Set(['getMyPayrollSummary', 'searchTrainingKnowledgeBase', 'navigateTo']);
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'look up remote work policy for me',
    allowedToolNames: tools,
    forceCapabilityId: 'payroll_summary'
  });
  assert.equal(intent?.toolCalls?.[0]?.name, 'getMyPayrollSummary');
  assert.equal(intent?.forcedCapability, true);
  assert.equal(intent?.capabilityId, 'payroll_summary');
});

test('forceCapabilityId ignored when tools missing', async () => {
  const tools = new Set(['searchTrainingKnowledgeBase', 'navigateTo']);
  const intent = await matchDeterministicCapabilityIntent({
    prompt: 'look up remote work policy for me',
    allowedToolNames: tools,
    forceCapabilityId: 'payroll_summary'
  });
  // Falls through to handbook search (hard matcher / semantic)
  assert.equal(intent?.toolCalls?.[0]?.name, 'searchTrainingKnowledgeBase');
  assert.notEqual(intent?.forcedCapability, true);
});
