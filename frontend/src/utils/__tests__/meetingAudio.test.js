// @vitest-environment node
import {afterEach,it,expect,vi} from 'vitest';
import {meetingAudioWav} from '../meetingAudio';
afterEach(()=>vi.unstubAllGlobals());
it('converts decoded AAC/MP4 to mono PCM WAV with the actual sample rate',async()=>{vi.stubGlobal('OfflineAudioContext',class{async decodeAudioData(){return {length:3,sampleRate:16000,numberOfChannels:2,getChannelData:()=>new Float32Array([-1,0,1])};}});const blob=await meetingAudioWav(new Blob(['fake aac'],{type:'audio/mp4'}));expect(blob.type).toBe('audio/wav');const bytes=await blob.arrayBuffer(),view=new DataView(bytes);expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('RIFF');expect(view.getUint32(24,true)).toBe(16000);expect(view.getUint16(22,true)).toBe(1);expect(view.getInt16(44,true)).toBe(-32768);expect(view.getInt16(48,true)).toBe(32767);});
