import { expect, it } from 'vitest';
import { invoiceAgreementHeld, invoiceAgreementLocation, invoiceSnapshot } from '../invoiceAgreementDisplay.js';
const id='60ab85c4-d937-4c0f-845a-3f306dba58a2';
it('recognizes unsigned signature holds from frozen invoice JSON',()=>{
  const inv={line_items_json:JSON.stringify({businessAgreement:{requiresSignatures:true,ready:false,signedOn:''}})};
  expect(invoiceAgreementHeld(inv)).toBe(true);expect(invoiceAgreementHeld({line_items_json:{businessAgreement:{requiresSignatures:true,ready:true,signedOn:'2026-11-05'}}})).toBe(false);
  expect(invoiceAgreementHeld({line_items_json:{}})).toBe(false);expect(invoiceSnapshot({line_items_json:'invalid'})).toBe(null);
});
it('builds an exact local agreement link only for a UUID document and valid tenant',()=>{
  const inv={agency_id:7001,line_items_json:{businessAgreement:{contractReference:id}}};
  expect(invoiceAgreementLocation(inv,'sample-coach')).toEqual({path:'/sample-coach/admin/organization-agreements',query:{agencyId:'7001',document:id}});
  for(const value of ['https://outside.example',`javascript:alert(1)`,'Ordinary reference'])expect(invoiceAgreementLocation({...inv,line_items_json:{businessAgreement:{contractReference:value}}},'sample-coach')).toBe(null);
});
