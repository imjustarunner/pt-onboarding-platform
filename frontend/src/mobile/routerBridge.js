// The shared account store may resolve logout branding. Use this entry's router
// instead of bundling and initializing the full desktop application's routes.
let router=null;
export function registerMobileRouter(value){router=value;}
export default {get currentRoute(){return router?.currentRoute;}};
