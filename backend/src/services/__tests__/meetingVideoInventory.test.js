import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import Video from '../vonageVideo.service.js';
const sendGetRequest=vi.fn();
beforeEach(()=>{vi.stubEnv('VONAGE_APPLICATION_ID','application');vi.spyOn(Video,'getClient').mockReturnValue({video:{sendGetRequest}});sendGetRequest.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
const inventory=changes=>({applicationId:'application',sessionId:'session/with+characters',count:0,items:[],...changes});
const connection={connectionId:'quiet-client',connectionState:'Connected',createdAt:Date.now()-1000};
describe('authoritative Vonage connection inventory',()=>{
 it('uses the authenticated transport with encoded application and session identifiers',async()=>{
  sendGetRequest.mockResolvedValue({data:inventory()});expect(await Video.listConnections('session/with+characters')).toEqual({count:0,items:[]});
  expect(sendGetRequest).toHaveBeenCalledWith('https://video.api.vonage.com/v2/project/application/session/session%2Fwith%2Bcharacters/connection');
 });
 it('preserves total counts for partial pages, including connecting and silent clients',async()=>{
  sendGetRequest.mockResolvedValue({data:inventory({count:5,items:[connection,{...connection,connectionId:'starting',connectionState:'Connecting'}]})});
  expect(await Video.listConnections('session/with+characters')).toMatchObject({count:5,items:expect.any(Array)});
 });
 it.each([{applicationId:'other'},{sessionId:'other'},{count:-1},{count:'0'},{count:1},{items:[connection]},{items:null},{count:1,items:[null]},{count:1,items:[{...connection,createdAt:null}]},{count:1,items:[{...connection,connectionState:'Unknown'}]}])('fails closed on invalid or mismatched evidence: %j',async changes=>{
  sendGetRequest.mockResolvedValue({data:inventory(changes)});await expect(Video.listConnections('session/with+characters')).rejects.toMatchObject({code:'VIDEO_CONNECTION_INVENTORY_INVALID'});
 });
 it('accepts only the documented structured session-not-found evidence',async()=>{sendGetRequest.mockRejectedValue({response:{status:404,data:{code:404,message:'Session not found'}}});await expect(Video.listConnections('session/with+characters')).resolves.toEqual({count:0,items:[],evidence:'session_not_found'});});
 it('decodes the installed SDK fetch Response before recognizing an inactive session',async()=>{sendGetRequest.mockRejectedValue({response:{status:404,json:async()=>({code:404,message:'Session not found'})}});await expect(Video.listConnections('session/with+characters')).resolves.toMatchObject({count:0,evidence:'session_not_found'});});
 it('recognizes the verified production empty-session response without a numeric code',async()=>{sendGetRequest.mockRejectedValue({response:{status:404,json:async()=>({message:'Not found. No clients are actively connected to the OpenTok session.'})}});await expect(Video.listConnections('session/with+characters')).resolves.toEqual({count:0,items:[],evidence:'no_active_clients'});});
 it('rejects an unrelated structured 404',async()=>{sendGetRequest.mockRejectedValue({response:{status:404,json:async()=>({message:'Not found'})}});await expect(Video.listConnections('session/with+characters')).rejects.toMatchObject({response:{status:404}});});
 it('rejects a generic proxy not-found response',async()=>{sendGetRequest.mockRejectedValue({response:{status:404,data:'Not Found'}});await expect(Video.listConnections('session/with+characters')).rejects.toMatchObject({response:{status:404}});});
 it('never treats an API error as an empty room',async()=>{sendGetRequest.mockRejectedValue({response:{status:404}});await expect(Video.listConnections('session/with+characters')).rejects.toMatchObject({response:{status:404}});});
});
