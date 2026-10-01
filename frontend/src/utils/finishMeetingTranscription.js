import api from '../services/api';
// Keep the video room mounted while each connected microphone uploads its last
// segment. Do not generate a note or disconnect the room with work still queued.
export async function finishMeetingTranscription(baseUrl) {
  const options={skipGlobalLoading:true,skipAuthRedirect:true};
  const {data:state}=await api.get(`${baseUrl}/transcription`,options);
  if(!state.requested)return;
  await api.post(`${baseUrl}/transcription/control`,{action:'finish'},options);
  for(let attempt=0;attempt<60;attempt++) {
    const {data}=await api.get(`${baseUrl}/transcription`,options);
    if(!data.pendingPublishers)return;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('A participant’s transcript is still saving. Wait a moment and end the session again.');
}
