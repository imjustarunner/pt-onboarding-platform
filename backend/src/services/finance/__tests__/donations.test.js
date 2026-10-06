import {describe,it,expect,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {donationInput,assertDonationPayment,publicDonor,donationReceipt,recognitionVersion} from '../donationPolicy.js';
const input={amountCents:2500,name:'Example Donor',email:'donor@example.invalid',city:'Denver',region:'CO',publicRecognition:true,recognitionVersion,requestKey:'b2880a96-a0cd-4cdb-b3e2-de0362d1a880',receiptToken:'a'.repeat(64)};
const row={id:12,agency_id:434,stripe_account_id:'acct_donor',amount_cents:2500,refunded_cents:0,livemode:1,status:'paid',public_recognition:1,donor_name:'Example Donor',donor_email:'private@example.invalid',city:'Denver',region:'CO',issuer_json:{legalName:'MH4Kidz',ein:'00-0000000'},paid_at:'2026-10-05T18:00:00Z'};
const pi={id:'pi_gift',status:'succeeded',currency:'usd',amount:2500,amount_received:2500,livemode:true,metadata:{source:'mh4kidz_donation',agency_id:'434',donation_id:'12'}};
describe('donation policy',()=>{
 it('requires an explicit recognition choice and accepts anonymous gifts without location',()=>{
  expect(donationInput(input).publicRecognition).toBe(true);
  expect(donationInput({...input,publicRecognition:false,city:'',region:''}).publicRecognition).toBe(false);
  expect(()=>donationInput({...input,publicRecognition:undefined})).toThrow('recognition');
  expect(()=>donationInput({...input,city:''})).toThrow('city');
 });
 it.each([0,99,1000001,-1,2.5,NaN,Infinity])('rejects invalid gift amount %s',amountCents=>expect(()=>donationInput({...input,amountCents})).toThrow());
 it('rejects invalid email and newline header injection',()=>{expect(()=>donationInput({...input,email:'bad'})).toThrow();expect(()=>donationInput({...input,name:'X\nBcc: other@example.invalid'})).toThrow();});
 it('accepts only the expected successful payment on the owning live account',()=>{
  expect(()=>assertDonationPayment(row,pi,'acct_donor')).not.toThrow();
  for(const wrong of [{amount:2501},{amount_received:2000},{currency:'eur'},{status:'processing'},{livemode:false},{metadata:{...pi.metadata,agency_id:'2'}},{metadata:{...pi.metadata,donation_id:'13'}}])expect(()=>assertDonationPayment(row,{...pi,...wrong},'acct_donor')).toThrow();
  expect(()=>assertDonationPayment(row,pi,null)).toThrow();expect(()=>assertDonationPayment(row,pi,'acct_other')).toThrow();
 });
 it('excludes private, refunded, unpaid, and test donations and never publishes contact information',()=>{
  expect(publicDonor(row)).toEqual({name:'Example Donor',city:'Denver',region:'CO',amountCents:2500});
  for(const wrong of [{public_recognition:0},{status:'pending'},{status:'refunded',refunded_cents:2500},{livemode:0}])expect(publicDonor({...row,...wrong})).toBeNull();
  expect(publicDonor({...row,status:'partially_refunded',refunded_cents:1000}).amountCents).toBe(1500);
 });
 it('renders a tax-record acknowledgment from the issuer snapshot and reflects refunds safely',()=>{
  const receipt=donationReceipt({...row,donor_name:'<img src=x onerror=alert(1)>',refunded_cents:1000});
  expect(receipt.text).toContain('EIN: 00-0000000');expect(receipt.text).toContain('No goods or services');expect(receipt.text).toContain('Contribution remaining: $15.00');expect(receipt.text).toContain('replaces the earlier receipt');expect(receipt.html).toContain('&lt;img');expect(receipt.html).not.toContain('<img src=x');expect(receipt.text).not.toContain('private@example.invalid');
 });
});
