import { describe,it,expect,vi,beforeEach } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../utils/supervisorSchoolAccess.js',()=>({isSupervisorActor:vi.fn()}));
vi.mock('../officeClientSubmissions.service.js',()=>({readSubmissionAnswers:vi.fn(()=>({answers:{},skippedFormIds:[]}))}));
import pool from '../../config/database.js';
import {isSupervisorActor} from '../../utils/supervisorSchoolAccess.js';
import {readSubmissionAnswers} from '../officeClientSubmissions.service.js';
import {summarizeFeedback,readAccessibleFeedback} from '../officeFeedbackSummary.service.js';
const now=new Date('2026-09-30T12:00:00Z');
const visit=(date,connection,progress,extra={})=>({id:1,clientId:9,providerId:7,serviceType:'counseling',respondentType:'adult_self',scheduledStartAt:date,completedAt:date,score:{connection,progress},...extra});
beforeEach(()=>{vi.clearAllMocks();isSupervisorActor.mockResolvedValue(false);pool.execute.mockResolvedValue([[]]);});
describe('feedback history statistics',()=>{
 it('calculates independent averages and first-to-current six-week changes, including zero and regression',()=>{
 const rows=[visit('2026-07-01T12:00:00Z',1,10),visit('2026-08-19T12:00:00Z',6,8),visit('2026-09-15T12:00:00Z',7,null),visit('2026-09-30T12:00:00Z',8,5)];
 const [group]=summarizeFeedback(rows,now);expect(group.metrics.connection).toMatchObject({current:8,average:5.5,sixWeekAverage:7,change:2,count:4,sixWeekCount:3});expect(group.metrics.progress).toMatchObject({current:5,average:7.7,sixWeekAverage:6.5,change:-3,count:3});
 expect(summarizeFeedback([visit('2026-09-01',6,7),visit('2026-09-20',6,7)],now)[0].metrics.connection.change).toBe(0);
 });
 it('does not turn missing, skipped, future, or single-date responses into zero change',()=>{
 const rows=[visit('2026-09-01',0,null),visit('2026-09-01',0,null,{id:2}),visit('2026-10-01',10,10),visit('2026-09-29',10,10,{completedAt:null})];
 const [g]=summarizeFeedback(rows,now);expect(g.metrics.connection.current).toBe(0);expect(g.metrics.connection.change).toBeNull();expect(g.metrics.progress.average).toBeNull();
 });
 it('separates providers, clients, service, and respondent',()=>{
 const base=visit('2026-09-01',5,5);expect(summarizeFeedback([base,{...base,clientId:10},{...base,providerId:8},{...base,serviceType:'tutoring'},{...base,respondentType:'caregiver'}],now)).toHaveLength(5);
 });
 it('keeps stale latest scores dated but excludes them from the six-week window',()=>{
 const [g]=summarizeFeedback([visit('2026-07-01',8,7)],now);expect(g.metrics.connection).toMatchObject({current:8,sixWeekAverage:null,change:null,sixWeekCount:0});
 });
});
describe('feedback authorization before decryption',()=>{
 it('denies school staff and invalid scopes without reading answers',async()=>{
 await expect(readAccessibleFeedback({user:{id:3,role:'school_staff'},clientIds:[9]})).rejects.toMatchObject({status:403});
 await expect(readAccessibleFeedback({user:{id:3,role:'admin'},clientIds:[9],providerId:-1})).rejects.toMatchObject({status:400});expect(pool.execute).not.toHaveBeenCalled();expect(readSubmissionAnswers).not.toHaveBeenCalled();
 });
 it('limits providers to active agency and current caseload, even with a forged provider filter',async()=>{
 await readAccessibleFeedback({user:{id:7,role:'provider'},clientIds:[9],providerId:99});const [sql,params]=pool.execute.mock.calls[0];expect(sql).toContain('ua.is_active=1');expect(sql).toContain('ca.is_active=1');expect(sql).not.toContain('supervisor_assignments');expect(params).toEqual([9,7,7,99]);
 });
 it('adds only agency-scoped supervisee access for supervisors',async()=>{
 isSupervisorActor.mockResolvedValue(true);await readAccessibleFeedback({user:{id:3,role:'supervisor'},clientIds:[9]});const [sql,params]=pool.execute.mock.calls[0];expect(sql).toContain('sa.agency_id=s.agency_id');expect(sql).toContain('sa.supervisee_id=s.provider_id');expect(params).toEqual([9,3,3,3]);
 });
 it('keeps admins agency-scoped and reserves global access for super admins',async()=>{
 await readAccessibleFeedback({user:{id:3,role:'admin'},clientIds:[9]});expect(pool.execute.mock.calls[0][0]).toContain('ua.agency_id=s.agency_id');expect(pool.execute.mock.calls[0][1]).toEqual([9,3]);
 await readAccessibleFeedback({user:{id:3,role:'super_admin'},clientIds:[9]});expect(pool.execute.mock.calls[1][1]).toEqual([9]);
 });
});
