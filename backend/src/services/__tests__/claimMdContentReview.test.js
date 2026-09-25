import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:vi.fn(()=> 'encrypted-review'),decryptFamilyBilling:vi.fn(()=>({findings:[]}))}));
import { parseContentReview, reviewSourceHash, runClaimContentReview, currentClaimContentReview, redactReviewNarrative } from '../claimContentReview.service.js';
import { callGeminiText } from '../geminiText.service.js';
const input=()=>({agencyId:1,claimId:2,sourceHash:'a'.repeat(64),actorUserId:9,documentation:{note:{id:3,provider_signed_at:'2026-09-24'},narrative:'Synthetic clinical content',addenda:[]},payload:{pat_name_f:'PRIVATE NAME',ins_number:'PRIVATE MEMBER',charge:[{proc_code:'90834',units:'1',place_of_service:'11',mod1:'95',pat_name:'NO LEAK'}]},insurance:{patient:{firstName:'PRIVATE NAME'}}});
beforeEach(()=>vi.restoreAllMocks());
describe('server-attested AI content review',()=>{
  it('privacy-processes entry reasons along with text before any model call',async()=>{
    const args=input();args.documentation.addenda=[{entry_kind:'correction',body:'Corrected location',entry_reason:'PRIVATE REASON'}];
    const redact=vi.fn().mockResolvedValue('SAFE'),model=vi.fn().mockResolvedValue({text:'{"complete":true,"findings":[]}',finishReason:'STOP'}),db={execute:vi.fn().mockResolvedValue([{insertId:4}])};
    await runClaimContentReview(args,{redact,model,db});
    expect(redact.mock.calls[0][0]).toContain('correction: Corrected location\nReason: PRIVATE REASON');
    expect(model.mock.calls[0][0].prompt).not.toContain('PRIVATE REASON');
  });
  it('sends only privacy-reviewed narrative and whitelisted claim fields to the restricted model',async()=>{
    const redact=vi.fn().mockResolvedValue('REDACTED CONTENT'),model=vi.fn().mockResolvedValue({text:'{"complete":true,"findings":[]}',finishReason:'STOP',modelName:'test-model'}),db={execute:vi.fn().mockResolvedValue([{insertId:4}])};
    const result=await runClaimContentReview(input(),{redact,model,db});
    expect(result.id).toBe(4);expect(model.mock.calls[0][0]).toMatchObject({vertexOnly:true,sensitive:true});
    const prompt=model.mock.calls[0][0].prompt;expect(prompt).toContain('REDACTED CONTENT');expect(prompt).toContain('90834');expect(prompt).not.toMatch(/PRIVATE|NO LEAK|Synthetic clinical content/);
    expect(db.execute.mock.calls[0][1]).toContain('encrypted-review');
  });
  it('never runs the model when privacy processing fails, or stores truncated/invalid results',async()=>{
    const model=vi.fn(),db={execute:vi.fn()};
    await expect(runClaimContentReview(input(),{redact:async()=>{throw new Error('privacy unavailable');},model,db})).rejects.toThrow();expect(model).not.toHaveBeenCalled();
    model.mockResolvedValue({text:'{"complete":true,"findings":[]}',finishReason:'MAX_TOKENS'});
    await expect(runClaimContentReview(input(),{redact:async()=> 'safe',model,db})).rejects.toThrow(/truncated/);expect(db.execute).not.toHaveBeenCalled();
    expect(()=>parseContentReview('{"complete":false,"findings":[]}')).toThrow();expect(()=>parseContentReview('{"complete":true,"findings":[{"category":"new_diagnosis","severity":"warning","message":"invent code"}]}')).toThrow();
  });
  it('invalidates review after addendum, claim correction, or policy change',()=>{
    const data={documentation:input().documentation,payload:input().payload,supervision:{policyVersion:1},overrides:[],revision:0},hash=reviewSourceHash(data);
    expect(reviewSourceHash({...data,documentation:{...data.documentation,addenda:[{id:1,body:'amendment'}]}})).not.toBe(hash);
    expect(reviewSourceHash({...data,revision:1})).not.toBe(hash);expect(reviewSourceHash({...data,supervision:{policyVersion:2}})).not.toBe(hash);
  });
  it('requires exact current source evidence and ignores frontend AI-generated flags',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[]])};
    expect(await currentClaimContentReview(1,2,'current',db)).toMatchObject({status:'required'});expect(db.execute.mock.calls[0][1]).toEqual([1,2,'current','claim-content-v1']);
  });
  it('fails closed without approved privacy configuration and does not use an API-key fallback',async()=>{
    vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','false');const fetchImpl=vi.fn();await expect(redactReviewNarrative('note',{}, {fetchImpl})).rejects.toMatchObject({status:503});expect(fetchImpl).not.toHaveBeenCalled();
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI','false');vi.stubEnv('GEMINI_USE_VERTEX_AI','false');
    // No Vertex project is allowed in this test, even if an API key exists.
    vi.stubEnv('GCP_PROJECT_ID','');vi.stubEnv('GCS_PROJECT_ID','');vi.stubEnv('PROJECT_ID','');vi.stubEnv('GOOGLE_CLOUD_PROJECT','');vi.stubEnv('GEMINI_API_KEY','synthetic-key');
    const spy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No external requests in this test'));
    await expect(callGeminiText({prompt:'safe',vertexOnly:true,sensitive:true})).rejects.toThrow();expect(spy).not.toHaveBeenCalled();
  });
  it('removes known identifiers locally before DLP and fails closed on DLP errors',async()=>{
    vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','true');vi.stubEnv('GCP_PROJECT_ID','test-project');
    const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({item:{value:'SAFE CONTENT'}})});
    expect(await redactReviewNarrative('PRIVATE NAME had a session',input().insurance,{fetchImpl,tokenProvider:async()=> 'test-token'})).toBe('SAFE CONTENT');
    expect(fetchImpl.mock.calls[0][1].body).not.toContain('PRIVATE NAME');
    fetchImpl.mockResolvedValue({ok:false});await expect(redactReviewNarrative('some note',{}, {fetchImpl,tokenProvider:async()=> 'token'})).rejects.toThrow(/nothing was sent/);
  });
});
