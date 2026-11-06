import {expect,it} from 'vitest';import {mobileLinkTarget} from '../mobileLinks.js';
const options={workspaceLoginUrl:'https://app.itsco.health/login'};
it('opens supported organization message links within the retained mobile sign-in',()=>{expect(mobileLinkTarget('https://app.itsco.health/messages?channel=secure&threadId=72',options)).toEqual({path:'/mobile/workspace',query:{view:'home',suite:'secure',threadId:'72',conversationId:undefined,parentId:undefined,messageId:undefined,secure:'1'}});});
it('does not accept another tenant, injected credentials, or unsafe protocols as an app link',()=>{for(const href of ['https://app.other.test/messages?threadId=1','javascript:alert(1)','https://user:pass@app.itsco.health/messages'])expect(mobileLinkTarget(href,options)).toBeNull();});
it('keeps destination IDs server-validated and excludes unsupported full-app pages',()=>{expect(mobileLinkTarget('https://app.itsco.health/messages?threadId=invalid',options).query.threadId).toBeUndefined();expect(mobileLinkTarget('https://app.itsco.health/admin/clients/12',options)).toBeNull();});

import {createRouter,createMemoryHistory} from 'vue-router';import {backInMobile,trackMobileNavigation} from '../mobileNavigation.js';
it('returns one step at a time with native memory history and preserves the selected category',async()=>{
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/mobile/workspace?view=home&suite=threads');trackMobileNavigation(router);
 await router.push('/mobile/workspace?view=home&suite=threads&threadId=10&parentId=100');
 backInMobile(router,{path:'/mobile/workspace',query:{view:'home'}});await new Promise(resolve=>setTimeout(resolve,0));expect(router.currentRoute.value.query.suite).toBe('threads');expect(router.currentRoute.value.query.threadId).toBeUndefined();
});
