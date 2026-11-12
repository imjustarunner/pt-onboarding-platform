import {expect,it} from 'vitest';import {mobileLinkTarget} from '../mobileLinks.js';
const options={workspaceLoginUrl:'https://app.itsco.health/login'};
it('opens supported organization message links within the retained mobile sign-in',()=>{expect(mobileLinkTarget('https://app.itsco.health/messages?channel=secure&threadId=72',options)).toEqual({path:'/mobile/workspace',query:{view:'home',suite:'secure',threadId:'72',conversationId:undefined,parentId:undefined,messageId:undefined,secure:'1'}});});
it('does not accept another tenant, injected credentials, or unsafe protocols as an app link',()=>{for(const href of ['https://app.other.test/messages?threadId=1','javascript:alert(1)','https://user:pass@app.itsco.health/messages'])expect(mobileLinkTarget(href,options)).toBeNull();});
it('keeps destination IDs server-validated and excludes unsupported full-app pages',()=>{expect(mobileLinkTarget('https://app.itsco.health/messages?threadId=invalid',options).query.threadId).toBeUndefined();expect(mobileLinkTarget('https://app.itsco.health/admin/clients/12',options)).toBeNull();});

const nlu={workspaceLoginUrl:'https://app.nextleveluplcc.com/nlu-qa-demo/login'};
it.each(['students','tutoring-profile','childcare'])('retains the signed-in mobile service destination %s',view=>{
 const target=mobileLinkTarget(`https://auricwell.com/mobile/workspace?view=${view}&shiftId=27`,nlu);
 expect(target.path).toBe('/mobile/workspace');expect(target.query.view).toBe(view);
 expect(target.query.shiftId).toBe(view==='childcare'?'27':undefined);
});
it.each(['students','tutoring-profile','childcare'])('maps the exact current organization service path %s',view=>{
 const target=mobileLinkTarget(`https://app.nextleveluplcc.com/nlu-qa-demo/${view}?shiftId=27`,nlu);
 expect(target).toEqual({path:'/mobile/workspace',query:{view,...(view==='childcare'?{shiftId:'27'}:{})}});
});
it('opens a childcare reminder on its exact shift without forwarding punch, status or bearer controls',()=>{
 const target=mobileLinkTarget('https://app.nextleveluplcc.com/nlu-qa-demo/childcare?shiftId=27&action=clock-out&status=canceled&token=foreign&sessionToken=foreign&userId=99&agencyId=450&returnUrl=https://other.test',nlu);
 expect(target).toEqual({path:'/mobile/workspace',query:{view:'childcare',shiftId:'27'}});
 expect(Object.keys(target.query)).toEqual(['view','shiftId']);
});
it.each(['0','-1','01','1.2','1e2','abc','27/clock-in','9007199254740992'])('does not retain an invalid exact childcare shift ID: %s',value=>{
 for(const href of [`https://auricwell.com/mobile/workspace?view=childcare&shiftId=${encodeURIComponent(value)}`,`https://app.nextleveluplcc.com/nlu-qa-demo/childcare?shiftId=${encodeURIComponent(value)}`])
  expect(mobileLinkTarget(href,nlu).query.shiftId).toBeUndefined();
});
it('does not carry a childcare shift into an unrelated or clinical mobile destination',()=>{
 for(const view of ['home','calendar','mywork','noteaid','unsupported'])expect(mobileLinkTarget(`https://auricwell.com/mobile/workspace?view=${view}&shiftId=27`,nlu).query).not.toHaveProperty('shiftId');
 expect(mobileLinkTarget('https://app.nextleveluplcc.com/nlu-qa-demo/clinical-notes?shiftId=27',nlu)).toBeNull();
});
it.each([
 'https://other.test/nlu-qa-demo/childcare?shiftId=27',
 'https://app.nextleveluplcc.com/nlu-other/childcare?shiftId=27',
 'https://app.nextleveluplcc.com/nlu-qa-demo/childcare/27/clock-in',
 'https://app.nextleveluplcc.com/nlu-qa-demo/admin/childcare?shiftId=27',
 'https://app.nextleveluplcc.com/nlu-qa-demo/childcare/../clinical-notes?shiftId=27',
 'https://user:pass@app.nextleveluplcc.com/nlu-qa-demo/childcare?shiftId=27',
 'javascript:alert(1)'
])('rejects an untrusted host, foreign organization or unsupported childcare path',href=>{
 expect(mobileLinkTarget(href,nlu)).toBeNull();
});
it('keeps unscoped main-app service links scoped to an unscoped workspace login',()=>{
 expect(mobileLinkTarget('https://app.itsco.health/childcare?shiftId=27',options)).toEqual({path:'/mobile/workspace',query:{view:'childcare',shiftId:'27'}});
 expect(mobileLinkTarget('https://app.nextleveluplcc.com/childcare?shiftId=27',nlu)).toBeNull();
});

import {createRouter,createMemoryHistory} from 'vue-router';import {backInMobile,trackMobileNavigation} from '../mobileNavigation.js';
it('returns one step at a time with native memory history and preserves the selected category',async()=>{
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/mobile/workspace?view=home&suite=threads');trackMobileNavigation(router);
 await router.push('/mobile/workspace?view=home&suite=threads&threadId=10&parentId=100');
 backInMobile(router,{path:'/mobile/workspace',query:{view:'home'}});await new Promise(resolve=>setTimeout(resolve,0));expect(router.currentRoute.value.query.suite).toBe('threads');expect(router.currentRoute.value.query.threadId).toBeUndefined();
});
