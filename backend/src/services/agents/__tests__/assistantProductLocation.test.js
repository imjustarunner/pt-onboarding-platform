import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductLocationQuery,
  looksLikeProductLocationAsk,
  resolveBestProductLocation,
  formatProductLocationAnswer,
  matchProductLocationIntent
} from '../../../../../frontend/src/navigation/productLocationCatalog.js';
import { shouldAttemptAgencyResearch } from '../assistantResearch.service.js';

test('looksLikeProductLocationAsk catches where/find phrasing', () => {
  assert.equal(looksLikeProductLocationAsk('where can I find school events'), true);
  assert.equal(
    looksLikeProductLocationAsk('where do staff see the events for schools'),
    true
  );
  assert.equal(looksLikeProductLocationAsk('how do I get to payroll'), true);
  assert.equal(looksLikeProductLocationAsk('who has an intake opening today'), false);
});

test('extractProductLocationQuery normalizes school events paraphrases', () => {
  assert.equal(
    extractProductLocationQuery('where do staff see the events for schools'),
    'school events'
  );
  assert.equal(
    extractProductLocationQuery('where can I find school events'),
    'school events'
  );
  assert.equal(
    extractProductLocationQuery('Where can I find where staff can see the events for schools?'),
    'school events'
  );
});

test('resolveBestProductLocation maps school events asks', () => {
  const hit = resolveBestProductLocation({
    prompt: 'where do staff see the events for schools',
    role: 'admin',
    allowedRouteNames: new Set(['CaseloadHubEvents', 'SkillBuildersProgramsEvents']),
    minScore: 70
  });
  assert.ok(hit, 'expected a location hit');
  assert.equal(hit.entry.routeName, 'CaseloadHubEvents');
  assert.equal(hit.canNavigate, true);
  assert.match(formatProductLocationAnswer(hit.entry, { canNavigate: true }), /School Events/);
  assert.match(formatProductLocationAnswer(hit.entry, { canNavigate: true }), /Caseload Hub/);
});

test('matchProductLocationIntent returns navigateTo + explanation', () => {
  const intent = matchProductLocationIntent({
    prompt: 'Where can I find where staff can see the events for schools?',
    allowedToolNames: new Set(['navigateTo']),
    role: 'admin',
    allowedRouteNames: new Set(['CaseloadHubEvents'])
  });
  assert.ok(intent);
  assert.equal(intent.capabilityId, 'product_location_help');
  assert.equal(intent.toolCalls?.[0]?.name, 'navigateTo');
  assert.equal(intent.toolCalls?.[0]?.args?.routeName, 'CaseloadHubEvents');
  assert.match(String(intent.assistantText || ''), /School Events/);
  assert.match(String(intent.assistantText || ''), /Opening it for you/);
});

test('shouldAttemptAgencyResearch skips product location asks', () => {
  assert.equal(
    shouldAttemptAgencyResearch('where can I find school events'),
    false
  );
  assert.equal(
    shouldAttemptAgencyResearch('what is the PTO policy in the handbook'),
    true
  );
});

test('expanded destinations resolve for where-is asks', () => {
  const cases = [
    ['where is office approvals', 'OfficeApprovals'],
    ['where can I find the library', 'Library'],
    ['where is my learning', 'MyLearning'],
    ['where do I submit mileage', 'SubmitHub'],
    ['where is admin update', 'CommunicationsHub'],
    ['where are escalations', 'EscalationsDesk']
  ];
  for (const [prompt, routeName] of cases) {
    const intent = matchProductLocationIntent({
      prompt,
      allowedToolNames: new Set(['navigateTo']),
      role: 'admin',
      allowedRouteNames: new Set([routeName])
    });
    assert.ok(intent, `expected hit for: ${prompt}`);
    assert.equal(intent.toolCalls?.[0]?.args?.routeName, routeName, prompt);
  }
});

test('Ask falls back to full APP_PAGES index for hubs not in curated list', () => {
  const intent = matchProductLocationIntent({
    prompt: 'where is receivables',
    allowedToolNames: new Set(['navigateTo']),
    role: 'admin',
    allowedRouteNames: new Set()
  });
  assert.ok(intent, 'expected receivables hit from APP_PAGES');
  assert.match(String(intent.assistantText || ''), /Receivables/i);
  assert.equal(intent.uiCommands?.[0]?.type, 'navigate');
  assert.match(String(intent.uiCommands?.[0]?.to || ''), /receivables/i);
});
