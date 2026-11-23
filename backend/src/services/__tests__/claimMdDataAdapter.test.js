import {it,expect,vi,afterEach} from 'vitest';
const observed=vi.hoisted(()=>vi.fn());
vi.mock('../claimMdDataMonitor.service.js',()=>({observeClaimMdData:observed}));
vi.mock('../syntheticClearinghouseGuard.service.js',()=>({assertLiveClearinghouseAgency:vi.fn()}));
import {requestEligibilityJson,fetchResponses,fetchEraList,fetchEraData,fetchPayers,requestEnrollment,uploadClaims} from '../claimMd.service.js';
import {takeClaimMdFailureEvidence} from '../claimMdEligibilityErrors.js';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('observes every JSON adapter response without additional payer requests or altering results',async()=>{
 const result={elig:{ins_number:'synthetic'}},fetch=vi.fn(async()=>({ok:true,text:async()=>JSON.stringify(result),json:async()=>result}));vi.stubGlobal('fetch',fetch);
 const calls=[
  ['eligdata',()=>requestEligibilityJson({agencyId:2,accountKey:'test-key',payload:{payerid:'SKCO0'}})],
  ['response',()=>fetchResponses({agencyId:2,accountKey:'test-key'})],
  ['eralist',()=>fetchEraList({agencyId:2,accountKey:'test-key'})],
  ['eradata',()=>fetchEraData({agencyId:2,accountKey:'test-key',eraId:'fake'})],
  ['payerlist',()=>fetchPayers({agencyId:2,accountKey:'test-key',payerId:'00050'})],
  ['enroll',()=>requestEnrollment({agencyId:2,accountKey:'test-key',practice:{},payerId:'00050'})],
  ['upload',()=>uploadClaims({agencyId:2,accountKey:'test-key',fileContents:'{}'})]
 ];
 for(const [endpoint,call] of calls){expect(await call()).toEqual(result);expect(observed).toHaveBeenLastCalledWith(expect.objectContaining({agencyId:2,endpoint,result}));}
 expect(fetch).toHaveBeenCalledTimes(calls.length);expect(JSON.stringify(observed.mock.calls)).not.toContain('test-key');
});
it('flags a non-JSON response without handing its contents to the monitor',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,text:async()=>'<html>SECRET</html>'})));
 await expect(fetchPayers({agencyId:2,accountKey:'test-key'})).rejects.toThrow('invalid response');
 expect(observed).toHaveBeenCalledWith({agencyId:2,endpoint:'payerlist',failure:'invalid_api_response'});
 expect(JSON.stringify(observed.mock.calls)).not.toContain('SECRET');
});
it('gives real-time eligibility the documented payer response window and retains a safe failure reason',async()=>{
 const timeout=vi.spyOn(AbortSignal,'timeout');const fetch=vi.fn(async()=>({ok:true,status:200,text:async()=>JSON.stringify({error:[{error_code:'123',error_mesg:'Provider enrollment required SECRET_PATIENT'}]})}));vi.stubGlobal('fetch',fetch);
 await expect(requestEligibilityJson({agencyId:2,accountKey:'secret-key',payload:{payerid:'SKCO0'}})).rejects.toMatchObject({code:'CLAIM_MD_PAYER_ENROLLMENT',upstreamCodes:['123'],status:409});
 expect(timeout).toHaveBeenCalledWith(100000);expect(JSON.stringify(observed.mock.calls)).not.toContain('SECRET_PATIENT');timeout.mockRestore();
});
it.each([{}, {error:[]}, {errors:[]}, {error:''}, {error:{}}, {error:[null,{},'']}])('accepts real eligibility data with empty system error containers: %j',async empty=>{
 const result={...empty,elig:{ins_number:'SYNTHETIC',benefit:{benefit_code:'30',benefit_coverage_code:'1'}}};
 const fetch=vi.fn(async()=>({ok:true,status:200,text:async()=>JSON.stringify(result)}));vi.stubGlobal('fetch',fetch);
 expect(await requestEligibilityJson({agencyId:2,accountKey:'secret-key'})).toEqual(result);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('accepts wrapped benefits and preserves payer-level member-not-found messages for review',async()=>{
 const result={result:{error:[],elig:{error:{error_code:'75',error_mesg:'Subscriber not found'}}}};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,text:async()=>JSON.stringify(result)})));
 expect(await requestEligibilityJson({agencyId:2,accountKey:'secret-key'})).toEqual(result);
});
it('recognizes wrapped system errors without losing their protected original message',async()=>{
 const result={result:{error:{error_code:'123',error_mesg:'Provider enrollment required for PRIVATE_MEMBER'}}};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,text:async()=>JSON.stringify(result)})));
 const error=await requestEligibilityJson({agencyId:2,accountKey:'secret-key'}).catch(e=>e);
 expect(error).toMatchObject({code:'CLAIM_MD_PAYER_ENROLLMENT',upstreamCodes:['123']});
 expect(JSON.stringify(error)).not.toContain('PRIVATE_MEMBER');
 expect(takeClaimMdFailureEvidence(error)).toMatchObject({responseFormat:'json',errors:[{message:'Provider enrollment required for PRIVATE_MEMBER'}]});
});
it.each(['<html>PRIVATE_MEMBER secret-key</html>','',JSON.stringify({error:[]}),JSON.stringify({elig:[]})])('distinguishes unusable HTTP 200 responses from request rejections: %s',async body=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,text:async()=>body})));
 const error=await requestEligibilityJson({agencyId:2,accountKey:'secret-key'}).catch(e=>e);
 expect(error).toMatchObject({code:'CLAIM_MD_INVALID_RESPONSE',upstreamStatus:200});
 expect(JSON.stringify(error)+JSON.stringify(observed.mock.calls)).not.toMatch(/PRIVATE_MEMBER|secret-key/);
 expect(JSON.stringify(takeClaimMdFailureEvidence(error))).not.toMatch(/PRIVATE_MEMBER|secret-key/);
});
it('extracts only error attributes from an XML rejection and removes credential echoes',async()=>{
 const raw='<result><error error_code="100" error_mesg="Invalid AccountKey secret-key for PRIVATE_MEMBER" /></result>';
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,text:async()=>raw})));
 const error=await requestEligibilityJson({agencyId:2,accountKey:'secret-key'}).catch(e=>e);
 expect(error).toMatchObject({code:'CLAIM_MD_ACCOUNT_SETUP',upstreamCodes:['100']});
 const evidence=takeClaimMdFailureEvidence(error);
 expect(evidence).toMatchObject({responseFormat:'xml',errors:[{code:'100',message:expect.stringContaining('PRIVATE_MEMBER')}]});
 expect(JSON.stringify(error)+JSON.stringify(observed.mock.calls)).not.toMatch(/PRIVATE_MEMBER|secret-key/);
 expect(JSON.stringify(evidence)).not.toContain('secret-key');
});
