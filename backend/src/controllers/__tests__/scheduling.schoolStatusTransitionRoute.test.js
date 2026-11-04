import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),updateStatus:vi.fn(),update:vi.fn(),history:vi.fn(),statusId:vi.fn(),queue:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.find,updateStatus:m.updateStatus,update:m.update}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:async()=>[{id:2}]}}));
vi.mock('../../models/ClientStatusHistory.model.js',()=>({default:{create:m.history}}));
vi.mock('../../utils/clientStatusCatalog.js',()=>({getClientStatusIdByKey:m.statusId}));
vi.mock('../../services/schoolClientStatusEmail.service.js',()=>({queueSchoolClientStatusEmails:m.queue}));
import {updateClientStatus} from '../client.controller.js';
let req,res,next;
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.find.mockResolvedValue({id:1,agency_id:2,client_status_id:10});m.updateStatus.mockResolvedValue({id:1,status:'ACTIVE'});m.update.mockResolvedValue({id:1});m.statusId.mockResolvedValue(11);m.history.mockResolvedValue({id:91});req={params:{id:'1'},user:{id:555,role:'staff'},body:{status:'ACTIVE',statusChangeId:999},headers:{},get:()=>null};res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();});
it('binds the legacy ACTIVE route notice to newly persisted server history, never a supplied event ID',async()=>{
 await updateClientStatus(req,res,next);expect(next).not.toHaveBeenCalled();expect(m.history).toHaveBeenCalledWith(expect.objectContaining({from_value:'10',to_value:'11',changed_by_user_id:555}));
 expect(m.queue).toHaveBeenCalledWith(expect.anything(),{clientId:1,actorUserId:555,statusChangeId:91});
});
it('does not queue another activation for an unchanged status save or unauthorized agency',async()=>{
 m.find.mockResolvedValue({id:1,agency_id:2,client_status_id:11});await updateClientStatus(req,res,next);expect(m.history).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();
 m.find.mockResolvedValue({id:1,agency_id:9,client_status_id:10});await updateClientStatus(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(m.queue).not.toHaveBeenCalled();
});
