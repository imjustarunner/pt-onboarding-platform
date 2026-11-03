import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportExchangeSummary } from '../supportExchangeSummary.js';
test('support keeps matching inputs without clinical narrative or nested schedule notes',()=>{
  const summary={demographics:{ageBand:'10'},diagnoses:['private diagnosis'],presentingProblems:['private note excerpt'],presentingProblemSource:'Treatment plan',
    preferences:{insurance:'Example plan',modality:'in_person',additionalPresentingProblems:['private narrative'],schedule:{days:['Monday'],timezone:'America/Denver',notes:'private clinical excerpt'}}};
  const result=supportExchangeSummary(summary);
  assert.equal(result.preferences.insurance,'Example plan');assert.deepEqual(result.preferences.schedule.days,['Monday']);assert.deepEqual(result.demographics,{ageBand:'10'});
  assert.equal(JSON.stringify(result).includes('private'),false);assert.deepEqual(result.diagnoses,[]);assert.deepEqual(result.presentingProblems,[]);
});

test('shows deliberately prepared matching details while preserving source narrative privacy',()=>{
 const result=supportExchangeSummary({presentingProblems:['private intake excerpt'],diagnoses:['private diagnosis'],preferences:{sharedMatchingConcern:'Stress management',sharedSchedulingNotes:'After work',schedule:{days:['Monday'],notes:'private source note'}}});
 assert.deepEqual(result.presentingProblems,['Stress management']);assert.equal(result.preferences.schedule.notes,'After work');assert.equal(JSON.stringify(result).includes('private'),false);
});
test('marks withheld schedule notes so an unrelated edit can preserve them',()=>{
 const result=supportExchangeSummary({preferences:{schedule:{days:['Monday'],notes:'private source note'}}});
 assert.equal(result.preferences.scheduleNotesRestricted,true);assert.equal(Object.hasOwn(result.preferences.schedule,'notes'),false);
});
