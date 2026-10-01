import api from '../services/api';
import {meetingAudioWav} from '../utils/meetingAudio';

// Audio goes only to the authenticated app endpoint and its configured Cloud
// Speech service. Browser SpeechRecognition is intentionally not used here.
export function createConsentedAudioCapture({baseUrl,getStream,isHost=false,onHint,onCapturing,onState}={}) {
  let wanted=false,timer=null,segmentTimer=null,recorder=null,stream=null,currentState=null,polling=false;
  let pending=Promise.resolve(),settleSegment=null,discard=false,queued=0;
  const options={skipGlobalLoading:true,skipAuthRedirect:true};
  function stopSegment(drop=false){discard ||= drop;if(segmentTimer)clearTimeout(segmentTimer);segmentTimer=null;if(recorder?.state==='recording')recorder.stop();}
  async function beginSegment(){
    if(!wanted||recorder||queued>=3||!currentState?.allowed||currentState.paused||currentState.stopped)return;
    const original=await getStream?.();
    if(!original?.getAudioTracks?.().some(t=>t.readyState==='live'&&t.enabled)){onCapturing?.(false);onHint?.('Transcription is ready. Unmute your microphone to transcribe your speech.');return;}
    stream=new MediaStream(original.getAudioTracks().map(t=>t.clone()));
    const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    const active=new MediaRecorder(stream,mimeType?{mimeType}:undefined),parts=[],revision=currentState.revision,chunkKey=crypto.randomUUID();
    recorder=active;discard=false;
    const finished=new Promise(resolve=>{settleSegment=resolve;});
    active.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
    active.onstop=()=>{
      const dropped=discard,blob=new Blob(parts,{type:active.mimeType||mimeType});
      stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;onCapturing?.(false);
      if(!dropped&&blob.size){const body=new FormData();body.append('revision',String(revision));body.append('chunkKey',chunkKey);
        queued++;pending=pending.then(async()=>{try{body.append('audio',await meetingAudioWav(blob),'segment.wav');await api.post(`${baseUrl}/transcription/audio`,body,options);}catch(e){onHint?.(e.response?.data?.error?.message||'Audio could not be saved. Transcription is paused; retry when connected.');stop({drop:true});}finally{queued--;}});
      }
      settleSegment?.();settleSegment=null;if(wanted)void poll();
    };
    active.onerror=()=>{onHint?.('Microphone recording was interrupted. Check your microphone and resume.');stopSegment(true);};
    active.start();onCapturing?.(true);onHint?.('Transcription is on. Either participant can pause it.');
    segmentTimer=setTimeout(()=>stopSegment(),10000);
    return finished;
  }
  async function poll(){
    if(!wanted||polling)return;polling=true;
    try{
      const {data}=await api.get(`${baseUrl}/transcription`,{...options,params:{capture:'1'}});currentState=data;onState?.(data);
      if(data.finishing){const heartbeat=setInterval(()=>{void api.get(`${baseUrl}/transcription`,{...options,params:{capture:'1'}}).catch(()=>{});},10000);try{await flush();await api.post(`${baseUrl}/transcription/control`,{action:'drained'},options);onHint?.('Transcript saved. Recording has finished.');}finally{clearInterval(heartbeat);}return;}
      if(!data.allowed||data.paused||data.stopped){stopSegment(true);onHint?.(data.reason||(data.stopped?'Transcription stopped.':data.requested?'Transcription paused.':'Waiting to start transcription.'));
        if(isHost&&data.allowed&&!data.requested&&!data.stopped){const response=await api.post(`${baseUrl}/transcription/control`,{action:'start'},options);currentState=response.data;onState?.(currentState);}
      }
      if(wanted&&currentState.allowed&&!currentState.paused&&!currentState.stopped){
        const available=await getStream?.();if(!available?.getAudioTracks?.().some(t=>t.readyState==='live'&&t.enabled))stopSegment(true);
        else if(!recorder)void beginSegment().catch(()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;onCapturing?.(false);onHint?.('Unable to record this microphone. Check its permissions and try again.');});
      }
    }catch(e){stopSegment(true);onHint?.(e.response?.data?.error?.message||'Waiting for consent and a connection before transcribing.');}
    finally{polling=false;}
  }
  function start(){if(typeof MediaRecorder==='undefined'){onHint?.('Audio recording is not supported by this browser.');return false;}wanted=true;if(!timer)timer=setInterval(poll,1500);void poll();return true;}
  function stop({drop=false}={}){wanted=false;clearInterval(timer);timer=null;stopSegment(drop);}
  async function control(action){if(action==='pause'||action==='stop')stopSegment(true);const{data}=await api.post(`${baseUrl}/transcription/control`,{action},options);currentState=data;onState?.(data);onHint?.(data.paused?'Transcription paused.':'Transcription resumed.');if(!wanted)start();return data;}
  async function flush(){const finished=recorder?new Promise(resolve=>{const previous=settleSegment;settleSegment=()=>{previous?.();resolve();};}):null;stop();if(finished)await finished;await pending;}
  return {start,stop,control,flush};
}
