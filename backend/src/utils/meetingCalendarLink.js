export const PERSONAL_JOIN_NOTICE = 'This email link identifies you. Do not share or forward it. Calendar links join as a guest unless you are signed in.';
export function sharedCalendarJoinUrl(session,personalUrl){
 const personal=new URL(personalUrl);
 if(!['https:','http:'].includes(personal.protocol))throw new Error('Invalid meeting URL.');
 const token=session.participant_join_token||session.join_token;
 if(!/^[\w-]{32}$/.test(String(token||'')))return null;
 const prefix=personal.pathname.replace(/\/join\/.*$/,'').replace(/\/$/,'');
 return `${personal.origin}${prefix}/join/${session.kind==='HUDDLE'?'team-meeting':'supervision'}/${encodeURIComponent(token)}`;
}
