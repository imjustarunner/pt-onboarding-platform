import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeJoinLandingCopy } from '../adaptiveIntake.service.js';
describe('Join landing copy persistence', () => {
  it('retains intentionally cleared welcome copy and empty bullets after reading storage', () => {
    const result = mergeJoinLandingCopy('counseling', { name: 'Clinic', theme_settings: JSON.stringify({ joinLanding: { counseling: { welcomeTitle: '', welcomeGlad: '', quickBullets: [], fullBullets: [] } } }) }, { serviceType: 'counseling' });
    assert.equal(result.welcomeTitle, ''); assert.equal(result.welcomeGlad, ''); assert.deepEqual(result.quickBullets, []); assert.deepEqual(result.fullBullets, []);
  });
  it('keeps responsive design scoped to its service', () => {
    const design = { version: 1, views: { mobile: { copy: { welcomeTitle: 'Mobile tutoring' } } } };
    const agency = { name: 'Clinic', theme_settings: { joinLanding: { counseling: { welcomeTitle: 'Counseling' }, tutoring: { welcomeTitle: 'Tutoring', layout: { design } } } } };
    assert.deepEqual(mergeJoinLandingCopy('tutoring', agency, { serviceType: 'tutoring' }).layout.design, design);
    assert.equal(mergeJoinLandingCopy('counseling', agency, { serviceType: 'counseling' }).welcomeTitle, 'Counseling');
    assert.equal(mergeJoinLandingCopy('counseling', agency, { serviceType: 'counseling' }).layout, undefined);
  });
});
