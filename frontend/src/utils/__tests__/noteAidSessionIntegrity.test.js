import { describe, expect, it, vi } from 'vitest';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn(),delete:vi.fn(),patch:vi.fn()}}));
import { buildMyWorkItems, myWorkCounts, buildLeftLibraryRows, draftMatchesWorkQueueItem, workQueueSessionKey } from '../noteAidDocumentationStatus.js';
import { resolveNoteAidBillingCodes } from '../noteAidBillingAddons.js';
const draft={id:17,agency_id:7,client_id:3,clinical_session_id:90,client_full_name:'Synthetic Client',date_of_service:'2026-11-15',service_code:'90837',input_text:'Synthetic facts'};
const queue={id:'booked_session_90',agencyId:7,clientId:3,clinicalSessionId:90,officeEventId:460,date:'2026-11-15',serviceCode:'90837',status:'started',docStatus:'started',draftId:17};
describe('one My Work source and stable session identities',()=>{
 it('counts a saved draft and queue item for one session exactly once',()=>{
  const rows=buildMyWorkItems({drafts:[draft],workQueueItems:[queue,{id:'unstarted',clientId:4,status:'not_started'}]});
  expect(rows).toHaveLength(2);expect(myWorkCounts(rows)).toEqual({notStarted:1,inProgress:1});
 });
 it('shows a draft that has no persisted queue row and supplies its actual open target',()=>{
  const rows=buildMyWorkItems({drafts:[draft],workQueueItems:[]});
  expect(rows).toEqual([expect.objectContaining({draftOnly:true,draftId:17,clinicalSessionId:90,agencyId:7,rawDraft:draft})]);
  expect(myWorkCounts(rows)).toEqual({notStarted:0,inProgress:1});
 });
 it('keeps two same-day appointments distinct and does not hide another client in a group event',()=>{
  const second={...draft,id:18,clinical_session_id:91};
  const rows=buildLeftLibraryRows({drafts:[draft,second],workQueueItems:[queue,{...queue,id:'second',draftId:18,clinicalSessionId:91,officeEventId:461}]});
  expect(rows).toHaveLength(2);
  expect(buildLeftLibraryRows({drafts:[],workQueueItems:[queue,{...queue,id:'other-client',draftId:19,clinicalSessionId:92,clientId:4}]})).toHaveLength(2);
 });
 it('matches the exact clinical session even when the old draft lacks its office-event id',()=>{
  expect(draftMatchesWorkQueueItem(draft,queue)).toBe(true);
  expect(workQueueSessionKey(queue)).toBe('cs:90');
  expect(draftMatchesWorkQueueItem({...draft,clinical_session_id:91},queue)).toBe(false);
 });
 it('refuses a foreign practice or client even when a stale draft id agrees',()=>{
  expect(draftMatchesWorkQueueItem({...draft,agency_id:8},queue)).toBe(false);
  expect(draftMatchesWorkQueueItem({...draft,client_id:4},queue)).toBe(false);
 });
 it('excludes archived, completed and signed records from unfinished counts',()=>{
  expect(buildMyWorkItems({drafts:[{...draft,archived_at:'2026-11-16'}],workQueueItems:[{...queue,status:'signed',docStatus:'signed'}]})).toEqual([]);
 });
});
describe('automatic Sunday add-on',()=>{
 it('does not require selecting the old after-hours control',()=>{
  const result=resolveNoteAidBillingCodes({primaryCode:'90837',durationMinutes:60,sessionStartAt:'2026-11-15T16:00:00Z',timeZone:'America/Denver',includeAfterHours99051:false});
  expect(result.addons).toContainEqual({code:'99051',units:1});
 });
 it('preserves pro-bono funding and saved-source schedule restrictions',()=>{
  const base={primaryCode:'90837',durationMinutes:60,sessionStartAt:'2026-11-15T16:00:00Z',timeZone:'America/Denver'};
  for(const options of [{metadata:{fundingDisposition:'pro_bono'}},{timeZone:null},{sessionStartAt:'2026-11-15'},{sessionStartAt:'2026-11-17T16:00:00Z'}]){
   expect(resolveNoteAidBillingCodes({...base,...options,includeAfterHours99051:true}).addons).not.toContainEqual({code:'99051',units:1});
  }
 });
});
