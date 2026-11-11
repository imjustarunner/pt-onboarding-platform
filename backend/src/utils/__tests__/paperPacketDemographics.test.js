import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPaperPacketDemographics,
  paperPacketDemographicFill
} from '../paperPacketDemographics.util.js';

const NEXT_LINE = `
INTAKE QUESTIONNAIRE
Dependent's Name
Jordan Lee
Dependent's Date of Birth
03/14/2015
Dependent's Age
11
Dependent's Sex
Male
Dependent's Grade
5
Dependent's Address
123 Main St
Dependent's City
Colorado Springs
State
CO
Zip Code
80919
Your name
Alex Lee
Your phone number
(719) 555-0101
Your email address
alex@example.com
History of physical abuse Yes
`;

test('extractPaperPacketDemographics reads next-line packet answers', () => {
  const parsed = extractPaperPacketDemographics(NEXT_LINE);
  assert.equal(parsed.fullName, 'Jordan Lee');
  assert.equal(parsed.dateOfBirth, '2015-03-14');
  assert.equal(parsed.administrativeSex, 'Male');
  assert.equal(parsed.grade, '5');
  assert.equal(parsed.addressStreet, '123 Main St');
  assert.equal(parsed.addressCity, 'Colorado Springs');
  assert.equal(parsed.addressState, 'CO');
  assert.equal(parsed.addressZip, '80919');
  assert.equal(parsed.guardianName, 'Alex Lee');
  assert.match(parsed.contactPhone, /719/);
  assert.equal(parsed.email, 'alex@example.com');
});

test('extractPaperPacketDemographics reads same-line packet answers', () => {
  const parsed = extractPaperPacketDemographics(`
Dependent's Name Jordan Q Lee
Dependent's Date of Birth 7/17/2014 Dependent's Age 12
Dependent's Sex Female
Dependent's Grade 4th
`);
  assert.equal(parsed.fullName, 'Jordan Q Lee');
  assert.equal(parsed.dateOfBirth, '2014-07-17');
  assert.equal(parsed.administrativeSex, 'Female');
  assert.equal(parsed.grade, '4th');
});

test('extractPaperPacketDemographics reads the same registration questions as the online packet', () => {
  const parsed = extractPaperPacketDemographics(`
Dependent's Name
Jordan Lee
Dependent's Date of Birth
03/14/2015
Are you the legal parent or custodian of the above-named minor? X Yes ___ No
I have a legal right to obtain treatment for the above-named minor: ___ Yes ___ No
Your name
Alex Lee
Your phone number
(719) 555-0101
Your email address
alex@example.com
Other parent/guardian name, phone, and email
Sam Lee (719) 555-0199 sam@example.com
Primary Insurance
Medicaid
Policy Holder
Alex Lee
Member ID #
ABC123
Policy Group
G-9
Secondary Insurance
None
History of physical abuse _______ Yes _______ No
`);
  assert.equal(parsed.fullName, 'Jordan Lee');
  assert.equal(parsed.legalCustodian, 'yes');
  assert.equal(parsed.legalRightToTreat, null);
  assert.equal(parsed.guardianName, 'Alex Lee');
  assert.equal(parsed.otherGuardianName, 'Sam Lee');
  assert.match(parsed.otherGuardianPhone, /555-0199/);
  assert.equal(parsed.otherGuardianEmail, 'sam@example.com');
  assert.equal(parsed.primaryInsurance, 'Medicaid');
  assert.equal(parsed.policyHolder, 'Alex Lee');
  assert.equal(parsed.memberId, 'ABC123');
  assert.equal(parsed.policyGroup, 'G-9');
  assert.equal(parsed.secondaryInsurance, null);
});

test('paperPacketDemographicFill writes only empty client fields', () => {
  const patch = paperPacketDemographicFill(
    { full_name: 'Kept Name', date_of_birth: null, contact_phone: '', grade: '' },
    { fullName: 'Packet Name', dateOfBirth: '2015-03-14', contactPhone: '(719) 555-0101', grade: '5' }
  );
  assert.equal(patch.full_name, undefined);
  assert.equal(patch.date_of_birth, '2015-03-14');
  assert.equal(patch.contact_phone, '(719) 555-0101');
  assert.equal(patch.grade, '5');
});


test('reads only the DOB attached to a wrapped current-packet label',()=>{
 const parsed=extractPaperPacketDemographics("Dependent’s Date of\nBirth\n03/12/2016\nDependent's\nGrade\n5\nSIGN HERE — REQUIRED\n11/09/2026");
 assert.equal(parsed.dateOfBirth,'2016-03-12');assert.equal(parsed.grade,'5');
});
