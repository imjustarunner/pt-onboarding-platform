import {expect,it,vi} from 'vitest';
import {createDayCancellationContactFollowup,missingDayCancellationContacts} from '../dayCancellationContactFollowup.service.js';

const plan=()=>({providerId:7,date:'2026-11-04',dates:['2026-11-04'],facts:{providerAuthored:true},items:[
  {key:'school_roster:2:7:2026-11-04:8:4',kind:'school_roster',agencyId:2,date:'2026-11-04',clients:[{clientId:8,clientName:'Alice Example',clientInitials:'AE',mode:'client',recipients:[{email:''}]}]},
  {key:'school_roster:2:7:2026-11-04:9:4',kind:'school_roster',agencyId:2,date:'2026-11-04',clients:[{clientId:9,clientName:'Bob Example',clientInitials:'BE',mode:'guardian',recipients:[]}]},
  {key:'school_roster:2:7:2026-11-04:10:4',kind:'school_roster',agencyId:2,date:'2026-11-04',clients:[{clientId:10,clientName:'Carol Example',clientInitials:'CE',mode:'guardian',recipients:[{email:'parent@example.test'}]}]}
]});
const results=p=>Object.fromEntries(p.items.map(item=>[item.key,{status:'completed',notificationDelivery:{sent:item.clients[0].clientId===10?1:0,skipped:1}}]));

it('emails support and the provider an initials-only contact-gap list after completion, carrying signed-review proof',async()=>{
  const p=plan(),sender=vi.fn(async()=>({senderIdentityId:3,providerEmail:'provider@itsco.health',supportEmail:'support@itsco.health',cc:['support@itsco.health'],replyToOverride:'provider@itsco.health'})),send=vi.fn(async()=>({id:'accepted',communicationId:88}));
  const notify=createDayCancellationContactFollowup({sender,send});
  expect(await notify({token:'signed-review-token',plan:p,results:results(p),agencyId:2,actorUserId:7})).toMatchObject({status:'sent',count:2,communicationId:88});
  const email=send.mock.calls[0][0];
  expect(email).toMatchObject({to:'support@itsco.health, provider@itsco.health',cc:null,templateType:'day_cancellation_contact_followup',reviewedCancellationToken:'signed-review-token',reviewedCancellationItemKey:p.items[0].key});
  expect(email.text).toContain('AE — 2026-11-04: No email on the selected authorized contact.');
  expect(email.text).toContain('BE — 2026-11-04: No authorized email contact selected or linked.');
  expect(email.text).not.toMatch(/Alice|Bob|Carol|parent@example/);
});

it('scopes contact gaps to completed clients in the owning agency and does not mail when none exist',async()=>{
  const p=plan(),r=results(p);r[p.items[0].key].status='failed';
  expect(missingDayCancellationContacts(p,r,88)).toEqual([]);
  expect(missingDayCancellationContacts(p,r,2).map(client=>client.initials)).toEqual(['BE']);
  const send=vi.fn(),sender=vi.fn();
  const result=await createDayCancellationContactFollowup({sender,send})({token:'review',plan:{...p,items:[p.items[2]]},results:r,agencyId:2,actorUserId:7});
  expect(result).toEqual({status:'not_needed',count:0});expect(sender).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});

it('records held summary delivery without claiming it sent or retrying transport internally',async()=>{
  const p=plan(),send=vi.fn(async()=>({skipped:true,reason:'review_required'}));
  const notify=createDayCancellationContactFollowup({sender:async()=>({senderIdentityId:3,providerEmail:'provider@example.test',supportEmail:'support@example.test'}),send});
  expect(await notify({token:'review',plan:p,results:results(p),agencyId:2,actorUserId:7})).toMatchObject({status:'held',count:2,message:'review_required'});
  expect(send).toHaveBeenCalledOnce();
});

it('distinguishes a saved but restricted guardian email from an absent eligible email without exposing contact data',()=>{
  const p=plan();
  p.items[0].clients[0].contactIssue='A guardian email is saved, but its link is not currently eligible for notifications. Verify the relationship and contact permissions.';
  const missing=missingDayCancellationContacts(p,results(p),2);
  expect(missing[0].reason).toContain('not currently eligible');
  expect(missing[1].reason).toContain('No authorized email contact');
  expect(JSON.stringify(missing)).not.toContain('Alice Example');
});
