import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEventTimeHandbookAmendment } from '../eventTimeHandbookAmendment.js';
import { applyEventTravelHandbookAmendment, EVENT_TRAVEL_HANDBOOK_SLUG, EVENT_TRAVEL_NOVEMBER_UPDATE } from '../eventTravelHandbookAmendment.js';
import { getHandbookSource } from '../../services/workplaceHandbookContent.js';
import { handbookUpdateLocations } from '../../services/handbookUpdateLocations.js';

const raw = JSON.parse(readFileSync(new URL('../handbooks/itsco.json', import.meta.url), 'utf8'));
const amend = source => applyEventTravelHandbookAmendment(applyEventTimeHandbookAmendment(source, 'itsco'), 'itsco');

describe('outreach handbook policy', () => {
  it('preserves the complete school mileage policy and unrelated sections', () => {
    const before = applyEventTimeHandbookAmendment(structuredClone(raw), 'itsco');
    const after = applyEventTravelHandbookAmendment(structuredClone(before), 'itsco');
    const allowed = new Set(['indirect-services', 'compensation-separately-compensated-indirect-service',
      'compensation-support-activity', 'claim-submissions-via-app-itsco-health',
      'outreach-services-non-clinical', 'actual-work-time-support-and-corrections']);
    for (const section of before.sections) {
      if (!allowed.has(section.slug)) assert.deepEqual(after.sections.find(s => s.slug === section.slug), section, section.slug);
    }
    const source = getHandbookSource({ slug: 'itsco' });
    assert.equal(source.sections.find(s => s.slug === 'mileage-reimbursement-policy').body_html,
      raw.sections.find(s => s.slug === 'mileage-reimbursement-policy').bodyHtml);
    assert.equal(source.sections.find(s => s.slug === EVENT_TRAVEL_HANDBOOK_SLUG).parent_slug, 'outreach-services-non-clinical');
  });
  it('can be reapplied without duplicate policies or instructions, and leaves other tenants alone', () => {
    const once = amend(structuredClone(raw));
    assert.deepEqual(amend(structuredClone(once)), once);
    assert.equal(once.sections.filter(s => s.slug === EVENT_TRAVEL_HANDBOOK_SLUG).length, 1);
    for (const tenant of ['nlu', 'isi', 'other']) assert.deepEqual(applyEventTravelHandbookAmendment(structuredClone(raw), tenant), raw);
  });
  it('updates the legacy editable draft without changing school mileage or unrelated timekeeping', () => {
    const school = { slug: 'school-mileage-reimbursement', title: 'School mileage', status: 'ready', bodyHtml: '<p>Existing tier policy.</p>' };
    const time = { slug: 'timekeeping-support-and-overtime', title: 'Timekeeping', status: 'ready', bodyHtml: '<p>Existing supervision and overtime rules.</p>' };
    const result = applyEventTravelHandbookAmendment({ sections: [structuredClone(school), structuredClone(time)] }, 'itsco');
    assert.deepEqual(result.sections[0], school);
    assert.ok(result.sections[1].bodyHtml.startsWith(time.bodyHtml));
    assert.equal(result.sections[2].parentSlug, null);
    assert.deepEqual(applyEventTravelHandbookAmendment(structuredClone(result), 'itsco'), result);
  });
  it('links the saved November entry to exactly the policy shown in the handbook', () => {
    const [entry] = handbookUpdateLocations({ slug: 'itsco' }, [{
      subject: EVENT_TRAVEL_NOVEMBER_UPDATE.subject, handbook_section_slug: EVENT_TRAVEL_HANDBOOK_SLUG
    }]);
    const policy = getHandbookSource({ slug: 'itsco' }).sections.find(s => s.slug === EVENT_TRAVEL_HANDBOOK_SLUG);
    assert.equal(entry.handbook_location_status, 'linked');
    assert.equal(entry.handbook_locations[0].bodyHtml, policy.body_html);
    assert.match(entry.handbook_locations[0].path, /Outreach/);
    assert.match(policy.body_html, /only to travel for <strong>assigned outreach events/);
    assert.match(EVENT_TRAVEL_NOVEMBER_UPDATE.changedContent, /school mileage reimbursement policy is unchanged/);
    // A future published edition must never silently inherit reference wording.
    const [published] = handbookUpdateLocations({ slug: 'itsco' }, [entry], { version: { version_number: 2 }, sections: [] });
    assert.deepEqual(published.handbook_locations, []);
  });
});
