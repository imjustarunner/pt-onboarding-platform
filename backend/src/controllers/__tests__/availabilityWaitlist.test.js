import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),read:vi.fn(),getAgencies:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../services/providerAgencyAvailability.service.js',()=>({saveAgencyAvailability:m.save,availabilityEditingContext:vi.fn()}));
vi.mock('../../services/providerServiceOfferings.service.js',()=>({readProviderServices:vi.fn(),saveProviderServices:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:m.getConnection}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.getAgencies}}));
vi.mock('../../models/Notification.model.js',()=>({default:{}}));
vi.mock('../../services/providerAvailabilityReminders.service.js',()=>({readProviderAvailabilitySettings:m.read,checkProviderAvailability:vi.fn(),readMyAvailabilityReminders:vi.fn()}));
import {enableWaitlist} from '../providerAvailabilitySettings.controller.js';
let req,res,next,db;
beforeEach(()=>{vi.clearAllMocks();db={execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(db);m.getAgencies.mockResolvedValue([{id:2}]);m.save.mockResolvedValue({});m.read.mockResolvedValue({preferences:{seesClients:true,acceptingNewClients:true,inPerson:true,virtual:true,school:true,scheduleAgencyId:2,waitlistEnabled:false,intakeStatusByFormat:{IN_PERSON:'accepting',VIRTUAL:'accepting',SCHOOL:'unavailable'}}});req={params:{providerId:'9'},body:{agencyId:2,format:'VIRTUAL'},query:{},user:{id:9,role:'provider'}};res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();});
it('enables only this format waitlist without changing the other format or agency',async()=>{
 await enableWaitlist(req,res,next);expect(next).not.toHaveBeenCalled();expect(m.save).toHaveBeenCalledWith(db,expect.objectContaining({providerId:9,agencyId:2,body:expect.objectContaining({acceptingNewClients:true,waitlistEnabled:true,applyToAll:false,intakeStatusByFormat:{IN_PERSON:'accepting',VIRTUAL:'waitlist',SCHOOL:'unavailable'}})}));expect(db.commit).toHaveBeenCalledOnce();expect(res.json).toHaveBeenCalledWith({ok:true,format:'VIRTUAL',status:'waitlist'});
});
it('does not allow another provider or an unauthorized agency',async()=>{
 req.user.id=11;await enableWaitlist(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(m.getConnection).not.toHaveBeenCalled();
 req.user.id=9;m.getAgencies.mockResolvedValue([{id:3}]);await enableWaitlist(req,res,next);expect(m.getConnection).not.toHaveBeenCalled();
});
it('rejects invalid formats without a write',async()=>{req.body.format='OTHER';await enableWaitlist(req,res,next);expect(res.status).toHaveBeenCalledWith(400);expect(m.getConnection).not.toHaveBeenCalled();});
it('rolls back a failed settings save',async()=>{m.save.mockRejectedValue(Error('write failed'));await enableWaitlist(req,res,next);expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'write failed'}));});
