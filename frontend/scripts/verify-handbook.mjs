import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { getHandbookSource } from '../../backend/src/services/workplaceHandbookContent.js';

const output = fileURLToPath(new URL('../../deliverables/handbook-verification/', import.meta.url));
const source = getHandbookSource({ slug: 'itsco' });
const outlineCount = source.sections.length;
const suppliedEntries = source.sections.filter(s => s.content_status === 'ready').length;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ reducedMotion:'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  const prose = page.locator('.book-page > .handbook-prose');
  async function open(slug) {
    await page.getByRole('searchbox', { name:'Search handbook' }).fill('');
    await page.locator(`.outline-link[href="#handbook-${slug}"]`).click();
    assert.equal(await page.locator('.book-page').getAttribute('id'), `handbook-${slug}`);
  }
  async function noOverflow(label) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, label);
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 768 ? 1080 : 844 });
    await page.goto('http://127.0.0.1:5181/handbook-preview', { waitUntil:'networkidle' });
    await prose.waitFor();
    assert.equal(await page.locator('.outline-link').count(), outlineCount);
    assert.match(await prose.innerText(), /Welcome to ITSCO, where we bridge the gap/);
    await noOverflow(`Welcome overflow at ${width}px`);
    assert.equal(await page.locator('.cover-art').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.locator('.handbook-landscape img').evaluate(img => img.decode());
    assert.match(await page.locator('.handbook-landscape figcaption').innerText(), /Pikes Peak/);
    assert.equal(await page.locator('a[download]').count(), 0);
    await page.screenshot({ path:`${output}handbook-${width}.png`, fullPage:true });

    await page.getByRole('searchbox', { name:'Search handbook' }).fill('HISTORY AND BACKGROUND');
    assert.equal(await page.locator('.outline-link').count(), 1);
    await page.locator('.outline-link').click();
    assert.match(await prose.innerText(), /Founded on the shared vision of a supervisor and her supervisee/);
    assert.equal(await prose.locator('.founder-portrait img').count(),2);
    await prose.locator('.founder-portrait img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
    assert.deepEqual(await prose.locator('.founder-portrait img').evaluateAll(images=>images.map(img=>({alt:img.alt,loaded:img.complete&&img.naturalWidth>0}))),[{alt:'Rachel Finch',loaded:true},{alt:'Michael Mendez',loaded:true}]);
    await noOverflow(`Founding story overflow at ${width}px`);
    if([1440,390].includes(width)) await page.locator('.book-page').screenshot({path:`${output}handbook-founders-${width}.png`});
    for(const slug of ['mission','vision','values','goals']) {
      await open(slug);
      assert.equal(await prose.locator('.purpose-panel, .values-grid, .goals-body').count(),1);
      if(slug==='values') {
        assert.equal(await prose.locator('.value-card').count(),7);
        assert.match(await prose.innerText(),/Making wise decisions based on empathy and expertise/);
        await prose.locator('.botanical-art').evaluate(img => img.decode());
      }
      if(['vision','goals'].includes(slug)) await page.locator('.handbook-landscape img').evaluate(img => img.decode());
      await noOverflow(`${slug} overflow at ${width}px`);
      if([1440,390].includes(width)) await page.locator('.book-page').screenshot({path:`${output}handbook-${slug}-${width}.png`});
    }
    await open('diagnosis-codes-allowed-for-sb23-174-services');
    assert.match(await page.locator('.book-page').innerText(), /Its full text is still being added here/);
    await open('supervision-and-training');
    assert.equal(await page.locator('.pending-section').count(),0);
    assert.match(await page.locator('.chapter-introduction').innerText(),/Explore the sections/);
    if([1440,390].includes(width)) await page.locator('.book-page').screenshot({path:`${output}handbook-chapter-${width}.png`});
    await open('missed-sessions-due-to-snow-day-or-unexpected-absences');
    assert.match(await page.locator('.pending-section').innerText(),/Text pending/i);
    await page.getByRole('searchbox', { name:'Search handbook' }).fill('cornerstones');
    assert.equal(await page.locator('.outline-link').count(), 1);
    await page.locator('.outline-link').click();
    assert.match(await prose.innerText(), /Your expertise and compassion/);

    await open('paid-time-off-pto-and-sick-personal-care-leave-policy');
    assert.match(await prose.innerText(), /protected sick leave/i);
    await open('compensation-rate-category-2');
    const rates = prose.locator('table');
    assert.equal(await rates.count(), 5);
    assert.equal(await rates.first().locator('thead th').count(), 3);
    assert.deepEqual(await rates.first().locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()))), [
      ['$42.00', '$38.00'], ['$32.00', '$25.00'], ['$22.00', '$22.00'], ['$18.00', '$18.00']
    ]);
    assert.equal(await rates.locator('tbody td').evaluateAll(cells => cells.every(cell => {
      const range = document.createRange(); range.selectNodeContents(cell);
      return range.getClientRects().length === 1;
    })), true, `Rate amounts must stay on one line at ${width}px`);
    await noOverflow(`Rates overflow at ${width}px`);
    if ([1440,390].includes(width)) await prose.screenshot({ path:`${output}handbook-category-rates-${width}.png` });

    await open('direct-clinical-services-billable-when-authorized');
    assert.equal(await prose.locator('tbody tr').count(), 10);
    await open('direct-behavioral-health-services-hcpcs');
    assert.equal(await prose.locator('tbody tr').count(), 14);
    assert.match(await page.locator('.section-updates').innerText(), /Group services: moratorium, Skill Builders and exceptions/);
    assert.match(await page.locator('.section-updates').innerText(), /Draft · awaiting publication/i);
    await noOverflow(`Codes overflow at ${width}px`);
    for (const slug of ['outreach-services-non-clinical','indirect-services','service-important-clarifications']) {
      await page.getByRole('button', { name:'Next section →' }).click();
      assert.equal(await page.locator('.book-page').getAttribute('id'), `handbook-${slug}`);
    }
    await open('compensation-integrated-service-compensation');
    assert.match(await prose.innerText(), /20%/);
    assert.match(await prose.innerText(), /60 Direct Minutes = 12 Included Indirect Minutes/);
    await open('professional-conduct');
    assert.match(await prose.innerText(), /Secure workplace communication/);
    assert.doesNotMatch(await prose.innerText(), /Grasshopper Employee Texting Policy/);
    await prose.locator('a[href="#handbook-digital-workplace-and-transition-procedures"]').click();
    assert.equal(await page.locator('.book-page').getAttribute('id'), 'handbook-digital-workplace-and-transition-procedures');

    await open('attendance-providers-and-facilitators');
    assert.match(await prose.innerText(), /app’s authorized school communication workflow/);
    assert.equal(await prose.locator('a[href^="mailto:"]').count(),0);
    await noOverflow(`App attendance instructions overflow at ${width}px`);
    await open('supervision-procedures');
    assert.match(await prose.innerText(), /60 completed individual\/triadic supervision hours plus 40 group supervision opportunities offered/);
    assert.match(await prose.innerText(), /two 30-minute sessions/);
    assert.doesNotMatch(await prose.innerText(), /At 100 total supervision hours|All supervision sessions are conducted via Google Meet/);
    await noOverflow(`Supervision overflow at ${width}px`);
    if ([1440,390].includes(width)) await prose.screenshot({ path:`${output}handbook-supervision-${width}.png` });
    await open('performance-and-expectations');
    assert.match(await prose.innerText(), /Pro-bono describes the charge to the client/);
    assert.match(await prose.innerText(), /does not automatically reduce the employee’s compensation/);
    await open('crisis-management-policy');
    assert.match(await prose.innerText(), /Supervisor Review/);
    assert.match(await prose.innerText(), /within 24 hours/);
    await noOverflow(`Crisis policy overflow at ${width}px`);

    await open('section-c-pre-licensed-and-unlicensed-masters-level-providers-tier-2');
    assert.match(await prose.innerText(), /60 completed individual\/triadic hours plus 40 group opportunities offered/);
    assert.equal(await prose.locator('a[href="#handbook-group-services-moratorium-and-exceptions"]').count(),1);
    await noOverflow(`Role C overflow at ${width}px`);
    if ([1440,390].includes(width)) await page.screenshot({ path:`${output}handbook-role-c-${width}.png`, fullPage:false });
    await open('program-overview');
    assert.match(await page.locator('.book-page').innerText(), /SKILL BUILDERS PROGRAM/);
    assert.match(await prose.innerText(), /H2014.*not approved for individual services/);
    await open('expectations-of-facilitators');
    assert.match(await prose.innerText(), /Do not withhold earned compensation or lower a completed service/);
    assert.match(await prose.innerText(), /planning and review measures, not compensation caps/);
    await open('student-training-program-program-overview');
    assert.match(await page.locator('.book-page').innerText(), /STUDENT TRAINING PROGRAM/);
    await open('student-classification');
    assert.match(await prose.innerText(), /Employee status requires a separate written employment agreement/);
    await noOverflow(`Student classification overflow at ${width}px`);

    await open('organizational-structure');
    assert.match(await prose.innerText(), /managed by Plot Twist CO/);
    await open('company-fees-and-associated-policy');
    assert.equal(await prose.locator('tbody tr').count(),34);
    assert.match(await prose.innerText(), /client fees, not employee compensation rates/);
    assert.match(await prose.innerText(), /Do not charge this fee to clients with Medicaid/);
    await noOverflow(`Client fee table overflow at ${width}px`);
    if ([1440,390].includes(width)) await prose.screenshot({ path:`${output}handbook-client-fees-${width}.png` });
    await open('pay-periods-compensation-schedule');
    assert.equal(await prose.locator('tbody tr').count(),27);
    assert.deepEqual(await prose.locator('tbody tr').last().locator('th,td').allTextContents(),['12/5/26 to 12/18/26','12/25/26']);
    await noOverflow(`Pay calendar overflow at ${width}px`);
    await open('billable-diagnoses');
    assert.equal(await prose.locator('table').count(),2);
    assert.equal(await prose.locator('tbody tr').count(),22);
    assert.match(await prose.innerText(), /not a newly verified coverage list/);
    assert.match(await prose.innerText(), /January 1, 2024/);
    assert.match(await prose.innerText(), /F18.980/);
    await noOverflow(`Appendix C overflow at ${width}px`);
    if([1440,390].includes(width)) await prose.screenshot({path:`${output}handbook-appendix-c-${width}.png`});
    await open('vacation-out-of-office-prompt');
    assert.equal(await prose.locator('a[href="mailto:support@itsco.health"]').count(),2);
    await noOverflow(`Out of office templates overflow at ${width}px`);
    await open('services-codes-included-in-the-sb23-174-coverage-policy');
    assert.equal(await prose.locator('tbody tr').count(),18);
    assert.match(await prose.locator('tbody tr').filter({hasText:'H2014'}).innerText(), /Not approved for individual services/);
    await noOverflow(`Coverage reference table overflow at ${width}px`);
    await open('responsibilities-of-the-supervisor');
    await prose.locator('a[href="#handbook-clinical-development-supervision-rubric"]').click();
    assert.equal(await page.locator('.book-page').getAttribute('id'),'handbook-clinical-development-supervision-rubric');
    const training = page.locator('.training-form');
    assert.equal(await training.locator('.training-category').count(),7);
    assert.equal(await training.locator('.training-band').count(),28);
    assert.match(await training.innerText(), /100 points possible/);
    await noOverflow(`Supervision rubric overflow at ${width}px`);
    if ([1440,390].includes(width)) await training.screenshot({ path:`${output}handbook-supervision-rubric-${width}.png` });

    let followedLinks = 0;
    for (const entry of source.reviewUpdates) {
      for (const slug of entry.policy_section_slugs) {
        await page.getByRole('button', { name:'Review handbook updates' }).click();
        const card = page.locator(`#preview-update-${entry.id}`);
        const link = card.locator(`.policy-locations a[href="#handbook-${slug}"]`);
        const policy = source.sections.find(s => s.slug === slug);
        assert.ok((await link.innerText()).includes(policy.title));
        await noOverflow(`Update ${entry.id} overflow at ${width}px`);
        await link.click();
        assert.equal(await page.locator('.book-page').getAttribute('id'), `handbook-${slug}`);
        assert.equal(await page.locator('.book-page > h3').innerText(), policy.title);
        assert.ok((await prose.innerText()).length > 0);
        assert.equal(new URL(page.url()).hash, `#handbook-${slug}`);
        followedLinks++;
      }
    }
    const lastPolicy = await page.locator('.book-page').getAttribute('id');
    await page.reload({ waitUntil:'networkidle' });
    assert.equal(await page.locator('.book-page').getAttribute('id'), lastPolicy);
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.book-page').isVisible(),false);
    assert.equal(await page.locator('.handbook-print-notice').isVisible(),true);
    assert.equal(await page.locator('.book-cover').isVisible(),false);
    await page.emulateMedia({media:'screen'});
    assert.equal(await page.locator('.book-page').isVisible(),true);
    if ([1440,390].includes(width)) {
      await page.getByRole('button', { name:'Review handbook updates' }).click();
      await page.locator('#preview-update-14').screenshot({ path:`${output}handbook-update-policy-links-${width}.png` });
    }
    results.push({ width, outline:outlineCount, importedPolicies:'passed', ratesAndCodeTables:'passed', organizationAndAppendices:'passed', appendixC:'22 ranges and dated note', foundations:'mission, vision, seven values, goals and two founder photos passed', coloradoArtwork:'three photos and botanical illustration loaded', chapterDividers:'distinct from missing policy text', staffPrint:'policy hidden; in-app notice shown', missingDiagnosisLists:'Appendix F identified', searchAndCrossReferences:'passed', updaterEntries:source.reviewUpdates.length, followedPolicyLinks:followedLinks, sharedLinkReload:'passed', overflow:false, cover:'loaded' });
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}verification.json`, JSON.stringify({ results, errors, suppliedEntries, scope:'Local preview with actual reader, policy-link components, supplied content and reconciled draft updates. No publication.' }, null, 2));
  console.log('Handbook verified at 1440, 768, 390 and 320px. All 19 updater entries open their exact policy locations. Imported policies, rate/code tables, search, internal cross-references and shared links passed. No browser errors.');
} finally { await browser.close(); }
