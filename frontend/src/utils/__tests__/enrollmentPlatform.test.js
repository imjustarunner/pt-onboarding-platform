import {describe,it,expect} from 'vitest';
import {enrollmentPlatform} from '../enrollmentPlatform';
describe('Enrollment product identity',()=>{
 it('uses the declared enrollment product over office branding',()=>{
  expect(enrollmentPlatform({enrollmentProduct:'schoolcarebridge',officeProduct:'auricwell'}).name).toBe('SchoolCareBridge');
  expect(enrollmentPlatform({officeProduct:'auricwell'}).name).toBe('AuricWell');
 });
 it('does not imply an EHR subscription for independent or unresolved agencies',()=>{
  expect(enrollmentPlatform({officeProduct:'tenant'})).toBeNull();expect(enrollmentPlatform(null)).toBeNull();
 });
});
