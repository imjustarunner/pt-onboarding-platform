import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),insurance:vi.fn(),billingLink:vi.fn(),requireClient:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:m.insurance}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:value=>JSON.stringify(value),decryptFamilyBilling:value=>value?JSON.parse(value):null}));
vi.mock('../familyBillingPolicy.service.js',async original=>({...await original(),requireBillingLink:m.billingLink}));
vi.mock('../familyLedger/policy.js',()=>({transaction:async fn=>fn({execute:m.execute}),requireClient:m.requireClient,cents:value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(new Error('Invalid amount'),{status:400});return n;},dateOnly:value=>value}));
import {normalizeResponsibleParty,saveResponsibleParty,proposeResponsibleBillingContact,pendingResponsibleBillingContact,guardianResponsibleParty,saveClientServiceRate} from '../clientBillingAccount.service.js';
import {snapshotServiceTerms} from '../familyLedger/serviceRates.js';
const contact={fullName:'Synthetic Other',email:'other@example.test',phone:'3035550100',address:'1 Sample St',city:'Denver',state:'CO',postalCode:'80202'};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.includes('FROM agency_medical_service_codes')?[[{id:7}]]:[[]]);m.insurance.mockResolvedValue(null);m.billingLink.mockResolvedValue({});});
it('requires a complete contact for an outside responsible party and one valid mailbox',()=>{expect(normalizeResponsibleParty({kind:'other',contact})).toMatchObject({kind:'other',userId:null,contact});for(const key of Object.keys(contact))expect(()=>normalizeResponsibleParty({kind:'other',contact:{...contact,[key]:''}})).toThrow();expect(()=>normalizeResponsibleParty({kind:'other',contact:{...contact,email:'one@example.test,two@example.test'}})).toThrow();});
it('rejects selecting an account not linked to this client before writing billing responsibility',async()=>{await expect(saveResponsibleParty({agencyId:2,clientId:8,party:{kind:'account',userId:99},revision:0,actorUserId:5})).rejects.toMatchObject({status:400});expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);});
it('uses the linked account’s own identity/contact and appends an event attributed to the actual actor',async()=>{m.execute.mockImplementation(async sql=>sql.includes('SELECT u.first_name')?[[{first_name:'Actual',last_name:'Payer',email:'actual@example.test',phone:'3035550101',address:'2 Saved St',city:'Denver',state:'CO',postalCode:'80203'}]]:[[]]);await saveResponsibleParty({agencyId:2,clientId:8,party:{kind:'account',userId:10,contact:{email:'spoof@example.test'}},actorUserId:5});const saved=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_billing_responsibility_profiles'));expect(JSON.parse(saved[1][4])).toMatchObject({email:'actual@example.test',fullName:'Actual Payer',address:'2 Saved St'});const event=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_billing_account_events'));expect(event[1].slice(0,4)).toEqual([2,8,5,'responsible_party_selected']);});
it('requires current portal billing authority and prevents a guardian selecting someone else’s linked account',async()=>{await expect(guardianResponsibleParty({userId:10,agencyId:2,clientId:8,party:{kind:'account',userId:11}})).rejects.toMatchObject({status:403});m.billingLink.mockRejectedValue(Object.assign(new Error('Revoked'),{status:403}));await expect(guardianResponsibleParty({userId:10,agencyId:2,clientId:8,party:{kind:'other',contact}})).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();});
it('refuses Medicaid self-pay overrides and conflicting revisions',async()=>{m.insurance.mockResolvedValue({secondary:{isMedicaid:true}});await expect(saveClientServiceRate({agencyId:2,clientId:8,code:'90837',amountCents:8000,priceBasis:'visit',reason:'Agreed',actorUserId:5})).rejects.toMatchObject({status:409});m.insurance.mockResolvedValue(null);m.execute.mockImplementation(async sql=>sql.startsWith('SELECT revision FROM client_patient_service_rates')?[[{revision:2}]]:sql.includes('FROM agency_medical_service_codes')?[[{id:7}]]:[[]]);await expect(saveClientServiceRate({agencyId:2,clientId:8,code:'90837',amountCents:8000,priceBasis:'visit',reason:'Agreed',revision:1,actorUserId:5})).rejects.toMatchObject({status:409});});
it('uses an explicit client override for signed self-pay terms instead of the agency default',async()=>{m.execute.mockImplementation(async sql=>sql.includes('FROM agency_patient_service_rates')?[[{serviceCode:'90837',amountCents:15000,priceBasis:'visit',revision:1}]]:sql.includes('FROM client_patient_service_rates')?[[{serviceCode:'90837',amountCents:7500,priceBasis:'visit',revision:4}]]:[[]]);const input={agencyId:2,clientIds:[8],serviceTerms:[{clientId:8,serviceCode:'90837',paymentBasis:'self_pay',rateRevision:4,effectiveFrom:'2026-11-01',effectiveThrough:'2026-12-01',evidence:'Agreed client rate'}]};const [term]=await snapshotServiceTerms(input,{execute:m.execute});expect(term).toMatchObject({amountCents:7500,totalCents:7500,rateRevision:4});m.execute.mockImplementation(async sql=>sql.includes('FROM agency_patient_service_rates')?[[{serviceCode:'90837',amountCents:15000,priceBasis:'visit',revision:1}]]:[[]]);await expect(snapshotServiceTerms(input,{execute:m.execute})).rejects.toMatchObject({status:409});});

it('records a zero rate through the configured pro bono service',async()=>{
  const rate={agencyId:2,clientId:8,code:'PRO-BONO SERVICE',amountCents:0,priceBasis:'visit',reason:'Agreed',actorUserId:5};
  await expect(saveClientServiceRate(rate)).rejects.toMatchObject({status:400});
  m.execute.mockImplementation(async sql=>sql.includes('FROM tenant_services')?[[{code:'PRO-BONO SERVICE'}]]:[[]]);
  await expect(saveClientServiceRate(rate)).resolves.toMatchObject({serviceCode:'PRO-BONO SERVICE',amountCents:0});
});

it('submits a chart-bound contact for billing review and preserves the current payer and portal permissions', async () => {
  const input = { agencyId:2, clientId:8, affiliationId:12, actorUserId:5 };
  const contactRow = { client_id:8, agency_id:2, is_active:1, contact_is_active:1, contact_full_name:'Synthetic Payer', contact_email:'payer@example.test' };
  let latestEvent;
  m.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM client_contact_affiliations')) return [[contactRow]];
    if (sql.startsWith('INSERT INTO client_billing_account_events')) latestEvent = { action:params[3], evidence_encrypted:params[4] };
    if (sql.includes('SELECT action,evidence_encrypted')) return [[latestEvent]];
    return [[]];
  });
  const proposal = await proposeResponsibleBillingContact(input);
  expect(proposal).toMatchObject({ affiliationId:12, fullName:'Synthetic Payer' });
  expect(await pendingResponsibleBillingContact(2,8)).toEqual(proposal);
  expect(m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'))).toEqual([
    [expect.stringContaining('client_billing_account_events'), [2,8,5,'responsible_party_proposed',expect.any(String)]]
  ]);
  latestEvent.action = 'responsible_party_selected';
  expect(await pendingResponsibleBillingContact(2,8)).toBeNull();
  await expect(proposeResponsibleBillingContact({...input,clientId:9})).rejects.toMatchObject({status:404});
});
