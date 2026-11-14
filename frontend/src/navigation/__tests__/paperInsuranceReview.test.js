import {it,expect} from 'vitest';
import {paperCoverageFromCandidate,insuranceSubscriberIssues,matchConfiguredPayer} from '../paperInsuranceReview.js';
const patient={firstName:'Jordan',lastName:'Example',dateOfBirth:'2023-09-20'};
it('retains both written holders and distinct IDs while preparing the child’s Medicaid identity',()=>{
 const coverage=paperCoverageFromCandidate({primaryInsurance:'CHAMPVA',policyHolder:'Taylor Example',memberId:'PRIMARY-TEST',secondaryInsurance:'Colorado Medicaid',secondaryHolder:'Morgan Example',secondaryMemberId:'A123456'},patient);
 expect(coverage.primary).toMatchObject({memberId:'PRIMARY-TEST',subscriberFirstName:'Taylor',subscriberLastName:'Example',paperSubscriberName:'Taylor Example'});
 expect(coverage.secondary).toMatchObject({memberId:'A123456',subscriberFirstName:'Jordan',subscriberLastName:'Example',subscriberDob:'2023-09-20',relationshipToSubscriber:'self',paperSubscriberName:'Morgan Example'});
});
it('flags Medicaid assigned to another subscriber without flagging commercial dependent coverage',()=>{
 const policy={insurerName:'Colorado Medicaid',relationshipToSubscriber:'child',subscriberFirstName:'Morgan',subscriberLastName:'Example'};
 expect(insuranceSubscriberIssues(policy,patient)).toHaveLength(1);expect(insuranceSubscriberIssues({...policy,insurerName:'Commercial'},patient)).toEqual([]);
 expect(insuranceSubscriberIssues({...policy,relationshipToSubscriber:'self',subscriberFirstName:'Jordan',subscriberDob:'2023-09-20'},patient)).toEqual([]);
});
it('matches only unique configured names and does not disguise a conflicting saved route',()=>{
 const payers=[{id:13,name:'CHAMPVA - HAC',names:['CHAMPVA'],payerId:'84146'}];
 expect(matchConfiguredPayer({insurerName:'CHAMPVA'},payers)?.id).toBe(13);
 expect(matchConfiguredPayer({insurerName:'Champ',payerId:'COCHA'},payers)).toBe(null);
});
