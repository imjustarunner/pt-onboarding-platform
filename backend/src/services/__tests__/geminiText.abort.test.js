import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('google-auth-library',()=>({GoogleAuth:class{async getClient(){return {getAccessToken:async()=>({token:'synthetic-token'})};}}}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({parseGoogleWorkspaceServiceAccountFromEnv:()=>null}));
import {callGeminiText} from '../geminiText.service.js';
beforeEach(()=>{vi.stubEnv('GCP_PROJECT_ID','synthetic-project');vi.stubEnv('GEMINI_FORCE_API_KEY','');vi.stubEnv('VERTEX_AUTH_SOURCE','');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('optional private model cancellation',()=>{
 it('cancels Vertex with the supplied reason and does not retry or fall back to an API key',async()=>{
  vi.stubEnv('GEMINI_API_KEY','synthetic-key');const controller=new AbortController(),reason=Object.assign(new Error('slice'),{reportSlice:true});
  const fetch=vi.fn(async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});controller.abort(reason);}));vi.stubGlobal('fetch',fetch);
  await expect(callGeminiText({prompt:'synthetic',vertexOnly:true,signal:controller.signal})).rejects.toBe(reason);expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('retains the ordinary behavior when no cancellation signal is supplied',async()=>{
  const fetch=vi.fn(async(_url,{signal})=>{expect(signal.aborted).toBe(false);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Synthetic response'}]},finishReason:'STOP'}]})};});vi.stubGlobal('fetch',fetch);
  await expect(callGeminiText({prompt:'synthetic',vertexOnly:true})).resolves.toMatchObject({text:'Synthetic response',provider:'vertex'});expect(fetch).toHaveBeenCalledTimes(1);
 });
});
