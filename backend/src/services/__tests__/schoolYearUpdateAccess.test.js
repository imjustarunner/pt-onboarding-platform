import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),notify:vi.fn(),queue:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{}}));
vi.mock('../../utils/uploads.js',()=>({publicUploadsUrlFromStoredPath:v=>v}));
vi.mock('../schoolPortalEvents.service.js',()=>({listSchoolEventsForOrg:vi.fn(),schoolYearBounds:vi.fn()}));
vi.mock('../yearUpdateNotifications.service.js',()=>({notifySchoolCollaborativeYearUpdateCompleted:m.notify}));
vi.mock('../schoolYearUpdateAutomation.service.js',()=>({queueAnnualCompletionReceipt:m.queue}));
import {getAnnualAccess,assertAnnualWrite,updateAnnualFollowup,canManageAnnualUpdate} from '../schoolYearUpdateAccess.service.js';
import {upsertSectionProgress,finalizeCycle,getOrCreateCycle,resolveTokenCycle} from '../schoolReinit.service.js';
let school,cycle,extension,campaign;
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-22T18:00:00Z'));
 school={id:5,name:'Example',slug:'example',organization_type:'school',is_active:1,is_archived:0,affiliated:1,created_at:'2026-01-16',first_affiliation_at:'2026-01-16'};
 cycle={id:7,agency_id:2,school_organization_id:5,school_year:'2026-27',status:'in_progress'};extension=null;campaign='pushed';
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM school_reinit_rules'))return [[{enabled:1,timezone:'America/Denver',opens_md:'08-01',due_md:'08-21',followup_md:'08-31'}]];
  if(sql.includes('FROM agencies s'))return [[school]];
  if(sql.includes('SELECT status FROM school_reinit_campaigns'))return [[{status:campaign}]];
  if(sql.includes('FROM school_reinit_followups'))return [extension?[{extension_until:extension,status:'open'}]:[]];
  if(sql.includes('SELECT * FROM school_reinit_cycles'))return [[cycle]];
  return [{affectedRows:1}];
 });
});
afterEach(()=>vi.useRealTimers());
it('limits schedule and follow-up controls to agency admin/support memberships',async()=>{
 expect(await canManageAnnualUpdate({id:1,role:'school_staff'},2)).toBe(false);
 expect(await canManageAnnualUpdate({id:1,role:'provider'},2)).toBe(false);
 m.execute.mockResolvedValue([[]]);expect(await canManageAnnualUpdate({id:1,role:'admin'},99)).toBe(false);
 m.execute.mockResolvedValue([[{allowed:1}]]);expect(await canManageAnnualUpdate({id:1,role:'support'},2)).toBe(true);
});
it('blocks stale open browser saves and finalization after the hard deadline',async()=>{
 await expect(upsertSectionProgress({cycleId:7,sectionKey:'materials',data:{},reviewed:true})).rejects.toThrow('window has closed');
 await expect(finalizeCycle({cycleId:7,actor:{}})).rejects.toThrow('window has closed');
 expect(m.execute.mock.calls.filter(([sql])=>/^UPDATE|^INSERT/.test(sql))).toEqual([]);expect(m.queue).not.toHaveBeenCalled();
});
it('prevents first-year schools from creating annual records or using old links',async()=>{
 school.first_onboarding_at='2026-09-01';
 await expect(getOrCreateCycle({agencyId:2,schoolOrganizationId:5,schoolYear:'2026-27'})).rejects.toThrow('onboarding only');
 await expect(assertAnnualWrite(cycle)).rejects.toThrow('first school year');
});
it('allows the specific extended school while enforcing campaign disable',async()=>{
 extension='2026-10-29';expect((await getAnnualAccess({agencyId:2,schoolOrganizationId:5,schoolYear:'2026-27',cycle})).canWrite).toBe(true);
 campaign='disabled';await expect(assertAnnualWrite(cycle)).rejects.toThrow('not available');
});
it('never turns an old shared link into a new year record',async()=>{
 const result=await resolveTokenCycle({cycle_id:7,school_year:'2025-26',cycle_status:'in_progress'});expect(result.id).toBe(7);
 expect(m.execute.mock.calls.filter(([sql])=>/^UPDATE|^INSERT/.test(sql))).toEqual([]);
});
it('requires a reason and bounded extension without marking a cycle finalized',async()=>{
 await expect(updateAnnualFollowup({cycle,input:{action:'extend',extensionUntil:'2027-03-01',note:'Contacted school'},userId:507})).rejects.toThrow('30 days');
 await expect(updateAnnualFollowup({cycle,input:{action:'waive',note:''},userId:507})).rejects.toThrow('note');
 expect(m.execute.mock.calls.filter(([sql])=>/^UPDATE school_reinit_cycles/.test(sql))).toEqual([]);
});
