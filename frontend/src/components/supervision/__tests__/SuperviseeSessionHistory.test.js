import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,expect,it,vi} from 'vitest';
import SuperviseeSessionHistory from '../SuperviseeSessionHistory.vue';
import {sessionAttendanceState,supervisionSessionCounts} from '../../../utils/superviseeSessionHistory.js';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
const rows=[{id:1,startAt:'2026-10-01T16:00:00Z',endAt:'2026-10-01T17:00:00Z',status:'FINALIZED',totalSeconds:0,supervisorName:'Demo Supervisor',summaryText:'## Full summary\n\nVisible without a scrolling field.'},{id:2,startAt:'2026-10-02T16:00:00Z',endAt:'2026-10-02T17:00:00Z',status:'FINALIZED',totalSeconds:0,attendanceCorrectionType:'MISSED',attendanceReason:'Did not attend after reminder.'},{id:3,startAt:'2026-10-03T16:00:00Z',endAt:'2026-10-03T17:00:00Z',status:'FINALIZED',totalSeconds:1800}];
const mountHistory=props=>mount(SuperviseeSessionHistory,{props:{agencyId:2,providerId:20,sessions:rows,...props},global:{stubs:{SupervisionRecordPanel:{template:'<div class="record-stub">Audited record</div>'}}}});
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{artifact:null}});});
it('does not infer missed from zero minutes and filters explicitly recorded outcomes',async()=>{const w=mountHistory();expect(w.findAll('.session-row')).toHaveLength(3);expect(sessionAttendanceState(rows[0])).toBe('unknown');expect(supervisionSessionCounts(rows)).toMatchObject({attended:1,missed:1,unknown:1});await w.findAll('select')[0].setValue('missed');expect(w.findAll('.session-row')).toHaveLength(1);expect(w.text()).toContain('Missed supervision');w.unmount();});
it('renders full summary by default and blocks unsafe transcript links and HTML',async()=>{const w=mountHistory({sessions:[{...rows[0],summaryText:'## Summary\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\nReadable summary',transcriptText:'Complete transcript',transcriptUrl:'javascript:alert(1)'}]});await w.find('.session-toggle').trigger('click');await flushPromises();expect(w.find('.markdown-summary h2').text()).toBe('Summary');expect(w.find('.markdown-summary script').exists()).toBe(false);expect(w.find('textarea').exists()).toBe(false);await w.findAll('.record-tabs button').find(b=>b.text()==='Transcript').trigger('click');expect(w.text()).toContain('Complete transcript');expect(w.find('a').exists()).toBe(false);expect(w.text()).toContain('cannot be opened safely');w.unmount();});
it('loads another tenant-scoped page and retains earlier sessions',async()=>{api.get.mockResolvedValue({data:{sessions:[rows[2]],hasMore:false}});const w=mountHistory({sessions:[rows[0],rows[1]],hasMoreSessions:true});await w.find('.load-more').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/supervision/supervisee/20/sessions',{params:{agencyId:2,page:2,pageSize:50},skipGlobalLoading:true});expect(w.findAll('.session-row')).toHaveLength(3);expect(w.emitted('refreshed')[0][1]).toMatchObject({hasMore:false,page:2});w.unmount();});
it('discards a stale response after switching supervisees',async()=>{let finish;api.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const w=mountHistory({sessions:undefined});await w.setProps({providerId:30,sessions:[]});finish({data:{sessions:[rows[0]],hasMore:false}});await flushPromises();expect(w.findAll('.session-row')).toHaveLength(0);w.unmount();});
it('retains unsaved transcript edits when moving between session records',async()=>{
 const w=mount(SuperviseeSessionHistory,{props:{agencyId:2,providerId:20,sessions:rows},global:{stubs:{SupervisionRecordPanel:{template:'<div />',mounted(){this.$emit('record',{canManage:true});}}}}});
 const first=()=>w.findAll('.session-row').find(row=>row.text().includes('Oct 1,'));
 await first().find('.session-toggle').trigger('click');await flushPromises();
 await w.findAll('.record-tabs button').find(b=>b.text()==='Edit transcript & summary').trigger('click');
 await w.findAll('textarea')[0].setValue('An unsaved transcript edit.');
 await w.findAll('.session-toggle')[0].trigger('click');await flushPromises();
 await first().find('.session-toggle').trigger('click');await flushPromises();
 await w.findAll('.record-tabs button').find(b=>b.text()==='Transcript').trigger('click');
 expect(w.text()).toContain('An unsaved transcript edit.');w.unmount();
});
it('loads session chat, poll responses and Q&A only after opening the activity tab',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/activity')?{activity:[{id:10,activityType:'chat',payload:{authorName:'DEMO Supervisor',text:'<img src=x onerror=alert(1)>'},createdAt:'2026-10-01T16:01:00Z'},{id:11,activityType:'poll',payload:{id:'poll-1',question:'Next review?',options:['Tomorrow','Next week']},createdAt:'2026-10-01T16:02:00Z'},{id:12,activityType:'poll_vote',payload:{pollId:'poll-1',optionIndex:1},createdAt:'2026-10-01T16:03:00Z'},{id:13,activityType:'question',payload:{text:'What is the next step?'},createdAt:'2026-10-01T16:04:00Z'}]}:{artifact:null}}));
 const w=mountHistory({sessions:[rows[0]]});await w.find('.session-toggle').trigger('click');await flushPromises();
 expect(api.get.mock.calls.some(([url])=>url.endsWith('/activity'))).toBe(false);
 await w.findAll('.record-tabs button').find(b=>b.text()==='Chat, polls & Q&A').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/supervision/sessions/1/activity',{skipGlobalLoading:true});expect(w.text()).toContain('DEMO Supervisor');expect(w.text()).toContain('Next review?: Next week');expect(w.text()).toContain('What is the next step?');expect(w.find('.activity-list img').exists()).toBe(false);
 await w.findAll('.record-tabs button').find(b=>b.text()==='Summary & details').trigger('click');await w.findAll('.record-tabs button').find(b=>b.text()==='Chat, polls & Q&A').trigger('click');await flushPromises();
 expect(api.get.mock.calls.filter(([url])=>url.endsWith('/activity'))).toHaveLength(1);w.unmount();
});
it('keeps top-card attendance filter state synchronized with the history dropdown',async()=>{const w=mountHistory();await w.findAll('select')[0].setValue('missed');expect(w.emitted('update:attendanceFilter')[0]).toEqual(['missed']);await w.setProps({attendanceFilter:'attended'});expect(w.findAll('.session-row')).toHaveLength(1);expect(w.text()).toContain('30 attended minutes');w.unmount();});
it('propagates complete attendance totals separately from loaded page counts',async()=>{
 const summary={total:80,attended:60,missed:10,excused:3,cancelled:4,unknown:3};api.get.mockResolvedValue({data:{sessions:[rows[2]],hasMore:false,attendanceSummary:summary}});
 const w=mountHistory({sessions:[rows[0],rows[1]],hasMoreSessions:true});await w.find('.load-more').trigger('click');await flushPromises();
 expect(w.emitted('refreshed')[0][1].attendanceSummary).toEqual(summary);expect(w.emitted('counts').at(-1)[0].total).toBe(3);w.unmount();
});
