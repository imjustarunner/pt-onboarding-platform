import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({current:vi.fn(),readStatus:vi.fn()}));
vi.mock('../clientRecordsStatus.service.js',()=>({markRecordsClientCurrent:m.current,readRecordsClientStatus:m.readStatus}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientChartImport.service.js',()=>({chartSections:['demographics','comments','contacts','insurance','intake','plan'],readChartRecord:vi.fn()}));
import {beginClientChartImport,completeClientChartImport} from '../clientChartImportProgress.service.js';
const scope={clientId:12,agencyId:2};let state,db,readRecord;
beforeEach(()=>{m.current.mockReset().mockResolvedValue({id:3,key:'current',label:'Current'});m.readStatus.mockReset().mockResolvedValue({id:3,key:'current',label:'Current'});state=null;db={execute:vi.fn(async(sql,args)=>{if(sql.startsWith('SELECT'))return[[{import_state:state}]];state=JSON.parse(args[0]);return[{affectedRows:1}];})};readRecord=vi.fn().mockResolvedValue({value:{text:'Synthetic imported section',imported:true}});});
it('starts a bounded import and updates only its JSON branch with actual actor attribution',async()=>{
 const result=await beginClientChartImport(scope,['demographics','comments'],10,{db});expect(result).toMatchObject({status:'pending',sections:['demographics','comments'],startedByUserId:10});
 expect(db.execute.mock.calls[1][0]).toContain('JSON_SET(COALESCE(onboarding_docs_json');expect(db.execute.mock.calls[1][1].slice(1)).toEqual([12,2,0]);
 await expect(beginClientChartImport(scope,['made_up'],10,{db})).rejects.toHaveProperty('status',400);
});
it.each([{imported:false},{imported:true,needsReview:true},null])('keeps incomplete or unreviewed drafts pending (%j)',async value=>{
 await beginClientChartImport(scope,['demographics'],10,{db});readRecord.mockResolvedValue({value});
 await expect(completeClientChartImport(scope,10,{db,readRecord})).rejects.toHaveProperty('status',409);expect(state.status).toBe('pending');
 expect(m.current).not.toHaveBeenCalled();
});
it('completes only after all filled sections are saved and accepts secondary-only coverage',async()=>{
 await beginClientChartImport(scope,['demographics','insurance'],10,{db});readRecord.mockImplementation(async(_scope,key)=>({value:key==='insurance'?{imported:false,coverageDrafts:{primary:{text:'',imported:false},secondary:{text:'Secondary policy',imported:true}}}:{imported:true}}));
 expect(await completeClientChartImport(scope,10,{db,readRecord})).toMatchObject({status:'complete',completedByUserId:10});
 expect(m.current).toHaveBeenCalledWith(scope,10,db,{importRevision:2});
 expect(readRecord).toHaveBeenCalledWith(scope,'demographics',10);const writes=db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE')).length;await completeClientChartImport(scope,10,{db,readRecord});expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'))).toHaveLength(writes);
});
it('rolls back completion if Current cannot be saved, and commits its progress and status together on retry',async()=>{
 await beginClientChartImport(scope,['comments'],10,{db});Object.assign(db,{beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn()});
 m.current.mockRejectedValueOnce(Object.assign(Error('Current is disabled'),{status:409}));
 await expect(completeClientChartImport(scope,10,{db,readRecord})).rejects.toHaveProperty('status',409);expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
 expect(await completeClientChartImport(scope,10,{db,readRecord})).toMatchObject({clientStatus:{id:3,key:'current'}});expect(db.commit).toHaveBeenCalledOnce();
});
it('does not finish billing sections after account access is removed',async()=>{
 await beginClientChartImport(scope,['insurance'],10,{db});await expect(completeClientChartImport(scope,10,{db,readRecord,allowedSections:['demographics']})).rejects.toHaveProperty('status',403);expect(readRecord).not.toHaveBeenCalled();
});
it('lets the existing Mark done action complete an import without starting one for unrelated charts',async()=>{
 expect(await completeClientChartImport(scope,10,{db,readRecord,ifPending:true})).toBeNull();expect(db.execute).toHaveBeenCalledOnce();expect(readRecord).not.toHaveBeenCalled();
 await beginClientChartImport(scope,['demographics'],10,{db});expect(await completeClientChartImport(scope,10,{db,readRecord,ifPending:true})).toHaveProperty('status','complete');
});
it('rejects completion when another window changes the required import steps',async()=>{
 await beginClientChartImport(scope,['demographics'],10,{db});db.execute.mockResolvedValueOnce([[{import_state:state}]]).mockResolvedValueOnce([{affectedRows:0}]);
 await expect(completeClientChartImport(scope,10,{db,readRecord})).rejects.toHaveProperty('status',409);expect(state.status).toBe('pending');
});
it('records explicitly blank sections but refuses to discard a saved unimported paste',async()=>{
 await beginClientChartImport(scope,['comments'],10,{db});
 readRecord.mockImplementation(async(_scope,key)=>({value:{text:key==='intake'?'Original source':'',imported:key==='comments'}}));
 await expect(completeClientChartImport(scope,10,{db,readRecord,keptBlankSections:['intake']})).rejects.toHaveProperty('status',409);
 readRecord.mockResolvedValue({value:{text:'',imported:true}});
 expect(await completeClientChartImport(scope,10,{db,readRecord,keptBlankSections:['intake','plan']})).toMatchObject({status:'complete',keptBlankSections:['intake','plan']});
});
it('reopens a completed chart for selected areas and retains that choice while importing',async()=>{
 await beginClientChartImport(scope,['demographics'],10,{db});await completeClientChartImport(scope,10,{db,readRecord});
 const reopened=await beginClientChartImport(scope,[],10,{db,selectedSections:['contacts','insurance']});expect(reopened).toMatchObject({status:'pending',selectedSections:['contacts','insurance'],sections:[]});
 const pending=await beginClientChartImport(scope,['contacts'],10,{db});expect(pending.selectedSections).toEqual(['contacts','insurance']);readRecord.mockResolvedValue({value:{imported:true}});readRecord.mockClear();await completeClientChartImport(scope,10,{db,readRecord});expect(readRecord).toHaveBeenCalledExactlyOnceWith(scope,'contacts',10);
});
it('rejects empty or unknown manual update selections',async()=>{
 await expect(beginClientChartImport(scope,[],10,{db,selectedSections:[]})).rejects.toHaveProperty('status',400);await expect(beginClientChartImport(scope,[],10,{db,selectedSections:['made_up']})).rejects.toHaveProperty('status',400);
});

it('accepts a Billing handoff for only the exact coverage paste, and still requires the other sections',async()=>{
 await beginClientChartImport(scope,['demographics','insurance'],10,{db});
 const draft={coverageDrafts:{primary:{text:' Primary paste ',imported:false},secondary:{text:'Secondary paste',imported:true}}};
 const receipt={primary:{text:'Previous primary paste',taskId:42},secondary:{text:'Primary paste',taskId:43}};
 let demographicsImported=false;
 readRecord.mockImplementation(async(_scope,key)=>({value:
  key==='insurance'?draft:key==='insuranceHandoff'?receipt:{imported:demographicsImported}
 }));
 await expect(completeClientChartImport(scope,10,{db,readRecord})).rejects.toHaveProperty('status',409);
 demographicsImported=true;
 await expect(completeClientChartImport(scope,10,{db,readRecord})).rejects.toHaveProperty('status',409);
 receipt.primary.text='Primary paste';
 await expect(completeClientChartImport(scope,10,{db,readRecord})).resolves.toMatchObject({status:'complete'});
 expect(readRecord).toHaveBeenCalledWith(scope,'insuranceHandoff',0);
});

it('reports actual status on a retry and never reopens an enrollment closed after completion', async () => {
 await beginClientChartImport(scope,['demographics'],10,{db});
 await completeClientChartImport(scope,10,{db,readRecord});
 m.readStatus.mockResolvedValue(null);
 m.current.mockClear();
 expect(await completeClientChartImport(scope,10,{db,readRecord})).toMatchObject({status:'complete',clientStatus:null});
 expect(m.current).not.toHaveBeenCalled();
});
