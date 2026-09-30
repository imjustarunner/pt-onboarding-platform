export function composerUrl(router, { quickView = false, session = '', organizationSlug: suppliedSlug, ...query } = {}) {
  const organizationSlug = suppliedSlug || router.currentRoute?.value?.params?.organizationSlug;
  const name = quickView ? 'QuickViewEmailComposer' : organizationSlug ? 'OrganizationEmailComposer' : 'EmailComposer';
  return router.resolve({name,params:!quickView && organizationSlug ? {organizationSlug} : {},query}).href;
}
export function openEmailComposer(router, context = {}) {
  const detail={...context,organizationSlug:router.currentRoute?.value?.params?.organizationSlug};
  const event=new CustomEvent('open-email-composer',{detail,cancelable:true});
  window.dispatchEvent(event);
  if(event.defaultPrevented)return;
  // Standalone surfaces can still use a popup when the dock is not mounted.
  const url=composerUrl(router,detail);
  const popup=window.open('','_blank','popup,width=1100,height=850,resizable=yes,scrollbars=yes');
  if(!popup){window.location.assign(url);return;}
  if(context.quickView && context.session && context.session!=='cookie')popup.sessionStorage.setItem('plottwist.quickViewSession',context.session);
  popup.location.replace(url);
}
