const views=new Set(['home','calendar','tasks','mywork','noteaid','contacts','presence']);
const id=value=>/^[1-9]\d*$/.test(String(value || ''))?String(value):undefined;
/** Keep supported, authorized app destinations in this signed-in mobile workspace. */
export function mobileLinkTarget(href,{workspaceLoginUrl,currentOrigin='https://auricwell.com'}={}) {
  let url,workspace;try{url=new URL(href,currentOrigin);workspace=workspaceLoginUrl?new URL(workspaceLoginUrl):null;}catch{return null;}
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password)return null;
  if(url.origin!=='https://auricwell.com' && url.origin!==workspace?.origin)return null;
  const query=url.searchParams,path=url.pathname;
  const commentQuery=()=>({secureSessionComments:query.get('secureSessionComments')==='today'?'today':undefined,secureCommentAppointmentId:id(query.get('secureCommentAppointmentId')),secureCommentClientId:id(query.get('secureCommentClientId'))});
  if(/^\/mobile(?:\/workspace)?\/?$/.test(path)){
    return {path:'/mobile/workspace',query:{view:views.has(query.get('view'))?query.get('view'):'home',suite:query.get('suite') || undefined,conversationId:id(query.get('conversationId')),threadId:id(query.get('threadId')),parentId:id(query.get('parentId')),messageId:id(query.get('messageId')),secure:query.get('secure')==='1'?'1':undefined,...commentQuery()}};
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
