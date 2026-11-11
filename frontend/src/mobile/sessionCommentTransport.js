import { dispatchFamilySharingNoticeRequired } from '../utils/familySharingNotice.js';
// Comment/notice requests and read-only message audience metadata use the current device session.
export function createMobileCommentTransport({base,http,headers}) {
  const target=(path,readOnly=false)=>{if(!(readOnly&&/^\/chat\/threads\/[1-9]\d*\/meta$/.test(path))&&!/^\/(?:secure-session-comments(?:\/|$)|secure-family-sharing-notice(?:\/|$))/.test(path)||/[?#]/.test(path))throw new Error('Unsupported secure comment request.');return base+path;};
  const run=promise=>promise.catch(error=>{dispatchFamilySharingNoticeRequired(error);throw error;});
  return {
    get:(path,config={})=>run(http.get(target(path,true),{...config,headers:headers(),withCredentials:true})),
    post:(path,body,config={})=>run(http.post(target(path),body,{...config,headers:headers(),withCredentials:true})),
    patch:(path,body,config={})=>run(http.patch(target(path),body,{...config,headers:headers(),withCredentials:true}))
  };
}
