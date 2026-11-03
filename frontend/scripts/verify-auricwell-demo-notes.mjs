// Focused check of the real Note Workspace with browser-only fictional records.
// Run against an existing local preview; all API requests are intercepted below.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '../../node_modules/playwright/index.mjs';

const base = (process.env.AURICWELL_DEMO_BASE || 'http://127.0.0.1:5194').replace(/\/$/, '');
const origin = new URL(base).origin;
const artifacts = process.env.AURICWELL_DEMO_ARTIFACT_DIR;
const analyticsPath = '/api/public/marketing-pages/auricwell/analytics/events';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, timezoneId: 'America/Denver' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], clinicalRequests = [], fixtureFailures = [], checks = [];
let analyticsRequests = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.text().includes('DEMO_FIXTURE')) fixtureFailures.push(message.text()); });
await context.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin === origin && url.pathname === analyticsPath && !url.search && request.method() === 'POST') {
    analyticsRequests++;
    return route.fulfill({ status: 204, body: '' });
  }
  clinicalRequests.push({ method: request.method(), url: request.url() });
  return route.abort();
});
if (artifacts) await mkdir(artifacts, { recursive: true });
const screenshot = async name => { if (artifacts) await page.screenshot({ path: join(artifacts, `notes-${name}.png`), fullPage: true }); };
const noteWorkspace = page.locator('.demo-doc-workspace');
const ownQueue = page.locator('[aria-label="My Work"] .na-wq-list:not(.na-wq-review-list)');
const notice = page.locator('.aw-demo-notice');
const assertNotice = async () => {
  await notice.waitFor();
  assert.match(await notice.innerText(), /Demo only: this does not sign or complete a note/);
  assert.match(await notice.innerText(), /Nothing is saved, submitted or sent/);
};
const libraryCounts = async () => page.locator('.cnl-status-tab').evaluateAll(tabs => Object.fromEntries(tabs.map(tab => [
  tab.textContent.includes('Signed') ? 'signed' : tab.textContent.includes('In progress') ? 'inProgress' : 'done',
  Number(tab.querySelector('em')?.textContent || 0)
])));
const waitForDraft = async (id, client) => {
  // The real workspace consumes draftId in its route. Verify the rendered client
  // and linked encounter, rather than requiring that launch parameter to remain.
  const sessionId = { 990131: 990191, 990132: 990192, 990133: 990193 }[id];
  assert(sessionId, `Unknown fictional draft ${id}`);
  await noteWorkspace.locator('.na-quick-session__cell--client').getByText(client, { exact: true }).waitFor();
  await noteWorkspace.locator('.na-output h2').waitFor();
  await noteWorkspace.locator('.draft-appointment-repair[aria-label="Linked appointment"]').getByText(new RegExp(`Clinical session #${sessionId}\\b`)).waitFor();
  assert.doesNotMatch(await noteWorkspace.innerText(), /Appointment linkage could not be checked|Failed to load|Could not load/);
};

try {
  await page.goto(`${base}/auricwell/demo#/meadowbrook/documentation`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Please choose a draft or a note from your My Work.', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="My Work"] .na-wq-item-btn').length === 3);
  assert.equal(await ownQueue.locator('.na-wq-item-btn').count(), 3);
  for (const name of ['Emerson Cole', 'Morgan Rivera', 'Jamie Stone']) assert.match(await ownQueue.innerText(), new RegExp(name));
  const initialCounts = await libraryCounts();
  assert.equal(initialCounts.inProgress, 3);
  assert.equal(initialCounts.signed, 16);
  await page.locator('.demo-doc-explanation > summary').click();
  assert.match(await page.locator('.demo-doc-context').innerText(), /optional AI assistance/);
  assert.match(await page.locator('.demo-doc-context').innerText(), /consented session transcript/);
  await page.locator('.demo-doc-explanation > summary').click();
  await screenshot('initial');
  checks.push('Initial choose-note prompt, three My Work drafts, sixteen historical signed examples, optional AI and consent copy');

  await ownQueue.getByRole('button', { name: /Emerson Cole/ }).click();
  await waitForDraft(990131, 'Emerson Cole');
  await noteWorkspace.getByRole('heading', { name: 'Clinician-authored note', exact: true }).waitFor();
  assert.match(await noteWorkspace.locator('.na-output').innerText(), /grounding exercise independently/);
  const ratings = noteWorkspace.locator('.na-obj-ratings');
  await ratings.waitFor();
  assert.match(await ratings.innerText(), /Use coping skills to navigate everyday stress/);
  assert.match(await ratings.innerText(), /Start 3 · previous 5 · goal 8/);
  assert.match(await noteWorkspace.locator('.draft-appointment-repair').innerText(), /Clinical session #990191/);
  assert.equal(await noteWorkspace.locator('.cnl--collapsed').count(), 0, 'Draft library stays open');
  assert.equal(await noteWorkspace.locator('.na-wq--collapsed').count(), 0, 'My Work stays open');
  await screenshot('draft');
  checks.push('My Work opens the matching client draft, linked encounter, manual note and rated treatment plan');

  await noteWorkspace.getByRole('button', { name: 'Save Draft', exact: true }).first().click();
  await assertNotice();
  assert.deepEqual(await libraryCounts(), initialCounts, 'Saving in the demo must not sign or complete a note');
  await page.getByRole('button', { name: 'Sign and open next (demo)', exact: true }).click();
  await waitForDraft(990132, 'Morgan Rivera');
  await noteWorkspace.getByRole('heading', { name: 'AI Generated Note', exact: true }).waitFor();
  await assertNotice();
  assert.deepEqual(await libraryCounts(), initialCounts, 'Sign-next changes the selected draft, not its status');
  assert.equal(await ownQueue.locator('.na-wq-item-btn').count(), 3);
  await screenshot('next-draft');
  checks.push('Save and sign-next show the explicit demo notice, preserve statuses and open the next optional-AI draft');

  await page.getByRole('tab', { name: 'Notes to co-sign (2)', exact: true }).click();
  await page.locator('[aria-label="My Work"] .na-wq-item--cosign').filter({hasText:'Finley Sage'}).locator('.na-wq-item-btn').click();
  const review = page.locator('.supervisor-review');
  await review.getByRole('heading', { name: 'Finley Sage', exact: true }).waitFor();
  assert.match(await review.innerText(), /Awaiting supervisor approval/);
  assert.match(await review.locator('.ratings').innerText(), /Treatment goals/);
  const ratingCells = await review.locator('.rating-row summary').first().locator('span,strong').allTextContents();
  assert.deepEqual(ratingCells.map(text => text.trim()), ['Goal 1 · objective 1', '2', '4', '5', '7']);
  const cosignQueue = page.locator('[aria-label="My Work"]');
  assert.match(await cosignQueue.innerText(), /Milo Chen/);
  assert.match(await cosignQueue.innerText(), /Finley Sage/);
  assert.match(await cosignQueue.innerText(), /Rowan Ellis/);
  await review.getByRole('button', { name: 'Signature details', exact: true }).click();
  assert.match(await review.getByRole('region', { name: 'Electronic signature details' }).innerText(), /Milo Chen/);
  await screenshot('supervisor');
  await review.getByTestId('supervisor-attestation').check();
  assert.equal(await review.getByTestId('cosign').isEnabled(), true);
  await review.getByTestId('cosign').click();
  await assertNotice();
  assert.match(await review.innerText(), /Awaiting supervisor approval/);
  assert.doesNotMatch(await review.locator('.signature-state').innerText(), /Supervisor approved/);
  checks.push('Real supervisor review opens Milo’s note with its service facts, author signature and per-client ratings; cosign is safely intercepted');

  await page.getByRole('button', { name: 'Sign and open next (demo)', exact: true }).click();
  await page.waitForURL(url => new URLSearchParams(url.hash.split('?')[1] || '').get('noteId') === '990182');
  await review.getByRole('heading', { name: 'Rowan Ellis', exact: true }).waitFor();
  await assertNotice();
  assert.match(await review.innerText(), /Awaiting supervisor approval/);
  assert.equal(await cosignQueue.locator('.na-wq-item--cosign').count(), 2, 'Both fictional notes remain pending');
  await screenshot('supervisor-next');
  checks.push('Supervisor sign-next selects Rowan’s note while both notes remain unsigned by the supervisor');

  assert.deepEqual(clinicalRequests, [], 'No clinical API request may leave the fictional demo');
  assert.deepEqual(fixtureFailures, [], 'Every exercised read must have a valid fictional fixture');
  assert.deepEqual(errors, [], 'No browser page errors');
  console.log(JSON.stringify({ result: 'PASS', checks, analyticsRequestsMocked: analyticsRequests, clinicalRequests: 0, fixtureFailures: 0, pageErrors: 0, ...(artifacts ? { artifacts } : {}) }, null, 2));
} catch (error) {
  await screenshot('failure').catch(() => {});
  console.error(JSON.stringify({ result: 'FAIL', url: page.url(), checks, errors, clinicalRequests, fixtureFailures, text: (await page.locator('body').innerText().catch(() => '')).slice(-3500) }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
