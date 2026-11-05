import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBusinessAgreementDrafts, BUSINESS_BAA_REFERENCE } from '../businessManagementAgreements.js';

const pricing={monthlyManagementCents:30000,managementListCents:37500,managedSetupCents:17940,revenueShareBps:1000,managedDiscountBps:2000};
const input=()=>({practice:{operatingName:'Example Independent Practice',representativeName:'Avery Owner'},operator:{operatingName:'Example Management Company',representativeName:'Morgan Manager'},signers:[{accountId:42,name:'Morgan Manager',capacity:'Manager representative'},{accountId:43,name:'Avery Owner',capacity:'Owner'}],invoiceReference:'Example agency invoice #88',affiliatedClinicalOrganizationName:'Example Clinical Practice',pricing:{...pricing}});

test('business proposals use supplied parties and managed pricing without charging unselected incorporation',()=>{
  const {baa,management}=makeBusinessAgreementDrafts(input());
  assert.match(management.body,/\$375\.00 per month/);
  assert.match(management.body,/\$300\.00 per month/);
  assert.match(management.body,/above \$3,000\.00/);
  assert.match(management.body,/not their sum/);
  assert.match(management.body,/must not be charged again/);
  assert.match(management.body,/Incorporation is not selected/);
  assert.match(management.terms,/optional managed setup price \$179\.40/);
  assert.match(management.terms,/Example agency invoice #88/);
  assert.match(management.terms,/represented by Avery Owner/);
  assert.match(management.terms,/represented by Morgan Manager/);
  for(const draft of [baa,management]) {
    assert.equal(draft.status,'draft');
    assert.deepEqual(draft.signatures,[]);
    assert.equal(draft.approvedBy,null);
    assert.deepEqual(draft.signers.map(s=>s.accountId),['42','43']);
    assert.equal(draft.parties.practice.address,'');
    assert.equal(draft.parties.practice.hipaaRole,'');
    assert.deepEqual(draft.branding,{practice:'Example Independent Practice',operator:'Example Management Company'});
  }
  assert.match(baa.body,/does not itself establish HIPAA covered-entity status/);
  assert.match(baa.body,/does not transfer Example Clinical Practice records/);
  assert.ok(baa.terms.includes(BUSINESS_BAA_REFERENCE));
});

test('pricing must be supplied and must reconcile to the selected managed-company discount',()=>{
  assert.throws(()=>makeBusinessAgreementDrafts(),/nonnegative/);
  assert.throws(()=>makeBusinessAgreementDrafts({...input(),pricing:{...pricing,monthlyManagementCents:37500}}),/discount/);
  assert.throws(()=>makeBusinessAgreementDrafts({...input(),pricing:{...pricing,monthlyManagementCents:-1}}),/nonnegative/);
  assert.throws(()=>makeBusinessAgreementDrafts({...input(),pricing:{...pricing,revenueShareBps:0}}),/revenue rate/);
  const changed=makeBusinessAgreementDrafts({...input(),pricing:{...pricing,managedDiscountBps:1000,monthlyManagementCents:33750}});
  assert.match(changed.management.body,/discount of 10%/);
});

test('unspecified business identities stay generic until the author supplies them',()=>{
  const {baa,management}=makeBusinessAgreementDrafts({pricing});
  assert.deepEqual(baa.branding,{practice:'Independent Practice',operator:'Management Services Provider'});
  assert.match(management.terms,/designated Organization representative/);
  assert.match(management.terms,/designated Manager representative/);
});
