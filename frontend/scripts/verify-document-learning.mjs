import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { documentTrainingDefinitions } from '../../backend/src/services/documentTrainingContent.js';
const output = fileURLToPath(new URL('../../deliverables/document-learning-verification/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const checks = [], errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message)); page.on('request', req => { if (req.url().includes('/preview-api')) requests.push({ url: req.url(), method: req.method(), body: req.postData() }); });
await page.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' ? route.continue() : route.abort(); });
const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
try {
  await page.request.post('http://127.0.0.1:5184/preview-api/reset');
  await page.goto('http://127.0.0.1:5184/itsco/my-learning'); await page.locator('.guide-course-grid article').first().waitFor(); await page.evaluate(() => document.fonts.ready);
  check(await page.locator('.guide-course-grid article').count() === 6, 'Six ITSCO guides in one reusable catalog');
  check((await page.locator('.guide-catalog').evaluate(el => getComputedStyle(el).fontFamily)).includes('Comfortaa'), 'ITSCO training uses Comfortaa');
  await page.screenshot({ path: output + 'desktop-catalog.png', fullPage: true });
  await page.getByRole('button', { name: 'On-demand · Your own time', exact: true }).click();
  const school = page.locator('.guide-course-grid article').filter({ hasText: 'School Practice Guide' });
  await school.getByRole('button', { name: 'Start optional practice', exact: true }).click(); await page.locator('.handbook-book').waitFor();
  check((await page.locator('.time-banner').innerText()).includes('Your own time'), 'Optional mode makes own-time status explicit');
  check(await page.getByRole('button', { name: 'Pause timer', exact: true }).count() === 0, 'No paid timer controls in optional practice');
  const schoolDef = documentTrainingDefinitions.find(d => d.documentKey === 'school-practice-guide');
  await page.locator('.learning-tabs button').nth(1).click(); check(await page.getByRole('button', { name: 'Check my answers', exact: true }).isDisabled(), 'Reading acknowledgment gates quiz submission');
  await page.locator('.learning-tabs button').first().click();
  await page.locator('.handbook-assistant summary').click(); await page.getByRole('button', { name: 'What must I do before seeing a new student?', exact: true }).click();
  await page.locator('.answer-policy-links a').first().waitFor(); await page.locator('.answer-policy-links a').first().click();
  check((await page.locator('.book-page').getAttribute('id')) === 'school-practice-guide-administrative-readiness', 'Question answer citation opens the actual guide section');
  for (let i = 0; i < schoolDef.requiredSections.length; i++) { await page.locator('.reading-plan li button').nth(i).click(); await page.getByRole('button', { name: 'I have reviewed this section', exact: true }).click(); await page.getByRole('button', { name: '✓ Reviewed', exact: true }).waitFor(); }
  await page.locator('.learning-tabs button').nth(1).click();
  for (const field of await page.locator('.knowledge-check fieldset').all()) await field.locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers', exact: true }).click(); await page.getByRole('heading', { name: /Review and try again/ }).waitFor();
  check(await page.locator('.quiz-feedback article').count() === 5, 'Each quiz answer has explanation and source feedback');
  await page.screenshot({ path: output + 'quiz-feedback.png', fullPage: true });
  for (const [i, q] of schoolDef.questions.entries()) await page.locator('.knowledge-check fieldset').nth(i).locator('input').nth(q.correctAnswer).check();
  await page.getByRole('button', { name: 'Check my answers', exact: true }).click(); await page.locator('.completion-note').waitFor();
  check((await page.locator('.completion-note').innerText()).includes('Completed and saved'), 'Successful retry saves completion');
  check(!requests.some(r => /\/(heartbeat|time)$/.test(r.url)), 'Optional reading, Q&A, failed quiz and completion create no paid activity requests');
  await page.getByRole('button', { name: 'Save & close', exact: true }).click(); await page.getByRole('button', { name: 'Required onboarding', exact: true }).click();
  const requiredSchool = page.locator('.guide-course-grid article').filter({ hasText: 'School Practice Guide' });
  await requiredSchool.getByRole('button', { name: 'Start required training', exact: true }).waitFor();
  check(await requiredSchool.getByRole('button', { name: 'Start required training', exact: true }).count() === 1, 'Practice completion does not satisfy required onboarding');
  await requiredSchool.getByRole('button', { name: 'Start required training', exact: true }).click(); await page.locator('.handbook-book').waitFor();
  check((await page.locator('.time-banner').innerText()).includes('Assigned training · Paid time'), 'Required onboarding is labeled paid');
  check((await page.locator('.time-banner').innerText()).includes('onboarding record'), 'Onboarding uses its existing consolidated time record');
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click(); check(await page.getByRole('button', { name: 'Resume timer', exact: true }).count() === 1, 'Paid reading offers pause and resume');
  await page.screenshot({ path: output + 'assigned-reading.png', fullPage: true });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); check(!hasOverflow, `Reading layout fits ${width}px without horizontal overflow`);
    await page.screenshot({ path: output + `reading-${width}.png`, fullPage: true });
    await page.locator('.learning-tabs button').nth(1).click(); check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `Quiz layout fits ${width}px`); await page.locator('.learning-tabs button').first().click();
  }
  check(!await page.locator('a[download]').count(), 'No document download links in training');
  check(errors.length === 0, 'No browser runtime errors');
  await writeFile(output + 'results.json', JSON.stringify({ passed: true, checks, errors, note: 'Local fixtures. Source-grounded answer display; no live AI, database writes or payroll claims.' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }, null, 2));
} catch(e) { await page.screenshot({ path: output + 'failure.png', fullPage: true }); console.error(e); await writeFile(output + 'results.json', JSON.stringify({ passed: false, checks, errors, failure: e.message }, null, 2)); process.exitCode = 1; }
finally { await browser.close(); }
