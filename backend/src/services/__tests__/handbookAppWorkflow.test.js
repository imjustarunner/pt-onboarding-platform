import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getHandbookSource } from '../workplaceHandbookContent.js';

describe('app-only handbook workflows', () => {
  for (const tenant of ['itsco', 'nlu', 'tisi']) it(`${tenant}: uses the app for forms, actual time and supervision without changing the approved pay or milestone`, () => {
    const source = getHandbookSource({ slug: tenant });
    const text = slug => source.sections.find(s => s.slug === slug).body_html;
    const all = [...source.sections.map(s => [s.slug, s.body_html]), ...source.reviewUpdates.map(u => [u.id, u.changed_content])];
    for (const [slug, body] of all) assert.ok(!/forms\.gle|docs\.google|TherapyNotes|external.EHR|go-live notice|until the applicable go-live|time records.{0,90}payroll@|\bEHR\b|timecard|“Client” field/.test(body), `${tenant}: ${slug}`);
    assert.match(text('digital-workplace-and-transition-procedures'), /The app is the workplace system of record/);
    assert.match(text('digital-workplace-and-transition-procedures'), /Emergency calls and required external reports must not be delayed/);
    assert.match(text('timekeeping-compensation-and-payroll-compliance'), /time records in the app by midnight on the Friday/);
    assert.match(text('supervision-procedures'), /app’s supervision session/);
    assert.match(text('supervision-procedures'), /60 completed individual\/triadic supervision hours plus 40 group supervision opportunities offered/);
    assert.match(text('colorado-billing-compensation-appendix'), /20%/);
    assert.match(text('colorado-billing-compensation-appendix'), /12 indirect minutes/);
    assert.match(text('colorado-billing-compensation-appendix'), /Units × 0.25/);
    assert.match(text('employee-separation-and-transitions-resignation-and-termination'), /Supervisory Termination Summary to People Operations in the app/);
    assert.match(text('responsibilities-of-the-supervisee'), /maintaining and reviewing their supervision and clinical hours in the app/);
  });
  it('records exact hashes and adds changed sections to the app-workflow updater entry', () => {
    const root = new URL('../../content/handbooks/', import.meta.url);
    const audit = JSON.parse(readFileSync(new URL('app-workflow-reconciliation.json', root)));
    const raw = JSON.parse(readFileSync(new URL('itsco.json', root)));
    const before = JSON.parse(readFileSync(new URL('itsco-before-app-workflow.json', root)));
    const source = getHandbookSource({ slug: 'itsco' });
    const update = source.reviewUpdates.find(u => u.id === 5);
    assert.ok(audit.sections.length >= 23);
    for (const item of audit.sections) {
      const hash = section => createHash('sha256').update(section.bodyHtml).digest('hex');
      assert.equal(item.bodySha256, hash(raw.sections.find(s => s.slug === item.slug)));
      assert.equal(item.beforeBodySha256, hash(before.sections.find(s => s.slug === item.slug)));
      assert.ok(update.policy_section_slugs.includes(item.slug), item.slug);
    }
  });
});
