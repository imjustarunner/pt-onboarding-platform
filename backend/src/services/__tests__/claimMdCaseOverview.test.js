import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import { buildSupervisionCaseOverview,caseNoteExcerpt,listSupervisionCases } from '../supervisionCaseReview.service.js';
import { loadReviewDocument } from '../clinicalReviewDocument.service.js';
const scope={agencyId:1,providerUserId:7};
describe('source-linked clinical case overview',()=>{
  it('bounds excerpts, identifies addenda, and never includes structured claim details',()=>{
    const result=caseNoteExcerpt(JSON.stringify({note:JSON.stringify({sections:{assessment:'a'.repeat(1700),plan:'continue'},billing:{amount:200},claims:[{payer:'secret'}]}),addenda:[{body:'Read source'}]}));
    expect(result).toMatchObject({truncated:true,hasAddenda:true});expect(result.text).toHaveLength(1600);expect(result.text).not.toContain('secret');
  });
  it('scopes every case source to agency/provider/client and changes acknowledgement version when a source changes',async()=>{
    const db={execute:vi.fn().mockResolvedValueOnce([[{id:4,title:'Progress note'}]]).mockResolvedValueOnce([[{id:8,title:'Plan',status:'active'}]])};
    const load=vi.fn().mockResolvedValueOnce({hash:'note-v1',content:JSON.stringify({note:{assessment:'Improving'},addenda:[]})}).mockResolvedValueOnce({hash:'plan-v1',content:JSON.stringify({presentingProblem:'Anxiety',goals:[{goal_text:'Coping',objectives:[]}],billing:{amount:500}})});
    const result=await buildSupervisionCaseOverview(scope,3,{db,load});
    expect(db.execute.mock.calls[0][1]).toEqual([1,7,3]);expect(db.execute.mock.calls[1][1]).toEqual([1,3,7,7]);
    expect(db.execute.mock.calls.every(([sql])=>sql.includes('privatePsychotherapyNote')&&sql.includes('restricted'))).toBe(true);
    expect(load).toHaveBeenNthCalledWith(1,scope,'note',4,db);expect(load).toHaveBeenNthCalledWith(2,scope,'treatment_plan',8,db);
    expect(result.treatmentPlans[0]).toMatchObject({presentingProblem:'Anxiety'});expect(JSON.stringify(result)).not.toContain('500');
    db.execute.mockResolvedValueOnce([[{id:4,title:'Progress note'}]]).mockResolvedValueOnce([[{id:8,title:'Plan',status:'active'}]]);
    load.mockResolvedValueOnce({hash:'note-v2-with-addendum',content:'{}'}).mockResolvedValueOnce({hash:'plan-v1',content:'{}'});
    expect((await buildSupervisionCaseOverview(scope,3,{db,load})).contentHash).not.toBe(result.contentHash);
  });
  it('denies an unrelated case before loading any document',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[]])},load=vi.fn();
    await expect(buildSupervisionCaseOverview(scope,99,{db,load})).rejects.toMatchObject({status:404});expect(load).not.toHaveBeenCalled();
  });
  it('paginates case access instead of silently omitting older cases',async()=>{
    const db={execute:vi.fn().mockResolvedValue([Array.from({length:51},(_,i)=>({client_id:i+51}))])};
    const result=await listSupervisionCases(scope,50,db);expect(result.cases).toHaveLength(50);expect(result.nextCursor).toBe(100);expect(db.execute.mock.calls[0][1]).toEqual([1,7,1,7,50]);
  });
  it('rejects explicitly restricted notes and prevents private-only case links from authorizing plan reads',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[{id:4,metadata_json:{restricted:true}}]])};
    await expect(loadReviewDocument(scope,'note',4,db)).rejects.toMatchObject({status:403});
    db.execute.mockResolvedValue([[]]);await expect(loadReviewDocument(scope,'treatment_plan',8,db)).rejects.toMatchObject({status:404});
    const [sql,values]=db.execute.mock.calls.at(-1);expect(sql).toContain('privatePsychotherapyNote');expect(sql).toContain('restricted');expect(values).toEqual([8,1,7,7]);
  });
});
