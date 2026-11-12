import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn(),create:vi.fn()}));
vi.mock('../../services/learningGuardianInvitations.service.js',()=>({listLearningGuardianInvitations:m.list,createLearningGuardianInvitation:m.create}));
import * as controller from '../learningGuardianInvitation.controller.js';
let req,res,next;
beforeEach(()=>{vi.clearAllMocks();req={user:{id:1759,role:'client_guardian'},params:{clientId:'2545'},query:{agencyId:'453'},body:{agencyId:453,userId:1435,clientId:2547}};res={set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();});
it('uses authenticated identity and exact selected route child, not caller-provided actors',async()=>{
 m.create.mockResolvedValue({reused:false,deliveryStatus:'sent'});await controller.create(req,res,next);
 expect(m.create).toHaveBeenCalledWith({userId:1759,clientId:2545,agencyId:453,input:req.body});expect(res.status).toHaveBeenCalledWith(201);expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
it.each(['preview','staff'])('rejects %s before reading or sending invitations',async type=>{
 if(type==='preview')req.guardianPreviewMode=true;else req.user.role='staff';
 await controller.list(req,res,next);await controller.create(req,res,next);
 expect(m.list).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
});
it('returns reused attempts without another created status',async()=>{
 m.create.mockResolvedValue({reused:true,deliveryStatus:'sending'});await controller.create(req,res,next);expect(res.status).toHaveBeenCalledWith(200);
});
