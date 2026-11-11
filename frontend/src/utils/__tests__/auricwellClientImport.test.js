import { expect, it } from 'vitest';
import { contactMatches, parseAdditionalContacts, parseInsurancePaste, splitDemographicsContacts } from '../auricwellClientImport.js';

it('keeps additional contact phones and names out of patient demographics parsing', () => {
  const split = splitDemographicsContacts('Legal Name\nAnn Example\nAdditional Contacts\nName: Pat Example\nPhone: 555-111-2222');
  expect(split.demographics).toBe('Legal Name\nAnn Example');
  expect(parseAdditionalContacts(split.contacts).contacts).toEqual([{ fullName:'Pat Example', phone:'555-111-2222' }]);
});
it('parses multiple labeled contacts and warns about lines needing manual review', () => {
  const result = parseAdditionalContacts('Name\nPat Example\nRelationship\nMother\nPhone\n555-111-2222\nName: Sam Example\nEmail: sam@example.com\nUnrecognized detail');
  expect(result.contacts).toEqual([{fullName:'Pat Example',relationshipType:'Mother',phone:'555-111-2222'},{fullName:'Sam Example',email:'sam@example.com'}]);
  expect(result.warnings).toHaveLength(1);
});
it('parses a copied contact table and a tab-separated label/value block', () => {
  expect(parseAdditionalContacts('Name\tRelationship\tPhone\tEmail\nPat Example\tParent\t555-111-2222\tpat@example.com').contacts).toEqual([{fullName:'Pat Example',relationshipType:'Parent',phone:'555-111-2222',email:'pat@example.com'}]);
  expect(parseAdditionalContacts('Name\tPat Example\nPhone\t555-111-2222').contacts[0].fullName).toBe('Pat Example');
});
it('separates primary and secondary insurance and normalizes source dates for review', () => {
  const result = parseInsurancePaste('Primary Insurance: Carrier A\nMember ID: AAA\nSubscriber Name: Pat Example\nSubscriber DOB: 5/6/1980\nRelationship to Subscriber: Child\nSecondary Insurance\nPayer: Carrier B\nMember ID\nBBB\nSubscriber Date of Birth\n1981-07-08');
  expect(result.primary).toMatchObject({insurerName:'Carrier A',memberId:'AAA',subscriberFirstName:'Pat',subscriberLastName:'Example',subscriberDob:'1980-05-06',relationshipToSubscriber:'child'});
  expect(result.secondary).toMatchObject({insurerName:'Carrier B',memberId:'BBB',subscriberDob:'1981-07-08'});
  expect(result.warnings).toEqual([]);
});
it('warns about unrecognized insurance text rather than claiming it was imported', () => {
  const result = parseInsurancePaste('Some unlabelled billing history\nMember ID: AAA\nUnexpected extra field: value');
  expect(result.primary).toEqual({memberId:'AAA'});
  expect(result.warnings).toHaveLength(1);
});
it('exposes ambiguous contact identity matches for an explicit review choice', () => {
  const items=[{contact:{id:1,fullName:'Pat Example',email:'pat@example.com'}},{contact:{id:2,fullName:'Pat Example',phone:'+1 555 111 2222'}}];
  expect(contactMatches({fullName:'Pat Example',email:'pat@example.com',phone:'555-111-2222'},items)).toHaveLength(2);
});
