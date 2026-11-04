import {beforeEach,it,expect,vi} from 'vitest';
const generate=vi.hoisted(()=>vi.fn());
vi.mock('../vonageVideo.service.js',()=>({resolveVideoProjectId:()=> 'project',default:{isVideoConfigured:()=>true,generateToken:generate}}));
import {createAccessTokenAsync} from '../video.service.js';
beforeEach(()=>{generate.mockReset().mockReturnValue('token');});
it('passes a bounded reservation expiry to the SDK while preserving account metadata',async()=>{
 await expect(createAccessTokenAsync({roomSid:'room',identity:'user-7',expireTime:12345,metadata:{role:'supervisor'}})).resolves.toBe('token');
 expect(generate).toHaveBeenCalledWith('room',{expireTime:12345,data:JSON.stringify({identity:'user-7',role:'supervisor'})});
});
it('preserves the existing SDK default when no expiry is supplied',async()=>{
 await createAccessTokenAsync({roomSid:'room',identity:'user-7'});
 expect(generate).toHaveBeenCalledWith('room',{data:JSON.stringify({identity:'user-7'})});
});
