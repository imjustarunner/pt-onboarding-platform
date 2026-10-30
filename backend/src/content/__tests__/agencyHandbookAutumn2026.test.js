import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getHandbookSource, cleanHandbookHtml } from '../../services/workplaceHandbookContent.js';
import { categoryDescriptions } from '../compensationSchedulePresentation.js';
import { ADVANCED_CATEGORY_DESCRIPTION, ADVANCED_CATEGORY_PLACEMENT, ADVANCED_CATEGORY_RATIONALE } from '../advancedCompensationCategory.js';
import { applyAdvancedCategoryToSections, applyAutumnHandbookReconciliation } from '../agencyHandbookAutumn2026.js';
import { handbookUpdateLocations } from '../../services/handbookUpdateLocations.js';

describe('October / November agency handbook reconciliation', () => {
  for (const [tenant, slug, period] of [['itsco','itsco','November 2026'], ['nlu','nlu','October 2026'], ['isi','tisi','October 2026']]) {
    it(`${tenant}: keeps Category 2 placement and general-service rates intact while broadening Category 3 by express approval`, () => {
      const raw = JSON.parse(readFileSync(new URL(`../handbooks/${tenant}.json`, import.meta.url)));
      const book = getHandbookSource({ slug });
      const bySlug = key => book.sections.find(s => s.slug === key);
      assert.match(bySlug('compensation-rate-category-2').body_html, /^<p>Pre-licensed master’s-level staff\./);
      const money = body => [...body.matchAll(/<td>\$(\d+\.\d+)<\/td>/g)].map(m => m[1]);
      const generalRows = body => [...body.matchAll(/<tr><th(?: [^>]*)?>(Clinical Session Rate|Clinical Hour Rate|Direct Care Rate|Standard Professional Rate|Indirect pay|Support activities)[\s\S]*?<\/tr>/g)].map(match => ({ label: match[1].replace('Clinical Hour Rate', 'Clinical Session Rate').replace('Standard Professional Rate', 'Direct Care Rate'), values: money(match[0]) }));
      for (const category of [1,2,3]) {
        const actual = bySlug(`compensation-rate-category-${category}`).body_html;
        const previous = raw.sections.find(s => s.slug === `compensation-rate-category-${category}`).bodyHtml;
        if (tenant === 'itsco') assert.deepEqual(money(actual), money(previous));
        else {
          const oldRows = generalRows(previous);
          const currentRows = generalRows(actual);
          assert.equal(oldRows.length, 20, 'four existing service rows at every level');
          assert.deepEqual(currentRows.map(row => ({ label: row.label, values: row.values.slice(0,2) })), oldRows);
          for (const row of currentRows) assert.equal(row.values[2], row.values[1], 'minimum-workload column preserves the previously disclosed reduced rate');
        }
      }
      const advanced = bySlug('compensation-rate-category-3');
      assert.equal(advanced.title, 'Category 3 · Licensed & Advanced Professionals');
      assert.ok(advanced.body_html.includes(ADVANCED_CATEGORY_DESCRIPTION));
      assert.ok(advanced.body_html.includes(ADVANCED_CATEGORY_PLACEMENT));
      assert.match(advanced.body_html, /10 minutes/);
      assert.doesNotMatch(advanced.body_html, /doctoral|psychologist/i);
      const update = book.reviewUpdates.find(e => e.handbook_section_slug === 'compensation-category-placement');
      assert.equal(update.period_label, period);
      assert.equal(update.rationale, ADVANCED_CATEGORY_RATIONALE);
      assert.equal(update.changed_content, bySlug('compensation-category-placement').body_html);
      const [location] = handbookUpdateLocations({ slug }, [update]);
      assert.equal(location.handbook_location_status, 'linked');
      assert.equal(location.handbook_locations[0].bodyHtml, update.changed_content);
    });
    it(`${tenant}: retains October topics and includes every applicable November topic with valid destinations`, () => {
      const original = JSON.parse(readFileSync(new URL(`../handbooks/${tenant}-draft-updates.json`, import.meta.url))).updates;
      const book = getHandbookSource({ slug });
      for (const entry of original) assert.ok(book.reviewUpdates.some(e => e.id === entry.id), entry.subject);
      const shared = ['career-pathways-job-titles-service-focus-and-compensation-structure','career-pathway-overview','service-focus-assignment','event-travel-reimbursement','flat-clinical-addons-and-eligibility','compensation-category-placement'];
      for (const key of shared) assert.ok(book.reviewUpdates.some(e => e.handbook_section_slug === key && e.period_label === period), key);
      for (const entry of book.reviewUpdates) for (const key of entry.policy_section_slugs) assert.equal(book.sections.find(s => s.slug === key)?.content_status, 'ready', key);
      assert.doesNotMatch(book.sections.find(s => s.slug === 'career-pathway-overview').body_html, /TIER [123]|five levels/i);
      assert.match(book.sections.find(s => s.slug === 'flat-clinical-addons-and-eligibility').body_html, /90785 pays \$2\.00/);
      assert.doesNotMatch(book.sections.find(s => s.slug === 'flat-clinical-addons-and-eligibility').body_html, /90785 pays \$4/);
      assert.doesNotMatch(book.sections.find(s => s.slug === 'direct-clinical-services-billable-when-authorized').body_html, /any sessions outside|between 8-5pm|undeveloped or impaired patience/);
      assert.doesNotMatch(book.sections.find(s => s.slug === 'service-code-compensation-and-authorizations').body_html, /<tr><th>(?:90785|99051)<\/th>/);
      if (tenant !== 'itsco') {
        assert.ok(book.reviewUpdates.every(e => e.period_label === 'October 2026'));
        assert.ok(book.reviewUpdates.every(e => e.rationale));
        assert.ok(!book.sections.some(s => s.slug === 'school-support-activity-hours'));
        for (const entry of book.reviewUpdates) assert.doesNotMatch(entry.changed_content, /app\.itsco\.health|\/itsco\//);
      }
    });
  }
  it('does not rewrite Category 2 in generated compensation schedules', () => {
    assert.equal(categoryDescriptions[2], 'Pre-licensed master’s-level staff. Approved psychotherapy/9-series and other designated master’s-level services use Clinical Session Rate. Approved H-code services use the separate Direct Care Rate plus 10 minutes of indirect pay per direct-hour equivalent.');
    assert.ok(categoryDescriptions[3].includes(ADVANCED_CATEGORY_PLACEMENT));
  });
  it('can reconcile an agency edition again without duplicating shared wording or updates', () => {
    for (const tenant of ['itsco','nlu','isi']) {
      const raw = JSON.parse(readFileSync(new URL(`../handbooks/${tenant}.json`, import.meta.url)));
      const updates = JSON.parse(readFileSync(new URL(`../handbooks/${tenant}-draft-updates.json`, import.meta.url))).updates;
      const first = applyAutumnHandbookReconciliation(raw, updates, tenant);
      const second = applyAutumnHandbookReconciliation(structuredClone(first.source), structuredClone(first.updates), tenant);
      assert.deepEqual(second, first, tenant);
    }
  });
  it('handles legacy combined rate tables without changing the Category 2 fragment or duplicating qualifications', () => {
    const category2 = '<h2>Category 2 · Pre-licensed</h2><p>Pre-licensed master’s-level staff.</p>';
    const source = { sections: [{ slug: 'category-level-rate-schedule', status: 'ready', title: 'Rates', bodyHtml: category2 + '<h2>Category 3 · Fully licensed</h2><p>Fully licensed professionals. Approved services.</p>' }] };
    applyAdvancedCategoryToSections(source);
    const once = structuredClone(source);
    applyAdvancedCategoryToSections(source);
    assert.deepEqual(source, once);
    assert.ok(source.sections[0].bodyHtml.startsWith(category2));
    assert.equal(source.sections[0].bodyHtml.split(ADVANCED_CATEGORY_PLACEMENT).length - 1, 1);
  });
});
