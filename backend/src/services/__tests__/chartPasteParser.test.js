import { expect, it } from 'vitest';
import { parseChartInsurance, parseChartContacts, parsePatientComments, parsePayerInformation, parseBillingComments } from '../chartPasteParser.service.js';

it('reads the TherapyNotes insurance layout including policyholder, copay, and historical eligibility', () => {
  const parsed = parseChartInsurance(`Insurance
Example Health Options (43324): Primary
Policy Information
Copay
$20.00
Member ID
SYNTHETIC123
Eligibility
Last checked on January 3, 2025 at 2:29 PM
Policy Holder: Child of
Name
Pat Example
Administrative Sex
Female
Address
100 Example Dr.
Colorado Springs, CO 80920
Phone Number
(555) 985-7766
Verify Eligibility`);
  expect(parsed.primary).toMatchObject({ insurerName: 'Example Health Options', payerId: '43324', memberId: 'SYNTHETIC123', copay: '$20.00', relationshipToSubscriber: 'child', subscriberName: 'Pat Example', subscriberSex: 'F', subscriberAddressLine1: '100 Example Dr.', subscriberCity: 'Colorado Springs', subscriberState: 'CO', subscriberPostalCode: '80920', subscriberPhone: '(555) 985-7766' });
  expect(parsed.primary.lastEligibilityCheck).toBe('Last checked on January 3, 2025 at 2:29 PM');
});
it('separates primary and secondary insurance, preserving leading zero IDs', () => {
  const value = parseChartInsurance('Example A (00050): Primary\nMember ID\nAAA\nExample B (00900): Secondary\nMember ID\nBBB');
  expect(value.primary).toMatchObject({ insurerName:'Example A', payerId:'00050', memberId:'AAA' });
  expect(value.secondary).toMatchObject({ insurerName:'Example B', payerId:'00900', memberId:'BBB' });
});
it('reads glued browser contact labels and splits names at edit boundaries', () => {
  const values = parseChartContacts(`Contacts
+ New Contact
svgEdit
Alex Example
Mobile Phone(555) 985-7536Emailalex@example.comAddress
USA
Contact TypeEmergency ContactRelationshipFatherROI SignedNot signed by patient/guardianAppt RemindersNo Reminders
svgEdit
Pat Example
CompanyExample ElementaryMobile Phone(555) 985-7766Emailpat@example.comAddress
100 Example Dr.
Colorado Springs 80920 USA
RelationshipMotherROI SignedNot signed by patient/guardianAppt RemindersNo Reminders`);
  expect(values).toHaveLength(2);
  expect(values[0]).toMatchObject({ fullName:'Alex Example', mobilePhone:'(555) 985-7536', email:'alex@example.com', contactType:'Emergency Contact', relationshipType:'Father', roiSigned:'Not signed by patient/guardian', appointmentReminders:'No Reminders' });
  expect(values[1]).toMatchObject({ fullName:'Pat Example', company:'Example Elementary', mobilePhone:'(555) 985-7766', email:'pat@example.com', relationshipType:'Mother', address:'100 Example Dr.\nColorado Springs 80920 USA' });
});
it('retains every contact field, separate phone numbers, and multiline comments', () => {
  const value = parseChartContacts('first\nAlex\nmiddle\nLee\nlast\nExample\nsuffix\nJr.\nTitle\nDr.\nCompany\nExample Clinic\nContact Type\nPrimary Care Physician\nRelationship\nPhysician\nROI Signed\n1/2/2025\nDate of Birth\n5/6/1980\nAppt Reminders\nNo Reminders\nComments\nCall after work\nSecond comment line\nMobile Phone\n555-111-2222\nWork Phone\n555-111-3333\nHome Phone\n555-111-4444\nFax\n555-111-5555\nEmail\nalex@example.com\nAddress 1\n100 Example St.\nAddress 2\nSuite 2\nCountry\nUSA\nZip Code\n80920\nCity/State\nColorado Springs, CO\nTime Zone\nAmerica/Denver\nSave New Patient Contact\nCancel\nConvert to Practice Contact')[0];
  expect(value).toMatchObject({ fullName:'Alex Lee Example Jr.', firstName:'Alex', middleName:'Lee', lastName:'Example', suffix:'Jr.', title:'Dr.', company:'Example Clinic', contactType:'Primary Care Physician', relationshipType:'Physician', dateOfBirth:'1980-05-06', roiSigned:'1/2/2025', comments:'Call after work\nSecond comment line', mobilePhone:'555-111-2222', workPhone:'555-111-3333', homePhone:'555-111-4444', fax:'555-111-5555', email:'alex@example.com', address1:'100 Example St.', address2:'Suite 2', country:'USA', zip:'80920', cityState:'Colorado Springs, CO', timezone:'America/Denver' });
});
it('supports a copied tabular contact list', () => {
  expect(parseChartContacts('Name\tCompany\tWork Phone\tMobile Phone\nAlex Example\tClinic\t555-111-2222\t555-111-3333')[0]).toMatchObject({ fullName:'Alex Example', company:'Clinic', workPhone:'555-111-2222', mobilePhone:'555-111-3333' });
});
it('removes source controls while preserving comments verbatim', () => {
  expect(parsePatientComments('Patient Comments\nsvgEdit\nOffice Client\nDocs on new\nReach out after payment')).toBe('Office Client\nDocs on new\nReach out after payment');
  expect(parseBillingComments('Billing Comments\n$300 deductible, insurance email sent on -HI')).toBe('$300 deductible, insurance email sent on -HI');
});
it('reads payer information without treating a duplicate-ID notice as payer data', () => {
  expect(parsePayerInformation('Payer Information\nsvgEdit\nPayer Name\nBlue Cross Blue Shield of Colorado\nNetwork\nIn-Network\nBilling Method\nDefault Practice Billing Setting (Electronic)\nInsurance Type\nBlue Cross/Blue Shield\nPayer ID\n00050\nsvg\nThis Payer ID is already in use for this practice.\nAddress\nP.O. Box 10191\nNewark, NJ 07101')).toEqual({ payerName:'Blue Cross Blue Shield of Colorado', network:'In-Network', billingMethod:'Default Practice Billing Setting (Electronic)', insuranceType:'Blue Cross/Blue Shield', sourcePayerId:'00050', address:'P.O. Box 10191\nNewark, NJ 07101' });
});
it('rejects labels-only or unreadable policies and unnamed contacts', () => {
  expect(() => parseChartInsurance('Insurance\nPolicy Information\nCopay\nMember ID')).toThrow();
  expect(() => parseChartContacts('Mobile Phone\n555-111-2222')).toThrow();
});
it('reads policy group and a separately printed Self policyholder from one insurance paste', () => {
  expect(parseChartInsurance('[Example Health (43324)](https://example.test/payer): Primary\nPolicy Information\nCopay\n$20.00\nMember ID\nTEST123\nPolicy Group\n47110-004\nPolicy Holder\nSelf\nEligibility\nNot verified.').primary)
    .toMatchObject({ insurerName:'Example Health', payerId:'43324', memberId:'TEST123', groupNumber:'47110-004', relationshipToSubscriber:'self', lastEligibilityCheck:'Not verified.' });
});
it('routes unlabelled coverage to its selected slot and refuses a conflicting source heading', () => {
  expect(parseChartInsurance('Insurance carrier\nExample Secondary\nMember ID\nSECOND', { position:'secondary' })).toMatchObject({ secondary:{ insurerName:'Example Secondary', memberId:'SECOND' } });
  expect(() => parseChartInsurance('Example (43324): Primary\nMember ID\nPRIMARY', { position:'secondary' })).toThrow('labeled primary');
});
it('accepts copied contact cards with heading names, joined labels, age suffixes and SMS/email reminders',()=>{
 const contacts=parseChartContacts(`Contacts
+ New Contact
svg Edit
### Dr. Morgan Lee Example
Mobile Phone(303) 555-0101Email[morgan@example.test](mailto:morgan@example.test)Address
12 Sample Blvd
Denver, CO 80207 USA
Time Zone
MT - Mountain Time, UTC-7 with DST
Contact TypeEmergency ContactRelationshipStepmotherROI SignedNot signed by patient/guardianDate of Birth
3/20/1980Age: 46y, 7m, 28d
Appt RemindersNo Reminders
svgEdit
### Pat Jo Example
Mobile Phone(720) 555-0102Email[pat@example.test](mailto:pat@example.test)Address
22 Sample Loop
Colorado Springs, CO 80927 USA
Time Zone
MT - Mountain Time, UTC-7 with DST
Contact TypeGuardianRelationshipMotherROI SignedNot signed by patient/guardianDate of Birth
9/16/1986Age: 40y, 2m, 1d
Appt RemindersText (SMS) and Email`);
 expect(contacts).toHaveLength(2);expect(contacts[0]).toMatchObject({fullName:'Dr. Morgan Lee Example',relationshipType:'Stepmother',dateOfBirth:'1980-03-20'});
 expect(contacts[1]).toMatchObject({fullName:'Pat Jo Example',contactType:'Guardian',relationshipType:'Mother',email:'pat@example.test',dateOfBirth:'1986-09-16',appointmentReminders:'Text (SMS) and Email'});
});
it('excludes copied contact activity receipts from the actual contact name',()=>{
 expect(parseChartContacts('Contacts\n+ New Contact\nsvgEdit\nPrimary Parent was added as a Patient Contact. Primary Parent\nMobile Phone(720) 555-0102Emailparent@example.test\nRelationshipMother')[0]).toMatchObject({fullName:'Primary Parent',email:'parent@example.test',relationshipType:'Mother'});
});
it('keeps each parent’s relationship attached to their own card without edit icons',()=>{
 const contacts=parseChartContacts('Contacts\nPrimary Parent\nMobile Phone(303) 555-0101Emailprimary@example.test\nRelationshipMotherROI SignedNot signed\nAppt RemindersNo Reminders\nSecond Parent\nMobile Phone(303) 555-0101Emailsecond@example.test\nRelationshipFatherROI SignedNot signed\nAppt RemindersNo Reminders');
 expect(contacts).toHaveLength(2);expect(contacts[0]).toMatchObject({fullName:'Primary Parent',relationshipType:'Mother',email:'primary@example.test'});expect(contacts[1]).toMatchObject({fullName:'Second Parent',relationshipType:'Father',email:'second@example.test'});
});
it('does not include insurance-card controls in a copied payer ID',()=>{
 const policy=parseChartInsurance('Insurance carrier\nColorado Community Health Alliance\nPayer ID\nCOCHA Show Insurance Card\nMember ID\nSYNTHETIC').primary;
 expect(policy.payerId).toBe('COCHA');expect(policy.memberId).toBe('SYNTHETIC');
});
