import {beforeEach, expect, it, vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),tx:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),authorize:vi.fn(),push:vi.fn(),bundle:vi.fn(),claim:vi.fn(),summary:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.tx,beginTransaction:m.beginTransaction,commit:m.commit,rollback:m.rollback,release:m.release})}}));
vi.mock('../providerUpdate.service.js',()=>({assertAgencyAdmin:m.authorize,getPush:m.push,getRecipientBundle:m.bundle}));
vi.mock('../providerUpdateTime.service.js',()=>({createUpdateTimeClaim:m.claim,updateTimeSummary:m.summary}));
import {completeProviderUpdateAdministratively as complete,handbookCompletionEligibility} from '../providerUpdateAdministrativeCompletion.service.js';
const options={recipientId:31,agencyId:2,pushId:5,actorUserId:501,reason:'Handbook review UI blocked completion.'};
const recipient={id:31,agency_id:2,push_id:5,provider_user_id:7,token:'real-link',active_seconds:123};
let progress;
beforeEach(()=>{
 vi.resetAllMocks(); progress=[{section_key:'handbook',completed:0,data_json:{digestId:1}},{section_key:'pin',completed:1}];
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT id,role')?[[{id:501,role:'super_admin'}]]:[[recipient]]);
 m.push.mockResolvedValue({id:5,agency_id:2,status:'sent',title:'October update'});
 m.bundle.mockResolvedValue({sections:[{key:'handbook',completed:false},{key:'pin',completed:true}]});
 m.tx.mockImplementation(async sql=>sql.startsWith('SELECT * FROM provider_update_recipients')?[[recipient]]:sql.startsWith('SELECT * FROM provider_update_section_progress')?[progress]:[{affectedRows:1}]);
 m.summary.mockResolvedValue({sections:{handbook:23,pin:100}});
});
it('allows only the final handbook blocker or a fully completed update',()=>{
 expect(handbookCompletionEligibility([{key:'handbook',completed:false},{key:'pin',completed:true}]).eligible).toBe(true);
 expect(handbookCompletionEligibility([{key:'pin',completed:true}]).eligible).toBe(true);
 expect(handbookCompletionEligibility([]).eligible).toBe(false);
 expect(handbookCompletionEligibility([{key:'handbook',completed:false},{key:'pin',completed:false}]).eligible).toBe(false);
});
it('performs no writes during the dry run',async()=>{
 expect(await complete(options)).toMatchObject({eligible:true,changed:false});
 expect(m.bundle).toHaveBeenCalledWith(expect.objectContaining({previewOnly:true}));
 expect(m.beginTransaction).not.toHaveBeenCalled();
});
it('preserves real requirements that were reopened by live validation',async()=>{
 m.bundle.mockResolvedValue({sections:[{key:'handbook',completed:false},{key:'amendments',completed:false}]});
 expect(await complete({...options,apply:true})).toMatchObject({eligible:false,changed:false});
 expect(m.beginTransaction).not.toHaveBeenCalled();
});
it('records an admin waiver and completion atomically without inventing a provider acknowledgement or time',async()=>{
 expect(await complete({...options,apply:true})).toMatchObject({changed:true,handbookRequirementWaived:true});
 const handbook=m.tx.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO provider_update_section_progress'));
 const data=JSON.parse(handbook[1][2]);expect(data.digestId).toBe(1);expect(data.handbookAcknowledged).toBeUndefined();expect(data.administrativeCompletion.actorUserId).toBe(501);
 expect(m.tx).toHaveBeenCalledWith(expect.stringContaining("finalized_by_actor_type='admin'"),expect.any(Array));
 expect(m.tx).toHaveBeenCalledWith(expect.stringContaining("'admin_completion'"),expect.any(Array));
 expect(m.claim).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({active_seconds:123}),501);
 expect(m.commit).toHaveBeenCalledOnce();
});
it('finalizes already complete sections without changing their attestation',async()=>{
 m.bundle.mockResolvedValue({sections:[{key:'handbook',completed:true},{key:'pin',completed:true}]});progress[0].completed=1;
 expect(await complete({...options,apply:true})).toMatchObject({changed:true,handbookRequirementWaived:false});
 expect(m.tx.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO provider_update_section_progress'))).toBe(false);
});
it('rolls back a concurrent change or a time claim failure',async()=>{
 progress[1].completed=0;
 await expect(complete({...options,apply:true})).rejects.toMatchObject({status:409});expect(m.commit).not.toHaveBeenCalled();
 progress[1].completed=1;m.claim.mockRejectedValue(Error('claim failed'));
 await expect(complete({...options,apply:true})).rejects.toThrow('claim failed');expect(m.rollback).toHaveBeenCalledTimes(2);expect(m.commit).not.toHaveBeenCalled();
});
it('does not create another claim on a retry',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT id,role')?[[{id:501,role:'super_admin'}]]:[[{...recipient,finalized_at:new Date(),locked_at:new Date()}]]);
 expect(await complete({...options,apply:true})).toMatchObject({changed:false,reason:'already_locked'});expect(m.claim).not.toHaveBeenCalled();
});
it('rejects another agency, a preview, or an unauthorized actor',async()=>{
 m.push.mockResolvedValue({agency_id:3,status:'sent',title:'Other'});await expect(complete(options)).rejects.toMatchObject({status:409});
 m.push.mockResolvedValue({agency_id:2,status:'sent',title:'[PREVIEW] Test'});await expect(complete(options)).rejects.toMatchObject({status:409});
 m.authorize.mockRejectedValue(Object.assign(Error('Access denied'),{status:403}));await expect(complete(options)).rejects.toMatchObject({status:403});expect(m.beginTransaction).not.toHaveBeenCalled();
});
