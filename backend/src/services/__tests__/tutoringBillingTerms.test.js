import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {billingTermsForProfiles,resolveBillingTerms,recordBillingConsent,BILLING_TERMS_VERSION,TUTORING_BILLING_TERMS_VERSION,TUTORING_BILLING_TERMS} from '../familyBillingPolicy.service.js';
import {decryptFamilyBilling} from '../familyBillingEncryption.service.js';
beforeEach(()=>{vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,3).toString('base64'));vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_ID','v1');});
it('uses educational terms for pure learning and keeps clinical terms for a mixed family',()=>{
 expect(billingTermsForProfiles([{client_type:'learning'},{client_type:'tutoring'}]).termsVersion).toBe(TUTORING_BILLING_TERMS_VERSION);
 expect(TUTORING_BILLING_TERMS).not.toMatch(/insurance|copay|medicaid|patient/i);
 expect(billingTermsForProfiles([{client_type:'learning',has_clinical_service:1}]).termsVersion).toBe(BILLING_TERMS_VERSION);
 expect(billingTermsForProfiles([{client_type:'clinical'}]).termsVersion).toBe(BILLING_TERMS_VERSION);
});
it('ignores revoked or restricted links when choosing the authorized family context',async()=>{
 const db={execute:vi.fn(async()=>[[{client_type:'learning',access_enabled:1},{client_type:'clinical',access_enabled:0},{client_type:'clinical',access_enabled:1,permissions_json:{learningOnly:true}}]])};
 expect((await resolveBillingTerms({userId:1759,agencyId:453},db)).termsVersion).toBe(TUTORING_BILLING_TERMS_VERSION);
 expect(db.execute.mock.calls[0][1]).toEqual([453,453,1759,453,453,null,null]);
});
it('rejects an old authorization version and appends the exact educational terms when accepted',async()=>{
 const db={execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[{client_type:'learning',access_enabled:1}]]:[{insertId:88}])};
 const input={userId:1759,agencyId:453,clientId:2545,purpose:'recurring',consent:{accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Morgan QA'}};
 await expect(recordBillingConsent(input,db)).rejects.toMatchObject({status:400});
 input.consent.version=TUTORING_BILLING_TERMS_VERSION;
 expect(await recordBillingConsent(input,db)).toBe(88);
 const inserts=db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT'));
 expect(inserts).toHaveLength(1);
 expect(inserts[0][1][6]).toBe(TUTORING_BILLING_TERMS_VERSION);
 expect(decryptFamilyBilling(inserts[0][1][8],'consent:453:1759')).toMatchObject({terms:TUTORING_BILLING_TERMS,signatureName:'Morgan QA',frequency:'per agreed tutoring service'});
 expect(db.execute.mock.calls.some(([sql])=>/^(UPDATE|DELETE)/.test(sql))).toBe(false);
});
