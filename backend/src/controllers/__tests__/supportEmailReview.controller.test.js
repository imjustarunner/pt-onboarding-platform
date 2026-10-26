import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createSupportEmailReviewController } from '../supportEmailReview.controller.js';

it('authorizes before reading protected content and disables caching', async () => {
  const calls = [], output = {};
  const controller = createSupportEmailReviewController({
    authorize: async (user, agency) => { calls.push(['authorize', user.id, agency]); return { agencyId: agency }; },
    dailyReview: async (query) => { calls.push(['read', query.date]); return { rows: [] }; }
  });
  await controller.getDailyReview({ user: { id: 507 }, query: { agencyId: '2', date: '2026-10-26' } }, {
    set: (name, value) => { output[name] = value; }, json: (data) => { output.data = data; }
  }, (error) => { throw error; });
  assert.deepEqual(calls, [['authorize', 507, 2], ['read', '2026-10-26']]);
  assert.equal(output['Cache-Control'], 'private, no-store');
});

it('does not load content when authorization fails', async () => {
  let reads = 0, failure;
  const controller = createSupportEmailReviewController({ authorize: async () => { throw Object.assign(new Error('Denied'), { status: 403 }); }, dailyReview: async () => { reads += 1; } });
  await controller.getDailyReview({ user: { id: 559 }, query: { agencyId: 2 } }, {}, (error) => { failure = error; });
  assert.equal(failure.status, 403); assert.equal(reads, 0);
});

it('rejects an omitted agency instead of inferring broad access', async () => {
  let failure;
  await createSupportEmailReviewController({}).getDailyReview({ user: { id: 507 }, query: {} }, {}, (error) => { failure = error; });
  assert.equal(failure.status, 400);
});
