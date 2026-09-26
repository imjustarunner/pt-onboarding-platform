import {it,expect,vi,afterEach} from 'vitest';
import {requestEnrollment} from '../claimMd.service.js';
afterEach(()=>vi.unstubAllGlobals());
it('prefills contact details and normalizes tax ID and ZIP+4 without submitting a signature',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,text:async()=>JSON.stringify({link:{url:'https://www.claim.md/enroll/test/'}})});vi.stubGlobal('fetch',fetch);
 await requestEnrollment({accountKey:'synthetic',payerId:'00050',enrollmentType:'1500',npi:'1234567893',contact:'Test Biller',contactEmail:'biller@example.test',practice:{name:'Test Group',tax_id:'12-3456789',postal_code:'80919-1234',phone_number:'5555550100'}});
 const body=fetch.mock.calls[0][1].body;
 expect(body.get('prov_taxid')).toBe('123456789');expect(body.get('prov_zip')).toBe('809191234');
 expect(body.get('contact_email')).toBe('biller@example.test');expect(body.get('contact_phone')).toBe('5555550100');
 expect(body.has('signature')).toBe(false);expect(body.get('payerid')).toBe('00050');
});
