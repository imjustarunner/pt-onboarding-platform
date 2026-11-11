import {it,expect,vi,afterEach} from 'vitest';
const observed=vi.hoisted(()=>vi.fn());
vi.mock('../claimMdDataMonitor.service.js',()=>({observeClaimMdData:observed}));
vi.mock('../syntheticClearinghouseGuard.service.js',()=>({assertLiveClearinghouseAgency:vi.fn()}));
import {requestEligibilityJson,fetchResponses,fetchEraList,fetchEraData,fetchPayers,requestEnrollment,uploadClaims} from '../claimMd.service.js';
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
