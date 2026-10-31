import { describe,expect,it,vi } from 'vitest';
import { clientIds,repairQaPayerMailboxes } from '../repairAuricwellQaPayerMailboxes.mjs';
function harness() {
  const agency={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}};
  const clients=clientIds.map(id=>({id,insurance_type_id:null,primary_insurer_name:null,billing_insurance_payload:null}));
  const identities=[{id:1119,agency_id:450,from_email:'notifications@itsco.health',reply_to:'notifications@itsco.health',is_active:1},
    {id:1122,agency_id:450,from_email:'portal@auricwell.com',reply_to:'support@itsco.health',is_active:1}];
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),execute:vi.fn(async(sql,args=[])=>{
    if(sql.includes('FROM agencies'))return [[agency]];
    if(sql.includes('agency_self_pay_settings'))return [[{self_pay_only:1}]];
    if(sql.startsWith('SELECT id FROM clients'))return [clients.map(({id})=>({id}))];
    if(sql.includes('FROM clients c'))return [clients];
    if(sql.includes('FROM insurance_types'))return [[{id:88,label:'Self Pay',insurance_key:'self_pay'}]];
    if(sql.includes('FROM email_sender_identities'))return [identities];
    if(sql.startsWith('UPDATE clients')){Object.assign(clients.find(c=>c.id===args[2]),{primary_insurer_name:args[0],insurance_type_id:args[1],insurance_type_label:'Self Pay'});return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE email_sender_identities')){identities[0].reply_to='support@itsco.health';return [{affectedRows:1}];}
    throw new Error('Unexpected test SQL');
  })};return {db,agency,clients,identities};
}
describe('exact authorized synthetic payer and mailbox fixture repair',()=>{
  it('dry-runs all 23 scoped IDs without writes or private output',async()=>{
    const h=harness(),result=await repairQaPayerMailboxes(h.db);
    expect(result).toMatchObject({applied:false,clientCount:23,mailboxUpdate:true,sendsMessages:false,createsCharges:false});
    expect(h.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
    expect(h.db.rollback).toHaveBeenCalled();expect(h.db.commit).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/@|password|patient|insurer|phone/);
  });
  it('updates cash classification and the exact already-approved Reply-To idempotently',async()=>{
    const h=harness();expect((await repairQaPayerMailboxes(h.db,{apply:true})).clients.filter(c=>c.update)).toHaveLength(23);
    h.db.execute.mockClear();const result=await repairQaPayerMailboxes(h.db,{apply:true});
    expect(result.clients.some(c=>c.update)).toBe(false);expect(result.mailboxUpdate).toBe(false);
    expect(h.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
  });
  it('holds existing coverage instead of deleting or reinterpreting it',async()=>{
    const h=harness();h.clients[0].billing_insurance_payload='encrypted-insurance';h.clients[1].primary_insurer_name='Medicaid';
    const result=await repairQaPayerMailboxes(h.db,{apply:true});
    expect(result.clients.slice(0,2)).toEqual(clientIds.slice(0,2).map(id=>({id,from:'coverage_review',to:'coverage_review',update:false})));
    expect(h.clients[0].billing_insurance_payload).toBe('encrypted-insurance');expect(h.clients[1].primary_insurer_name).toBe('Medicaid');
  });
  it.each(['agency','slug','flags','roster','mailbox','support'])('refuses changed scope before any write: %s',async changed=>{
    const h=harness();
    if(changed==='agency')h.agency.id=2;if(changed==='slug')h.agency.slug='itsco';if(changed==='flags')h.agency.feature_flags={};
    if(changed==='roster')h.clients.push({id:9999});if(changed==='mailbox')h.identities[0].agency_id=2;if(changed==='support')h.identities[1].reply_to='elsewhere@example.org';
    await expect(repairQaPayerMailboxes(h.db,{apply:true})).rejects.toThrow('guard failed');
    expect(h.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(h.db.commit).not.toHaveBeenCalled();
  });
});
