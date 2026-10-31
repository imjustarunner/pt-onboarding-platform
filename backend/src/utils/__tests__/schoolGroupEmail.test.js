import { expect, it } from 'vitest';
import { validSchoolGroupEmail, requireSchoolGroupEmail } from '../schoolGroupEmail.js';
it.each(['',null,'school@','school example.com','a@@example.com'])('requires a usable persisted group email at setup completion: %j', value => {
  expect(validSchoolGroupEmail(value)).toBe(false);
  expect(() => requireSchoolGroupEmail(value)).toThrow('school group email');
});
it('normalizes a configured school shared address without claiming membership or creating an email', () => {
  expect(requireSchoolGroupEmail(' School-Team@Example.org ')).toBe('school-team@example.org');
});
