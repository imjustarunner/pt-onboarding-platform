import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:mocks}));
vi.mock('../../services/chatEncryption.service.js',()=>({isChatEncryptionConfigured:()=>false}));
import Queue from '../NoteAidWorkQueueItem.model.js';
beforeEach(()=>vi.restoreAllMocks());
it('leaves existing started work and its draft untouched',async()=>{
 const existing={serverId:8,status:'started',draftId:99};
 vi.spyOn(Queue,'findByClientKeyForUser').mockResolvedValue(existing);
 const insert=vi.spyOn(Queue,'insertRow'),update=vi.spyOn(Queue,'updateRow');
 expect(await Queue.createIfMissingForUser(501,{clientKey:'booked_session_214',status:'not_started'})).toBeNull();
 expect(insert).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
});
it('does not duplicate tasks or creation audits after a concurrent insert',async()=>{
 const existing={serverId:8,status:'signed'};
 vi.spyOn(Queue,'findByClientKeyForUser').mockResolvedValueOnce(null).mockResolvedValue(existing);
 vi.spyOn(Queue,'insertRow').mockRejectedValue(Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'}));
 expect(await Queue.createIfMissingForUser(501,{clientKey:'booked_session_214'})).toBeNull();
});
it('preserves appointment identity, timezone and addon codes through encrypted-payload serialization',async()=>{
 vi.spyOn(Queue,'findByClientKeyForUser').mockResolvedValue(null);
 const insert=vi.spyOn(Queue,'insertRow').mockImplementation(async vals=>{
  mocks.execute.mockResolvedValue([[{id:8,user_id:501,client_key:vals.clientKey,clinical_session_id:214,payload_enc:vals.payloadEnc,status:vals.status}]]);
  return Queue.findByIdForUser({id:8,userId:501});
 });
 const saved=await Queue.createIfMissingForUser(501,{clientKey:'booked_session_214',appointmentId:132,sourceTimezone:'America/Denver',addonServiceCodes:['90785']});
 expect(saved).toMatchObject({appointmentId:132,sourceTimezone:'America/Denver',addonServiceCodes:['90785']});
 expect(insert).toHaveBeenCalledOnce();
});
