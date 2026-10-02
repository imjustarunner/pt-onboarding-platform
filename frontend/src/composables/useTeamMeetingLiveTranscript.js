import { computed, onUnmounted, ref, watch } from 'vue';
import { createConsentedAudioCapture } from './consentedAudioCapture.js';

// Meeting audio uses the authenticated app and approved Cloud Speech service.
// Never send it through browser-managed cloud speech recognition.
export function useTeamMeetingLiveTranscript({eventId,enabled,getStream}={}) {
  const liveChunks=ref([]),transcriptHint=ref(''),capturing=ref(false),paused=ref(false),roomStopped=ref(false),stopMeta=ref(null);
  const eid=computed(()=>Number(eventId?.value ?? eventId ?? 0));
  const isEnabled=computed(()=>!!(enabled?.value ?? enabled));
  let capture=null,pending=Promise.resolve();
  function start(){
    if(capture || !eid.value || !isEnabled.value || paused.value || roomStopped.value)return;
    capture=createConsentedAudioCapture({baseUrl:`/team-meetings/${eid.value}`,getStream,listeningHint:'Transcription is on.',
      onHint:text=>{transcriptHint.value=text;},onCapturing:on=>{capturing.value=on;}});
    capture.start();
  }
  function stop(){capture?.stop({drop:true});capture=null;capturing.value=false;}
  async function flush(){
    const current=capture;capture=null;
    const previous=pending;
    pending=(async()=>{await previous;if(current)await current.flush();})();
    await pending;
    capturing.value=false;
  }
  async function stopAndFlush(){await flush();}
  async function pause(){paused.value=true;stop();transcriptHint.value='Transcript paused';}
  async function resume(){if(roomStopped.value)return;paused.value=false;start();}
  async function applyRoomStop(meta){roomStopped.value=true;stopMeta.value=meta || null;stop();transcriptHint.value='Transcription stopped.';}
  watch(()=>[isEnabled.value,eid.value],()=>{if(isEnabled.value)start();else void stopAndFlush();},{immediate:true});
  onUnmounted(()=>{void stopAndFlush();});
  return {capturing,paused,roomStopped,stopMeta,transcriptHint,livePreview:computed(()=>''),liveChunks,start,stop,pause,resume,applyRoomStop,stopAndFlush,flush};
}
