import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>()=>{}}));
vi.mock('../../services/narrivaAccess.service.js',()=>({positiveId:Number,narrivaError:(status,message,code)=>Object.assign(new Error(message),{status,code})}));
vi.mock('../../services/narrivaTestReview.service.js',()=>({narrivaTestOptions:vi.fn(),runNarrivaTestReview:m.run}));
vi.mock('../../services/narrivaReview.service.js',()=>({}));
import {postNarrivaTestReview} from '../narriva.controller.js';
it('does not expose a model/provider request object or test text through the global error logger',async()=>{const privateText='PRIVATE_INPUT_CANARY';const cause=Object.assign(new Error(privateText),{request:{body:privateText},status:502});m.run.mockRejectedValueOnce(cause);const req={user:{id:7},body:{noteText:privateText}},res={set:vi.fn()},next=vi.fn();await postNarrivaTestReview(req,res,next);const error=next.mock.calls[0][0];expect(error).toMatchObject({status:503,code:'NARRIVA_TEST_UNAVAILABLE',quiet:true});expect(error).not.toHaveProperty('request');expect(error.message).not.toContain(privateText);});
