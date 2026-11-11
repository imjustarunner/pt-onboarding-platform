import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({main:vi.fn(),clinical:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../demographicsImport.service.js',()=>({clientHasDemographicsOnFile:()=>true}));
vi.mock('../paperPacketDemographics.service.js',()=>({readPaperPacketDemographicCandidate:()=>null}));
vi.mock('../paperPacketVision.service.js',()=>({getLatestPaperPacketVisionEval:vi.fn(),schedulePaperPacketVisionEval:vi.fn()}));
import {loadChartSetupStatus} from '../chartSetupStatus.service.js';
const client={id:2271,agency_id:450,client_type:'clinical',source:'manual'};
beforeEach(()=>{vi.clearAllMocks();m.main.mockResolvedValue([[]]);m.clinical.mockResolvedValue([[]]);});
it('keeps enrollment placeholder plans missing just like the clinical Records view',async()=>{
 m.clinical.mockResolvedValue([[{id:52,title:'Intake Treatment Plan — fictional'}]]);
 const s=await loadChartSetupStatus({client});expect(s.planOnFile).toBe(false);expect(s.setupComplete).toBe(false);
});
it('counts an actual active clinician plan even with a newer automatic placeholder',async()=>{
 m.clinical.mockResolvedValue([[{id:52,title:'Intake Treatment Plan'},{id:51,title:'Individual plan'}]]);m.main.mockResolvedValue([[{id:5}]]);
 const s=await loadChartSetupStatus({client});expect(s.planOnFile).toBe(true);expect(s.intakeOnFile).toBe(true);expect(s.setupComplete).toBe(true);
 expect(m.clinical).toHaveBeenCalledWith(expect.stringContaining("p.status = 'active'"),[450,2271]);
});
it('does not invent completed care for an empty chart',async()=>{const s=await loadChartSetupStatus({client});expect(s.planOnFile).toBe(false);expect(s.intakeOnFile).toBe(false);});
