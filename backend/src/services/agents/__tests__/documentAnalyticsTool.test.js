import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.ASK_ASSISTANT_GEMINI_ROUTER = '0';
const { getToolSchemasForUser, executeToolCall } = await import('../toolRegistry.service.js');
const { matchDeterministicCapabilityIntent } = await import('../assistantCapabilityCatalog.service.js');
const { default: pool } = await import('../../../config/database.js');
test.after(() => pool.end());
test('document report tool is offered only to administrators', () => {
  for (const role of ['admin', 'super_admin', 'superadmin']) assert.ok(getToolSchemasForUser({ id: 7, role }).some(t => t.name === 'queryDocumentAnalytics'));
  for (const role of ['provider', 'support', 'staff', 'supervisor']) assert.ok(!getToolSchemasForUser({ id: 7, role }).some(t => t.name === 'queryDocumentAnalytics'));
  assert.ok(!getToolSchemasForUser({ id: 7, role: 'super_admin', effectiveRole: 'provider' }).some(t => t.name === 'queryDocumentAnalytics'));
});
test('admin statistics question routes through the bounded reporting tool', async () => {
  const route = await matchDeterministicCapabilityIntent({ prompt: 'What questions were asked about the handbook?', allowedToolNames: new Set(['queryDocumentAnalytics']) });
  assert.equal(route.toolCalls[0].name, 'queryDocumentAnalytics'); assert.equal(route.toolCalls[0].args.detail, 'questions');
});
test('calling the reporting tool directly still rejects a staff role', async () => {
  await assert.rejects(executeToolCall({ req: { user: { id: 8, role: 'provider' }, headers: { 'x-agency-id': '2' } }, toolCall: { name: 'queryDocumentAnalytics', args: {} } }), { status: 403 });
});
test('a requested company cannot silently replace the assistant company context', async () => {
  await assert.rejects(executeToolCall({ req: { user: { id: 7, role: 'admin' }, headers: { 'x-agency-id': '2' } }, toolCall: { name: 'queryDocumentAnalytics', args: { requestedAgencyId: 12 } } }), { status: 403 });
});
