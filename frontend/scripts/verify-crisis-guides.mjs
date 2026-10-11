// Local fixtures only: no real employee, AI or payroll activity.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { trainingDefinitionsFor } from '../../backend/src/services/documentTrainingContent.js';
const origin = 'http://127.0.0.1:5188';
const output = fileURLToPath(new URL('../../deliverables/crisis-guide-verification/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const checks = [], errors = [], requests = [];
const check = (pass, label) => { if (!pass) throw Error(label); checks.push(label); };
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (r.url().includes('/preview-api/')) requests.push(r.url()); });
await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
const key = 'crisis-response-guide';
const verifyPhoto = async label => {
  const photo = page.locator('.handbook-landscape img');
  if (!await photo.count()) return;
  await photo.scrollIntoViewIfNeeded();
  await photo.evaluate(img => img.decode());
  check(await photo.evaluate(img => img.naturalWidth > 0), label);
};
try {
  await page.request.post(`${origin}/preview-api/reset`);
  for (const [slug, font, count] of [['itsco', 'Comfortaa', 6], ['nlu', 'Montserrat', 4], ['tisi', 'Montserrat', 3]]) {
    await page.goto(`${origin}/${slug}/my-learning`);
    const card = page.locator('.guide-course-grid article').filter({ hasText: 'Crisis & Emergency Response' });
    await card.waitFor();
    check(await page.locator('.guide-course-grid article').count() === count, `${slug}: company learning catalog includes crisis response`);
    await page.getByRole('button', { name: 'On-demand · Your own time', exact: true }).click();
    await card.getByRole('button', { name: 'Start optional practice', exact: true }).click();
    await page.locator('.handbook-book').waitFor(); await page.evaluate(() => document.fonts.ready);
    check((await page.locator('.handbook-book').evaluate(el => getComputedStyle(el).fontFamily)).includes(font), `${slug}: branded typography`);
    check((await page.locator('.time-banner').innerText()).includes('Your own time'), `${slug}: optional review is unpaid`);
    check(await page.locator('.outline-link').count() === 20, `${slug}: twenty linked contents sections`);
    check(await page.locator('.crisis-quick-actions a[href="tel:911"]').count() === 1, `${slug}: direct emergency call link`);
    check(await page.locator('.crisis-quick-actions a[href="tel:988"]').count() === 1, `${slug}: direct crisis support link`);
    check((await page.locator('.crisis-quick-actions').innerText()).includes('Do not wait'), `${slug}: emergency action does not depend on AI`);
    await page.screenshot({ path: `${output}${slug}-cover.png`, fullPage: true });
    await page.getByRole('button', { name: 'Remote / off-site response →', exact: true }).click();
    check(await page.locator('.book-page').getAttribute('id') === `${key}-remote-emergency`, `${slug}: stable remote-response shortcut`);
    check((await page.locator('.book-page').innerText()).includes('current physical location'), `${slug}: remote response uses actual location`);
    await page.screenshot({ path: `${output}${slug}-desktop.png`, fullPage: true });
    await page.locator('input[type=search]').fill('referral number');
    await page.locator('.outline-link').click();
    check(await page.locator('.book-page').getAttribute('id') === `${key}-reporting-children`, `${slug}: search finds updated reporting procedure`);
    await page.locator('input[type=search]').fill('homicide assessment');
    await page.locator('.outline-link').click();
    check(await page.locator('.book-page').getAttribute('id') === `${key}-threats-to-others`, `${slug}: familiar assessment term remains searchable`);
    await page.locator('input[type=search]').fill('');
    await page.setViewportSize({ width: 390, height: 900 });
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `${slug}: mobile reader fits`);
    await page.screenshot({ path: `${output}${slug}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.handbook-assistant summary').click();
    await page.locator('.handbook-assistant .question-ideas button').first().click();
    await page.locator('.answer-policy-links a').first().waitFor();
    await page.locator('.answer-policy-links a').first().click();
    const def = trainingDefinitionsFor({ slug }).find(d => d.documentKey === key);
    check(await page.locator('.book-page').getAttribute('id') === `${key}-${def.questions[0].sourceSlug}`, `${slug}: Q&A fixture citation opens exact section`);
    await page.locator('.learning-tabs button').nth(1).click();
    check(await page.getByRole('button', { name: 'Check my answers', exact: true }).isDisabled(), `${slug}: reading gate enforced`);
    await page.locator('.learning-tabs button').first().click();
    for (let i = 0; i < def.requiredSections.length; i++) {
      await page.locator('.reading-plan li button').nth(i).click();
      await page.getByRole('button', { name: 'I have reviewed this section', exact: true }).click();
      await page.getByRole('button', { name: '✓ Reviewed', exact: true }).waitFor();
    }
    await page.locator('.learning-tabs button').nth(1).click();
    check(await page.locator('.knowledge-check fieldset').count() === 8, `${slug}: eight crisis orientation questions`);
    for (const field of await page.locator('.knowledge-check fieldset').all()) await field.locator('input').first().check();
    await page.getByRole('button', { name: 'Check my answers', exact: true }).click();
    await page.getByRole('heading', { name: /Review and try again/ }).waitFor();
    check(await page.locator('.quiz-feedback article').count() === 8, `${slug}: retry feedback has eight source explanations`);
    for (const [i, q] of def.questions.entries()) await page.locator('.knowledge-check fieldset').nth(i).locator('input').nth(q.correctAnswer).check();
    await page.getByRole('button', { name: 'Check my answers', exact: true }).click();
    await page.locator('.completion-note').waitFor();
    check((await page.locator('.edition-note').filter({ hasText: 'Orientation only.' }).innerText()).includes('not a clinical skills assessment'), `${slug}: completion does not authorize practice`);
    check(!await page.locator('a[download]').count(), `${slug}: no document download control`);
    await page.screenshot({ path: `${output}${slug}-quiz.png`, fullPage: true });
  }
  check(!requests.some(url => /\/(heartbeat|time)$/.test(url)), 'Optional review and quizzes never submit paid time');
  await page.goto(`${origin}/itsco/my-learning`);
  await page.getByRole('button', { name: 'Required onboarding', exact: true }).click();
  await page.locator('.guide-course-grid article').filter({ hasText: 'Crisis & Emergency Response' }).getByRole('button', { name: 'Start required training', exact: true }).click();
  await page.locator('.time-banner').waitFor();
  check((await page.locator('.time-banner').innerText()).includes('Assigned training · Paid time'), 'Required crisis orientation is a separate paid enrollment');
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  check(errors.length === 0, 'No browser runtime errors');
  await writeFile(`${output}results.json`, JSON.stringify({ passed: true, checks, errors, note: 'Synthetic learner and source-passage Q&A fixtures; no live AI, database or payroll writes.' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} catch (e) {
  await page.screenshot({ path: `${output}failure.png`, fullPage: true });
  await writeFile(`${output}results.json`, JSON.stringify({ passed: false, checks, errors, failure: e.message }, null, 2));
  console.error(e); process.exitCode = 1;
} finally { await browser.close(); }
