import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),search:vi.fn()}));
vi.mock('../../services/narrivaAccess.service.js',async original=>({...await original(),requireNarrivaAgency:m.access}));
vi.mock('../../services/clinicalDiagnosisSearch.service.js',()=>({searchClinicalDiagnoses:m.search}));
import {searchDiagnosisCatalog} from '../clinicalDiagnosisSearch.controller.js';
const response=()=>({set:vi.fn(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({});m.search.mockReturnValue({items:[]});});
it('requires clinical agency authorization before running a catalog search',async()=>{m.access.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));const next=vi.fn();await searchDiagnosisCatalog({user:{id:7},body:{agencyId:2,query:'gene'},query:{}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403,quiet:true}));expect(m.search).not.toHaveBeenCalled();});
it('uses the requested service-date edition and rejects malformed dates without dispatching',async()=>{const req={user:{id:7},body:{agencyId:2,query:'gene',dateOfService:'2026-11-09'},query:{}},res=response(),next=vi.fn();await searchDiagnosisCatalog(req,res,next);expect(m.search).toHaveBeenCalledWith('gene',{dateOfService:'2026-11-09'});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');m.search.mockClear();req.body.dateOfService='2026-02-30';await searchDiagnosisCatalog(req,res,next);expect(m.search).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:422,quiet:true}));});
