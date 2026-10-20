import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProviderUpdateLicenseExempt } from '../providerUpdateLicense.js';

test('bachelor-level facilitators and student interns do not need a license', () => {
  for (const user of [
    {credential:'BA',title:'Facilitator',role:'provider'},
    {credential:'BS',role:'provider_plus'},
    {credential:'MEd',title:'Intern',employment_type:'intern'},
    {credential:'BA',title:'Intern',role:'provider'},
    {role:'intern'}
  ]) assert.equal(isProviderUpdateLicenseExempt(user),true);
});
test('does not exempt actual licensed/candidate credentials or guess for unknown staff', () => {
  for (const user of [
    {credential:'MA, LPCC',title:'Intern'},
    {credential:'BA, RN'},
    {credential:'MSW, SWC'},
    {credential:'MA, LPC',title:'Student Training Mentor'},
    {}
  ]) assert.equal(isProviderUpdateLicenseExempt(user),false);
});
