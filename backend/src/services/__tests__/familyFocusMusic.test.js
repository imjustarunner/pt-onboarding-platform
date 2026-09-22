import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({enabled:vi.fn(),catalog:vi.fn(),resolve:vi.fn()}));
vi.mock('../../controllers/focusMusic.controller.js',()=>({isFocusMusicEnabledForAgency:mocks.enabled}));
vi.mock('../focusMusic.service.js',()=>({getFocusMusicCatalog:mocks.catalog,resolveFocusMusicFile:mocks.resolve}));
import {familyFocusMusicCatalog,familyFocusMusicStream} from '../../controllers/familyFocusMusic.controller.js';
beforeEach(()=>{vi.clearAllMocks();mocks.enabled.mockResolvedValue(true);});
describe('family focus music',()=>{
 it('uses the authenticated family tenant and returns only family stream URLs',async()=>{
  mocks.catalog.mockResolvedValue([{id:'calm',title:'Calm',fullPath:'/private/file.mp3'}]);
  const res={json:vi.fn()};await familyFocusMusicCatalog({family:{agencyId:7},headers:{'x-agency-id':99},query:{agencyId:99}},res);
  expect(mocks.enabled).toHaveBeenCalledWith(7);
  expect(res.json.mock.calls[0][0].tracks[0]).toMatchObject({streamUrl:'/api/family/focus-music/stream/calm'});
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('/private/');
 });
 it('rejects missing sessions and disabled tenants before reading music',async()=>{
  await expect(familyFocusMusicCatalog({},{})).rejects.toMatchObject({status:401});
  mocks.enabled.mockResolvedValue(false);
  await expect(familyFocusMusicStream({family:{agencyId:7},params:{slug:'calm'}},{})).rejects.toMatchObject({status:403});
  expect(mocks.catalog).not.toHaveBeenCalled();expect(mocks.resolve).not.toHaveBeenCalled();
 });
 it('uses range-capable file delivery and rejects unknown tracks',async()=>{
  const res={type:vi.fn().mockReturnThis(),sendFile:vi.fn()},next=vi.fn(),req={family:{agencyId:7},params:{slug:'calm'}};
  mocks.resolve.mockResolvedValue({fullPath:'/music/calm.mp3'});await familyFocusMusicStream(req,res,next);
  expect(res.sendFile).toHaveBeenCalledWith('/music/calm.mp3',{cacheControl:false},expect.any(Function));
  const error=new Error('read failed');res.sendFile.mock.calls[0][2](error);expect(next).toHaveBeenCalledWith(error);
  mocks.resolve.mockResolvedValue(null);await expect(familyFocusMusicStream(req,res,next)).rejects.toMatchObject({status:404});
 });
});
