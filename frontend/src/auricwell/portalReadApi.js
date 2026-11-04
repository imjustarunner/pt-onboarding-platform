// Per-component transport: the staff session and global API identity never change.
export function portalReadApi(api,{clientId,userId,agencyId}) {
  const root=`/portal-admin/clients/${clientId}/accounts/${userId}/read`;
  const rejected=()=>Promise.reject(new Error('Portal View as is read-only.'));
  function get(url,options={}) {
    let resource,id;
    const prefix=`/guardian-portal/clients/${clientId}`;
    if(url===`${prefix}/intake-documents`)resource='intake-documents';
    if(url===`${prefix}/shared-files`)resource='shared-files';
    if(url===`/assessment-deliverables/clients/${clientId}/shared`)resource='assessments';
    if(url==='/clinical-forms/portal' && Number(options.params?.clientId)===Number(clientId))resource='forms';
    const form=url.match(/^\/clinical-forms\/portal\/(\d+)$/);if(form){resource='form';id=form[1];}
    if(url==='/family-billing/balances')resource='balances';
    if(url==='/family-billing/receipts')resource='receipts';
    let match=url.match(/^\/guardian-portal\/clients\/(\d+)\/intake-documents\/(\d+)\/download-url$/);
    if(match&&Number(match[1])===Number(clientId)){resource='intake-download';id=match[2];}
    match=url.match(/^\/guardian-portal\/clients\/(\d+)\/enrollment-copies\/(\d+)\/download$/);
    if(match&&Number(match[1])===Number(clientId)){resource='enrollment-copy';id=match[2];}
    match=url.match(/^\/guardian-portal\/clients\/(\d+)\/shared-files\/(\d+)$/);
    if(match&&Number(match[1])===Number(clientId)){resource='shared-file';id=match[2];}
    if(!resource)return rejected();
    return api.get(root,{...options,params:{agencyId,resource,...(id?{id}:{})}});
  }
  function post(url,body,options={}) {
    const match=url.match(/^\/assessment-deliverables\/(\d+)\/export$/);
    if(match&&body?.format==='pdf')return api.get(root,{...options,params:{agencyId,resource:'assessment-download',id:match[1]}});
    return rejected();
  }
  return {get,post,put:rejected,patch:rejected,delete:rejected};
}
