// Normalize each local MediaRecorder segment to mono PCM WAV. In particular,
// Safari's AAC/MP4 output is not a Cloud Speech v1 encoding; never send it as MP4.
export async function meetingAudioWav(blob) {
  const Context=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Context)throw new Error('This browser cannot prepare audio for transcription.');
  const context=new Context(1,1,16000);
  const audio=await context.decodeAudioData(await blob.arrayBuffer());
  const count=audio.length,channels=audio.numberOfChannels;
  const bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes);
  const write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);
  const samples=Array.from({length:channels},(_,i)=>audio.getChannelData(i));
  for(let i=0;i<count;i++){let sample=0;for(const channel of samples)sample+=channel[i]/channels;sample=Math.max(-1,Math.min(1,sample));view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}
  return new Blob([bytes],{type:'audio/wav'});
}
