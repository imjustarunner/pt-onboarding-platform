// Verify the provisioned accounts through normal shared-platform authentication.
// The current AuricWell UI uses these same credentials, not the independent prototype API.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { request, chromium } from 'playwright';
const privatePath=fileURLToPath(new URL('../../../secrets/auricwell-qa/credentials.json',import.meta.url));
const receipt=JSON.parse(fs.readFileSync(privatePath,'utf8'));
const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const baseURL=option('base-url')||'https://auricwell.com';
const selected=option('account');
const apiOnly=process.argv.includes('--api-only');
const frontendOrigin=option('frontend-origin');
const results=[];
for(const account of receipt.accounts.filter(a=>!selected||a.key===selected)) {
  const result={account:account.key,baseURL};
  const client=await request.newContext({baseURL,extraHTTPHeaders:{Origin:baseURL}});
  let browser;
  try {
    const login=await client.post('/api/auth/login',{data:{email:account.platformUsername,password:account.platformPassword,organizationSlug:receipt.agencySlug}});
    result.loginStatus=login.status(); assert.equal(login.status(),200,'Login failed');
    const signed=await login.json();
    result.role=signed.user?.role; result.userId=signed.user?.id;
    const expectedRole=account.key==='setup'?'admin':account.key;
    assert.equal(result.role,expectedRole,'Unexpected role');
    const headers={Authorization:`Bearer ${signed.token}`};
    const listing=await client.get('/api/auricwell-preview',{headers});
    result.practiceListStatus=listing.status(); assert.equal(listing.status(),200,'Workspace list failed');
    const list=await listing.json();
    result.practiceSlugs=list.practices?.map(p=>p.slug);
    assert.deepEqual(result.practiceSlugs,[receipt.agencySlug],'Unexpected practice scope');
    const context=await client.get(`/api/auricwell-preview/context?slug=${receipt.agencySlug}`,{headers});
    assert.equal(context.status(),200,'Workspace context failed');
    const body=await context.json();
    assert.equal(body.qaWorkspace,true); assert.equal(body.actor.role,expectedRole);
    const agencyId=body.practice.id;
    // Only use the provisioned synthetic school as the out-of-scope target.
    const denied=await client.get('/api/auricwell-preview/context?slug=auricwell-qa-demo-school',{headers});
    result.otherPracticeDenied=denied.status(); assert.equal(denied.status(),404);
    const scopedHeaders={...headers,'X-AuricWell-Practice':String(agencyId)};
    for(const endpoint of ['tasks','notifications']) {
      const response=await client.get(`/api/auricwell-preview/${endpoint}`,{headers:scopedHeaders});
      result[`${endpoint}Status`]=response.status();
      assert.equal(response.status(),200,`${endpoint} unavailable`);
      const payload=await response.json();
      assert(Array.isArray(endpoint==='tasks'?payload.tasks:payload.items));
    }
    const mismatch=await client.get('/api/clients?agencyId=451',{headers:scopedHeaders});
    result.crossAgencyDenied=mismatch.status(); assert.equal(mismatch.status(),403);
    const announcements=await client.get('/api/auricwell-preview/toasts',{headers:scopedHeaders});
    result.announcementManagementDenied=announcements.status(); assert.equal(announcements.status(),403);
    if(account.key==='support') {
      const draft=await client.post('/api/clinical-notes/drafts',{headers:scopedHeaders,data:{agencyId}});
      result.supportClinicalWriteDenied=draft.status(); assert.equal(draft.status(),403);
    }
    if(!apiOnly) {
      browser=await chromium.launch({headless:true,...(fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{channel:'chrome'}:{})});
      const browserContext=await browser.newContext({storageState:await client.storageState(),viewport:{width:1440,height:1000}});
      if(frontendOrigin) {
        // Load real candidate HTML/assets while retaining live same-origin APIs.
        await browserContext.route('**/*',async route=>{
          const url=new URL(route.request().url());
          if(url.origin!==baseURL || url.pathname.startsWith('/api/')) return route.continue();
          const path=url.pathname.startsWith('/app/')?`/auricwell${url.pathname}`:url.pathname;
          const response=await route.fetch({url:frontendOrigin+path+url.search});
          return route.fulfill({response});
        });
        result.frontendCandidate=frontendOrigin;
      }
      const page=await browserContext.newPage();
      const appBase=new URL(baseURL).hostname==='auricwell.com'?'/app':'/auricwell/app';
      await page.goto(`${baseURL}${appBase}/${receipt.agencySlug}`,{waitUntil:'networkidle',timeout:60000});
      const bodyText=await page.locator('body').innerText();
      result.pageShowsQa=bodyText.includes('QA workspace')&&bodyText.includes(expectedRole);
      assert.equal(result.pageShowsQa,true,'QA workspace did not render');
      assert.equal(bodyText.includes('Superadmin preview'),false);
      assert.match(bodyText,/Good (morning|afternoon|evening),/);
      assert.equal(bodyText.includes('Preview availability'),false);
      assert.equal(await page.locator('.aw-overview .aw-error').count(),0,'Dashboard data failed to load');
      assert.equal(await page.locator('.aw-sidebar-brand img').evaluate(img=>img.complete&&img.naturalWidth>0),true,'Brand mark failed to load');
      const directory=fileURLToPath(new URL('../../../deliverables/auricwell-qa',import.meta.url));
      fs.mkdirSync(directory,{recursive:true});
      await page.screenshot({path:`${directory}/${account.key}-workspace.png`,fullPage:true});
      if(account.key==='support') {
        const nav=await page.getByRole('navigation',{name:'Practice navigation'}).innerText();
        assert.equal(/Notes & Documentation|Billing|Announcements/.test(nav),false);
        await page.setViewportSize({width:390,height:844});
        await page.reload({waitUntil:'networkidle'});
        await page.getByText('QA workspace ·',{exact:false}).waitFor();
        await page.screenshot({path:`${directory}/support-workspace-mobile.png`,fullPage:true});
        await page.goto(`${baseURL}${appBase}/${receipt.agencySlug}/documentation`,{waitUntil:'networkidle'});
        result.supportDocumentationDenied=(await page.locator('body').innerText()).includes('Access restricted');
        assert.equal(result.supportDocumentationDenied,true);
      }
    }
  }catch(error){result.error=error.message;}
  finally{await browser?.close();await client.dispose();}
  results.push(result); console.log(JSON.stringify(result));
}
receipt.accessVerification={at:new Date().toISOString(),results:[...(receipt.accessVerification?.results||[]).filter(r=>!results.some(n=>n.account===r.account)),...results]};
fs.writeFileSync(privatePath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
if(results.some(r=>r.error))process.exitCode=1;
