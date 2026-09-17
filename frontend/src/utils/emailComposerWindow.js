export function openEmailComposer(router, { quickView = false, session = '', ...query } = {}) {
  const organizationSlug = router.currentRoute?.value?.params?.organizationSlug;
  const name = quickView ? 'QuickViewEmailComposer' : organizationSlug ? 'OrganizationEmailComposer' : 'EmailComposer';
  const url = router.resolve({ name, params: !quickView && organizationSlug ? { organizationSlug } : {}, query }).href;
  // Open synchronously in the click handler so browsers recognize the user gesture.
  const popup = window.open('', '_blank', 'popup,width=1100,height=850,resizable=yes,scrollbars=yes');
  if (!popup) { window.location.assign(url); return; }
  if (quickView && session && session !== 'cookie') popup.sessionStorage.setItem('plottwist.quickViewSession', session);
  popup.location.replace(url);
}
