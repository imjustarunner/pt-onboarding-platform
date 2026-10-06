import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),wav:vi.fn()}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../utils/meetingAudio',()=>({meetingAudioWav:m.wav}));
import {createConsentedAudioCapture} from '../consentedAudioCapture';
let recorders,state,capture;
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();recorders=[];state={allowed:true,requested:true,paused:false,stopped:false,revision:2};m.get.mockImplementation(async()=>({data:{...state}}));m.post.mockResolvedValue({data:state});m.wav.mockResolvedValue(new Blob(['wav'],{type:'audio/wav'}));vi.stubGlobal('MediaRecorder',class {static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['sound'])});this.onstop();}});vi.stubGlobal('MediaStream',class{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}});});
afterEach(()=>{capture?.stop({drop:true});vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
const settle=async()=>{await vi.advanceTimersByTimeAsync(0);};
function start(isHost=false){const track={readyState:'live',enabled:true,clone:()=>({stop:vi.fn()})};capture=createConsentedAudioCapture({baseUrl:'/counseling/sessions/9',getStream:()=>({getAudioTracks:()=>[track]}),isHost});capture.start();return capture;}
describe('consent-controlled microphone capture',()=>{
 it('keeps polling after a consent-revision rejection and resumes only once allowed again',async()=>{
   start();await settle();
   m.post.mockImplementationOnce(async()=>{state.allowed=false;throw {response:{status:409,data:{error:{message:'Waiting for group consent'}}}};});
   await vi.advanceTimersByTimeAsync(10000);
   const count=recorders.length;
   const polls=m.get.mock.calls.length;
   await vi.advanceTimersByTimeAsync(3000);
   expect(m.get.mock.calls.length).toBeGreaterThan(polls);expect(recorders).toHaveLength(count);
   state.allowed=true;state.revision++;
   await vi.advanceTimersByTimeAsync(1500);expect(recorders.length).toBeGreaterThan(count);
 });
 it('never creates a recorder or posts audio while unsigned',async()=>{state.allowed=false;start();await settle();await vi.advanceTimersByTimeAsync(12000);expect(recorders).toHaveLength(0);expect(m.post).not.toHaveBeenCalled();});
 it('discards the whole active segment when another participant pauses',async()=>{start();await settle();expect(recorders).toHaveLength(1);state.paused=true;state.revision++;await vi.advanceTimersByTimeAsync(1500);expect(m.post.mock.calls.some(([url])=>url.endsWith('/audio'))).toBe(false);});
 it('uploads local audio with the consent revision and an idempotency key',async()=>{start();await settle();await vi.advanceTimersByTimeAsync(10000);const call=m.post.mock.calls.find(([url])=>url.endsWith('/audio'));expect(call).toBeTruthy();expect(call[1].get('revision')).toBe('2');expect(call[1].get('chunkKey')).toMatch(/^[\w-]+$/);expect(call[1].get('audio').type).toBe('audio/wav');});
 it('flushes the final segment before acknowledging a session finish',async()=>{start();await settle();state.finishing=true;await vi.advanceTimersByTimeAsync(1500);const urls=m.post.mock.calls.map(([u])=>u);expect(urls.findIndex(u=>u.endsWith('/audio'))).toBeLessThan(urls.findIndex(u=>u.endsWith('/control')));expect(m.post).toHaveBeenCalledWith('/counseling/sessions/9/transcription/control',{action:'drained'},expect.any(Object));expect(recorders).toHaveLength(1);});
 it('allows either participant to request a pause without an app login',async()=>{start(false);await settle();await capture.control('pause');expect(m.post).toHaveBeenCalledWith('/counseling/sessions/9/transcription/control',{action:'pause'},expect.any(Object));expect(m.post.mock.calls.some(([u])=>u.endsWith('/audio'))).toBe(false);});
});
