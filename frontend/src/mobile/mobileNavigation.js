const histories=new WeakMap();
export function trackMobileNavigation(router){
  if(histories.has(router))return histories.get(router);
  const trail=[];
  const remember=route=>{if(route.path!=='/mobile/workspace')return;const index=trail.lastIndexOf(route.fullPath);if(index>=0)trail.splice(index+1);else trail.push(route.fullPath);};
  remember(router.currentRoute.value);router.afterEach(remember);histories.set(router,trail);return trail;
}
export function backInMobile(router,fallback){
  const trail=trackMobileNavigation(router);
  if(trail.length>1)router.back();else return router.replace(fallback);
}
