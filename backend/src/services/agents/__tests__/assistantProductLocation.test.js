import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProductLocationQuery,
  looksLikeProductLocationAsk,
  resolveBestProductLocation,
  formatProductLocationAnswer
} from '../../../../../frontend/src/navigation/productLocationCatalog.js';
import {
  matchProductLocationIntent,
  resolveNavigateRouteNameFromPrompt
} from '../assistantCapabilityCatalog.service.js';
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
  assert.match(
    extractProductLocationQuery('where do staff see the events for schools'),
    /school events/
  );
  assert.match(
    extractProductLocationQuery('where can I find school events'),
    /school events/
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

test('resolveNavigateRouteNameFromPrompt prefers school events over program events', () => {
  assert.equal(
    resolveNavigateRouteNameFromPrompt('open school events'),
    'CaseloadHubEvents'
  );
  assert.equal(
    resolveNavigateRouteNameFromPrompt('open program events'),
    'SkillBuildersProgramsEvents'
  );
  assert.equal(
    resolveNavigateRouteNameFromPrompt('open upcoming events'),
    'SkillBuildersProgramsEvents'
  );
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
