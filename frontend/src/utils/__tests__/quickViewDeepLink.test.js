import { expect, it } from 'vitest';
import { quickViewDeepLink } from '../quickViewDeepLink';
it('preserves exact conversation and invitation targets without carrying redirect URLs', () => {
  expect(quickViewDeepLink({ conversationId: '12', redirect: 'https://other.example' })).toEqual({ conversationId: '12' });
  expect(quickViewDeepLink({}, '/quick-view-join?type=supervision&id=15')).toEqual({ join: 'supervision', id: '15' });
  expect(quickViewDeepLink({ conversationId: '../12', join: 'javascript', id: '15' })).toEqual({});
});
