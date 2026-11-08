import { describe, expect, it } from 'vitest';
import { requiresCaptchaForLink } from '../intakeCaptchaPolicy.js';

const qa = { id: 450, slug: 'auricwell-qa-demo', name: 'AuricWell QA Demo',
  feature_flags: { qaSandbox: { syntheticOnly: true } } };
const required = { RECAPTCHA_REQUIRED_FOR_ALL: 'true' };

describe('public intake CAPTCHA policy', () => {
  it('exempts QA office and affiliated school forms even with the global requirement', () => {
    expect(requiresCaptchaForLink(qa, qa, required)).toBe(false);
    expect(requiresCaptchaForLink({ id: 451, name: 'QA School' }, qa, required)).toBe(false);
    expect(requiresCaptchaForLink(qa, { ...qa, feature_flags: JSON.stringify(qa.feature_flags) }, required)).toBe(false);
  });

  it.each([
    { ...qa, id: 449 }, { ...qa, slug: 'another-agency' },
    { ...qa, feature_flags: {} }, { ...qa, feature_flags: '{invalid' },
    { ...qa, feature_flags: { qaSandbox: { syntheticOnly: false } } },
    { ...qa, feature_flags: { qaSandbox: { syntheticOnly: 'true' } } }, null
  ])('requires all three stored QA identity checks: %j', agency => {
    expect(requiresCaptchaForLink(qa, agency, required)).toBe(true);
  });

  it('does not exempt another agency because its school resembles QA', () => {
    expect(requiresCaptchaForLink(qa, { id: 1, name: 'Production' }, required)).toBe(true);
  });

  it('preserves named agency/school requirements and the unconfigured default', () => {
    const env = { RECAPTCHA_REQUIRED_ORG_NAMES: ' itsco, Protected School ' };
    expect(requiresCaptchaForLink(null, { id: 1, official_name: 'ITSCO Health' }, env)).toBe(true);
    expect(requiresCaptchaForLink({ name: 'Protected School District' }, { id: 1 }, env)).toBe(true);
    expect(requiresCaptchaForLink({ name: 'Another School' }, { id: 1 }, env)).toBe(false);
    expect(requiresCaptchaForLink(null, { id: 1 }, {})).toBe(false);
    expect(requiresCaptchaForLink(qa, qa, env)).toBe(false);
  });
});
