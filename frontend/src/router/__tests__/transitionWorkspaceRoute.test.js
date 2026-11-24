import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const source=fs.readFileSync(path.resolve(process.cwd(),process.cwd().endsWith('/frontend')?'src/router/index.js':'frontend/src/router/index.js'),'utf8');
// Exercise the actual navigation predicates without mounting the unrelated app
// bootstrap, branding requests and dozens of route components.
function redirectsAt(marker,overrides={}) {
 const middle=source.indexOf(marker);if(middle<0)throw Error('Guard marker missing');
 const start=source.lastIndexOf('if (',middle),end=source.indexOf(') {',middle);
 const expression=source.slice(start+4,end);
 const scope={agencyStore:{},authStore:{isAuthenticated:true,user:{role:'admin'}},to:{name:'PracticeTransition',path:'/practice-transition',meta:{requiresAuth:true}},platformHost:true,hostPortalEarly:null,routeWorkspaceSlug:'',allowUnscopedDashboard:false,allowUnscopedNotifications:false,allowUnscopedDocumentSigning:false,isSuperadminRole:role=>role==='super_admin',getDefaultOrganizationSlug:()=> 'itsco',userHasSlugAccess:()=>false,isSchoolCareBridgePath:()=>false,hasProviderMobileAccess:()=>true,isStandalonePwa:()=>true,isLikelyMobileViewport:()=>true,...overrides};
 return new Function(...Object.keys(scope),`return (${expression});`)(...Object.values(scope));
}
it('keeps the standalone route authenticated while the API enforces practice-specific manager access',()=>{
 const literal=source.match(/\{ path: '\/practice-transition'[^\n]+/)[0].replace(/,\s*$/,'');
 const route=new Function(`return (${literal});`)();
 expect(route.meta).toMatchObject({requiresAuth:true,practiceTransitionWorkspace:true});expect(route.meta.requiresRole).toBeUndefined();
});
it('prevents ordinary admin tenant-prefixing only for this independent workspace',()=>{
 const marker="authStore.user?.role !== 'super_admin' &&\n    to.meta.requiresAuth";
 expect(redirectsAt(marker)).toBe(true);
 expect(redirectsAt(marker,{to:{meta:{requiresAuth:true,practiceTransitionWorkspace:true}}})).toBe(false);
 expect(redirectsAt(marker,{authStore:{isAuthenticated:false,user:{role:'admin'}}})).toBe(false);
});
it('preserves the shell company and avoids wrong-host and mobile redirects for this workspace',()=>{
 const cases=[['if (platformHost && !hostPortalEarly',{authStore:{isAuthenticated:true,user:{role:'super_admin'}}}],['if (hostPortalEarly && authStore.isAuthenticated && !isSuperadminRole',{hostPortalEarly:'nlu'}],['hasProviderMobileAccess(authStore.user) &&\n',{}]];
 for(const [marker,context] of cases){expect(redirectsAt(marker,context)).toBe(true);expect(redirectsAt(marker,{...context,to:{path:'/practice-transition',meta:{requiresAuth:true,practiceTransitionWorkspace:true}}})).toBe(false);}
});
