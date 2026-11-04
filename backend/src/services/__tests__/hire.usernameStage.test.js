import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),update:vi.fn(),suggest:vi.fn(),provision:vi.fn(),journey:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.find,updateStatus:m.update}}));
vi.mock('../hireGroupAccount.service.js',()=>({isGroupPasswordHireMode:()=>true,suggestHireWorkEmails:m.suggest,provisionHireGroupUsername:m.provision}));
vi.mock('../hireJourney.service.js',()=>({getJourney:m.journey,journeyTasks:vi.fn(),taskProgress:vi.fn(),completeOnboarding:vi.fn(),recordOnboardingActivity:vi.fn()}));
import {getPortalAccountSuggestions,provisionPortalAccount} from '../../controllers/prehirePortal.controller.js';
let user;
beforeEach(()=>{
 vi.clearAllMocks();user={id:8,status:'PREHIRE_OPEN'};m.find.mockImplementation(async()=>user);
 m.execute.mockResolvedValue([[{id:2}]]);m.suggest.mockResolvedValue({domain:'itsco.health',suggestions:[{email:'candidate@itsco.health'}]});
 m.provision.mockResolvedValue({workEmail:'candidate@itsco.health'});m.journey.mockResolvedValue({});
});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
it.each(['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING'])('offers a username and delegates only username provisioning during %s',async status=>{
 user.status=status;const res=response(),next=vi.fn(),req={portalUser:{id:8,status},body:{workEmail:'candidate@itsco.health'}};
 await getPortalAccountSuggestions(req,res,next);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({enabled:true}));
 await provisionPortalAccount(req,res,next);expect(next).not.toHaveBeenCalled();expect(m.provision).toHaveBeenCalledWith({user,agency:{id:2},workEmail:'candidate@itsco.health'});
 expect(m.update.mock.calls.some(([,target])=>target==='ACTIVE_EMPLOYEE')).toBe(false);
});
it('rejects username provisioning after the current user leaves the hire process despite a stale portal status',async()=>{
 user.status='ACTIVE_EMPLOYEE';const res=response();await provisionPortalAccount({portalUser:{id:8,status:'PREHIRE_OPEN'},body:{}},res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(m.provision).not.toHaveBeenCalled();
});
it('does not reopen Group provisioning after onboarding was submitted',async()=>{
 user.status='ONBOARDING';m.journey.mockResolvedValue({onboardingCompletedAt:'2026-10-01'});const res=response();
 await provisionPortalAccount({portalUser:{id:8,status:'ONBOARDING'},body:{}},res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(409);expect(m.provision).not.toHaveBeenCalled();
});
