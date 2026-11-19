import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),coach:vi.fn(),reports:vi.fn(),assessments:vi.fn(),threads:vi.fn()}));
vi.mock('../assessmentDeliverable.service.js',()=>({assertCoachCanAccessClient:m.coach,listForClient:m.reports,listClientAssessments:m.assessments}));
vi.mock('../chartCommunicationExport.service.js',()=>({ensureClientAccess:m.access,chartCommunicationThreads:m.threads}));
vi.mock('../clinicalRecordPdf.service.js',()=>({clinicalValueHtml:JSON.stringify}));
vi.mock('../communicationPrint.service.js',()=>({communicationPrintDocument:(_title,threads)=>JSON.stringify(threads)}));
import {collectRecordSupplement} from '../clinicalRecordSupplement.service.js';
const scope={user:{id:17,role:'provider'},agencyId:5,client:{id:14},inRange:date=>date==='2026-11-18'};
beforeEach(()=>{
 vi.clearAllMocks();
 m.access.mockResolvedValue({ok:true,client:{agency_id:5}});
 m.coach.mockResolvedValue(true);
 m.reports.mockResolvedValue([{id:3,updatedAt:'2026-11-18',htmlBody:'<h1>Report</h1>'}]);
 m.assessments.mockResolvedValue([{title:'Assessment',completedAt:'2026-11-18'}]);
 m.threads.mockResolvedValue([{id:6,messages:[{body:'Included',sent_at:'2026-11-18'},{body:'Earlier',sent_at:'2026-11-17'}]}]);
});
it('exports authorized reports and single-client conversations in the selected date range',async()=>{
 const result=await collectRecordSupplement(scope);
 expect(m.threads).toHaveBeenCalledWith(14,17,{singleClientOnly:true});
 expect(result.pages.map(p=>p.name)).toEqual(['assessment-history.pdf','assessment-report-3.pdf','chart-communications.pdf']);
 expect(result.pages[2].html).toContain('Included');
 expect(result.pages[2].html).not.toContain('Earlier');
});
it('preserves restrictions and excludes out-of-agency communications',async()=>{
 m.coach.mockRejectedValueOnce(Object.assign(new Error('restricted'),{status:403}));
 m.access.mockResolvedValueOnce({ok:true,client:{agency_id:9}});
 const result=await collectRecordSupplement(scope);
 expect(result.pages).toEqual([]);
 expect(result.manifest).toHaveLength(2);
 expect(m.reports).not.toHaveBeenCalled();
 expect(m.threads).not.toHaveBeenCalled();
});
