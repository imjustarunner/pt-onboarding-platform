const serviceViews=new Set(['students','tutoring-profile','childcare']);
const views=new Set(['home','calendar','tasks','mywork','noteaid','contacts','presence','clients','exchange','support','livechat','applicants',...serviceViews]);
const id=value=>/^[1-9]\d*$/.test(String(value || ''))?String(value):undefined;
/** Keep supported, authorized app destinations in this signed-in mobile workspace. */
export function mobileLinkTarget(href,{workspaceLoginUrl,currentOrigin='https://auricwell.com'}={}) {
  let url,workspace;try{url=new URL(href,currentOrigin);workspace=workspaceLoginUrl?new URL(workspaceLoginUrl):null;}catch{return null;}
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password)return null;
  if(url.origin!=='https://auricwell.com' && url.origin!==workspace?.origin)return null;
  const query=url.searchParams,path=url.pathname;
  const shiftId=()=>{const value=id(query.get('shiftId'));return value&&Number.isSafeInteger(Number(value))?value:undefined;};
  const commentQuery=()=>({secureSessionComments:query.get('secureSessionComments')==='today'?'today':undefined,secureCommentAppointmentId:id(query.get('secureCommentAppointmentId')),secureCommentClientId:id(query.get('secureCommentClientId'))});
  if(/^\/mobile(?:\/workspace)?\/?$/.test(path)){
    const view=views.has(query.get('view'))?query.get('view'):'home';
    return {path:'/mobile/workspace',query:{view,suite:query.get('suite') || undefined,conversationId:id(query.get('conversationId')),threadId:id(query.get('threadId')),parentId:id(query.get('parentId')),messageId:id(query.get('messageId')),secure:query.get('secure')==='1'?'1':undefined,agencyId:id(query.get('agencyId')),listingId:id(query.get('listingId')),candidateId:id(query.get('candidateId')),chatId:/^[a-f0-9-]{36}$/i.test(query.get('chatId')||'')?query.get('chatId'):undefined,...(view==='childcare'?{shiftId:shiftId()}:{}),...commentQuery()}};
  }
  // Main-app reminders identify the current workspace by its exact login path.
  // Only retain a destination; the ordinary service adapters recheck membership,
  // shift assignment/status and own-pay access. URL flags never perform a punch.
  if(workspace && /\/login\/?$/.test(workspace.pathname)){
    const prefix=workspace.pathname.replace(/\/login\/?$/,'');
    for(const view of serviceViews)if(path.replace(/\/$/,'')===`${prefix}/${view}`)
      return {path:'/mobile/workspace',query:{view,...(view==='childcare'?{shiftId:shiftId()}: {})}};
  }
  if(/\/messages\/?$/.test(path))return {path:'/mobile/workspace',query:{view:'home',suite:query.get('channel')==='secure'?'secure':undefined,threadId:id(query.get('threadId')),conversationId:id(query.get('conversationId')),parentId:id(query.get('parentId')),messageId:id(query.get('messageId')),secure:query.get('channel')==='secure'?'1':undefined}};
  if(/\/(?:guardian|my-portal)\/?$/.test(path) && (query.get('secureSessionComments')==='today' || id(query.get('secureCommentAppointmentId'))))return {path:'/mobile/workspace',query:{view:'calendar',...commentQuery()}};
  if(/\/(?:my-schedule|schedule|calendar|appointments)\/?$/.test(path))return {path:'/mobile/workspace',query:{view:'calendar',...commentQuery()}};
  if(/\/(?:tasks|task-hub)\/?$/.test(path))return {path:'/mobile/workspace',query:{view:'tasks'}};
  if(/\/note-aid\/?$/.test(path))return {path:'/mobile/workspace',query:{view:query.has('workQueueId')?'mywork':'noteaid'}};
  return null;
}

// Closed query shape survives the normal family sign-in/Unlock redirect. No
// access credential, arbitrary URL or unrelated portal query is forwarded.
export function familySessionCommentQuery(query={}) {
  const appointmentId=id(query.secureCommentAppointmentId),clientId=id(query.secureCommentClientId);
  const today=query.secureSessionComments==='today'?'today':undefined;
  return Object.fromEntries(Object.entries({panel:appointmentId||today?'appointments':'family',secureSessionComments:today,secureCommentAppointmentId:appointmentId,secureCommentClientId:clientId,...(appointmentId&&clientId?{childId:clientId}: {})}).filter(([,v])=>v!==undefined));
}
