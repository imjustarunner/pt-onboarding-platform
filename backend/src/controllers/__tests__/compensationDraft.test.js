import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({admin:vi.fn(),list:vi.fn(),get:vi.fn(),save:vi.fn(),options:vi.fn(),create:vi.fn()}));
vi.mock('../../services/providerUpdate.service.js',()=>({assertAgencyAdmin:m.admin}));
vi.mock('../../services/compensationDraft.service.js',()=>({listCompensationDrafts:m.list,getCompensationDraft:m.get,saveCompensationDraft:m.save}));
vi.mock('../../services/employeeCompensationDraft.service.js',()=>({employeeCompensationDraftOptions:m.options,createEmployeeCompensationDraft:m.create}));
import * as controller from '../compensationDraft.controller.js';
let req,res,next;
beforeEach(()=>{vi.clearAllMocks();req={user:{id:5,role:'admin'},params:{draftId:'8'},query:{agencyId:2},body:{agencyId:2}};res={set:vi.fn(),json:vi.fn(),status:vi.fn().mockReturnThis()};next=vi.fn();});
it.each(['list','get','save','options','create'])('rejects non-admin %s before accessing pay data',async name=>{m.admin.mockRejectedValueOnce(Object.assign(new Error('Forbidden'),{status:403}));await controller[name](req,res,next);expect(m[name]).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));});
it('uses the authorized agency and authenticated editor for saves',async()=>{m.admin.mockResolvedValue(2);m.save.mockResolvedValue({id:8});await controller.save(req,res,next);expect(m.save).toHaveBeenCalledWith(2,8,req.body,5);expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');});

it('does not extend the provider-update support role to compensation records',async()=>{req.user.role='support';m.admin.mockResolvedValue(2);await controller.list(req,res,next);expect(m.admin).not.toHaveBeenCalled();expect(m.list).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));});
it.each([false,true])('creates or reopens only for the authorized agency and authenticated actor (reused %s)',async reused=>{m.admin.mockResolvedValue(453);m.create.mockResolvedValue({id:8,reused});req.body={agencyId:453,userId:1496,pushId:30,countersignerUserId:1435,effectiveDate:'2026-11-13',initialAgreement:true};await controller.create(req,res,next);expect(m.create).toHaveBeenCalledWith(453,req.body,5);expect(res.status).toHaveBeenCalledWith(reused?200:201);expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');});
