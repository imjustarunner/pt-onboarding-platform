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
 it('never treats an API error as an empty room',async()=>{sendGetRequest.mockRejectedValue({response:{status:404}});await expect(Video.listConnections('session/with+characters')).rejects.toMatchObject({response:{status:404}});});
});
