const memory=new Map();
const key=id=>`team-meeting-personal-access:${Number(id)}`;
export function saveTeamMeetingAccess(access){
 if(!Number(access?.eventId)||!access.token||!Number(access.expiresAt))throw new Error('Invalid meeting invitation.');
 memory.set(Number(access.eventId),access);try{sessionStorage.setItem(key(access.eventId),JSON.stringify(access));}catch{/* per-tab memory remains available */}
}
export function teamMeetingAccessFor(eventId){
 const id=Number(eventId);let access=memory.get(id);
 if(!access){try{access=JSON.parse(sessionStorage.getItem(key(id))||'null');}catch{return null;}}
 if(!access?.token||Number(access.eventId)!==id||Number(access.expiresAt)<=Date.now())return null;return access;
}
export function attachTeamMeetingAccess(config){
 if(config.skipTeamMeetingAccess)return config;
  const pageRef = /\/join\/team-meeting\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  if (pageRef && !/^\d+$/.test(pageRef)) return config;
 const url = String(config.url || '');
 let id=/^\/team-meetings\/(?:join-info\/)?(\d+)(?:\/|$)/.exec(url)?.[1];
 if (url === '/meeting-agendas') {
  const input = String(config.method || 'get').toLowerCase() === 'get' ? config.params : config.data;
  if (input?.meetingType === 'provider_schedule_event') id = input.meetingId;
 } else if (/^\/meeting-agendas\/\d+\/items(?:\/\d+|\/bulk)?$/.test(url)) {
  id = pageRef;
 }
 const access=id&&teamMeetingAccessFor(id);
 if(access){config.headers||={};config.headers['X-Team-Meeting-Access']=access.token;config.skipAuthRedirect=true;}return config;
}
