// Browser acceptance checks with local fixtures only. Never calls a live model.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { documentTrainingDefinitions } from '../../backend/src/services/documentTrainingContent.js';
const origin = 'http://127.0.0.1:5185';
const output = fileURLToPath(new URL('../../deliverables/care-guide-verification/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const checks = [], errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (r.url().includes('/preview-api/')) requests.push(r.url()); });
await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
const check = (pass, label) => { if (!pass) throw new Error(label); checks.push(label); };
try {
  await page.request.post(`${origin}/preview-api/reset`);
  for (const [slug, name, font] of [['itsco', 'ITSCO', 'Comfortaa'], ['nlu', 'Next Level Up', 'Montserrat'], ['tisi', 'Inner Strength Institute', 'Montserrat']]) {
    await page.goto(`${origin}/${slug}/my-learning`);
    const card = page.locator('.guide-course-grid article').filter({ hasText: 'Care Approaches & Practice Guide' });
    await card.waitFor();
    check(await page.locator('.guide-course-grid article').count() === (slug === 'itsco' ? 6 : slug === 'nlu' ? 4 : 3), `${name}: appropriate guide catalog`);
    await page.getByRole('button', { name: 'On-demand · Your own time', exact: true }).click();
    await card.getByRole('button', { name: 'Start optional practice', exact: true }).click();
    await page.locator('.handbook-book').waitFor(); await page.evaluate(() => document.fonts.ready);
    check((await page.locator('.handbook-book').evaluate(el => getComputedStyle(el).fontFamily)).includes(font), `${name}: ${font} reader typography`);
    check((await page.locator('.branded-cover').getAttribute('aria-label')).includes(name), `${name}: company cover`);
    check((await page.locator('.care-orientation-banner').innerText()).includes('does not certify'), `${name}: orientation boundary visible`);
    check((await page.locator('.time-banner').innerText()).includes('Your own time'), `${name}: optional review is unpaid`);
    await page.locator('.care-orientation-banner button').click();
    check(await page.locator('.book-page').getAttribute('id') === 'counseling-guide-facilitator-scope', `${name}: facilitator shortcut opens exact section`);
    await page.screenshot({ path: output + `${slug}-desktop.png`, fullPage: true });
    await page.locator('input[type=search]').fill('8-minute');
    await page.locator('.outline-link').click();
    check((await page.locator('.book-page').innerText()).includes('not a guarantee of coverage'), `${name}: H0004 searchable with conditions`);
    await page.locator('input[type=search]').fill('');
    await page.setViewportSize({ width: 390, height: 900 });
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `${name}: mobile reader fits`);
    await page.screenshot({ path: output + `${slug}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  // Complete an optional practice attempt in the ISI edition.
  await page.locator('.handbook-assistant summary').click();
  await page.getByRole('button', { name: 'Does this guide authorize me to use CBT?', exact: true }).click();
  await page.locator('.answer-policy-links a').first().waitFor();
  await page.locator('.answer-policy-links a').first().click();
  check(await page.locator('.book-page').getAttribute('id') === 'counseling-guide-care-orientation', 'Q&A fixture citation opens the source passage');
  const definition = documentTrainingDefinitions.find(d => d.documentKey === 'counseling-guide');
  await page.locator('.learning-tabs button').nth(1).click();
  check(await page.getByRole('button', { name: 'Check my answers', exact: true }).isDisabled(), 'Required reading gates the knowledge check');
  await page.locator('.learning-tabs button').first().click();
  for (let i = 0; i < definition.requiredSections.length; i++) {
    await page.locator('.reading-plan li button').nth(i).click();
    await page.getByRole('button', { name: 'I have reviewed this section', exact: true }).click();
    await page.getByRole('button', { name: '✓ Reviewed', exact: true }).waitFor();
  }
  await page.locator('.learning-tabs button').nth(1).click();
  for (const field of await page.locator('.knowledge-check fieldset').all()) await field.locator('input').first().check();
  await page.getByRole('button', { name: 'Check my answers', exact: true }).click();
  await page.getByRole('heading', { name: /Review and try again/ }).waitFor();
  check(await page.locator('.quiz-feedback article').count() === 7, 'Seven questions provide explanations and source links');
  for (const [i, q] of definition.questions.entries()) await page.locator('.knowledge-check fieldset').nth(i).locator('input').nth(q.correctAnswer).check();
  await page.getByRole('button', { name: 'Check my answers', exact: true }).click();
  await page.locator('.completion-note').waitFor();
  check((await page.locator('.document-learning-player').innerText()).includes('not a clinical skills assessment'), 'Completion does not imply clinical authorization');
  check(!requests.some(url => /\/(heartbeat|time)$/.test(url)), 'Optional reading, Q&A, retry and completion never request paid time');
  await page.screenshot({ path: output + 'completed-knowledge-check.png', fullPage: true });
  await page.getByRole('button', { name: 'Save & close', exact: true }).click();
  await page.getByRole('button', { name: 'Required onboarding', exact: true }).click();
  await page.getByRole('button', { name: 'Start required training', exact: true }).click();
  await page.locator('.time-banner').waitFor();
  check((await page.locator('.time-banner').innerText()).includes('Assigned training · Paid time'), 'Required onboarding remains separate and paid');
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  check(!await page.locator('a[download]').count(), 'No document download controls');
  check(errors.length === 0, 'No browser runtime errors');
  await writeFile(output + 'results.json', JSON.stringify({ passed: true, checks, errors, note: 'Synthetic data and source-passage Q&A fixture; no live AI, database or payroll writes.' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} catch (e) {
  await page.screenshot({ path: output + 'failure.png', fullPage: true });
  await writeFile(output + 'results.json', JSON.stringify({ passed: false, checks, errors, failure: e.message }, null, 2));
  console.error(e); process.exitCode = 1;
} finally { await browser.close(); }
