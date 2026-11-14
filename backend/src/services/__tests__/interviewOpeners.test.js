import { expect, it } from 'vitest';
import { buildInterviewFlow, interviewTemplateWithOpeners, pickRandom } from '../interviewHub.service.js';

it('randomizes a complete opener cycle before repeating and avoids the last choice across cycles', () => {
  const pool = ['Cycle A', 'Cycle B', 'Cycle C', 'Cycle D'];
  const cycle = pool.map(() => pickRandom(pool));
  expect(new Set(cycle).size).toBe(4);
  expect(pickRandom(pool)).not.toBe(cycle.at(-1));
});
it('regenerates both openers while retaining an existing guide on reconnect', () => {
  const template = { salutation_pool_json: ['Hello A', 'Hello B'], icebreaker_pool_json: ['Ice A', 'Ice B'] };
  const previousFlow = buildInterviewFlow({ template });
  const next = buildInterviewFlow({ template, previousFlow });
  expect(next.salutation).not.toBe(previousFlow.salutation);
  expect(next.icebreaker).not.toBe(previousFlow.icebreaker);
  expect(buildInterviewFlow({ template, previousFlow, regenerateSalutation: false, regenerateIcebreaker: false })).toBe(previousFlow);
});
it('supplies usable button pools when a template has empty pools', () => {
  const template = interviewTemplateWithOpeners({ salutation_pool_json: [' ', null], icebreaker_pool_json: [] });
  expect(template.salutation_pool_json.length).toBeGreaterThan(1);
  expect(template.icebreaker_pool_json.length).toBeGreaterThan(1);
});
