import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { handbookUpdateLocations } from '../handbookUpdateLocations.js';

describe('handbook update locations', () => {
  it.each(['itsco', 'nlu', 'isi'])('resolves every supplied %s update to real handbook text and chapter paths', slug => {
    const updates = JSON.parse(readFileSync(new URL(`../../content/handbooks/${slug}-draft-updates.json`, import.meta.url))).updates;
    const located = handbookUpdateLocations({ slug: slug === 'isi' ? 'tisi' : slug }, updates);
    expect(located.length).toBeGreaterThan(10);
    for (const e of located) {
      expect(e.handbook_location_status, e.subject).toBe('linked');
      expect(e.handbook_locations.length, e.subject).toBeGreaterThan(0);
      for (const location of e.handbook_locations) {
        expect(location.bodyHtml).toBeTruthy();
        expect(location.path).toContain(location.title);
        expect(location.sourceLabel).toContain('Supplied handbook');
      }
    }
  });
  it('retains exact locations when an existing update title is edited', () => {
    const [entry] = handbookUpdateLocations({ slug: 'itsco' }, [{ id: 22, digest_id: 1, subject: 'Updated mileage heading' }]);
    expect(entry.handbook_locations[0].slug).toBe('mileage-reimbursement-policy');
    expect(handbookUpdateLocations({ slug: 'itsco' }, [{ id: 22, digest_id: 99, subject: 'A different update' }])[0].handbook_locations).toEqual([]);
  });
  it('does not guess a different tenant or an unknown update location', () => {
    const entry = { subject: 'School mileage reimbursement' };
    expect(handbookUpdateLocations({ slug: 'other', name: 'ITSCO' }, [entry])[0].handbook_locations).toEqual([]);
    expect(handbookUpdateLocations({ slug: 'nlu' }, [entry])[0].handbook_locations).toEqual([]);
    expect(handbookUpdateLocations({ slug: 'itsco' }, [{ subject: 'A new policy' }])[0].handbook_location_status).toBe('unmapped');
  });
  it('uses published text instead of the supplied snapshot and respects saved section overrides', () => {
    const [entry] = handbookUpdateLocations({ slug: 'itsco' }, [{ subject: 'School mileage reimbursement', handbook_section_slug: 'custom' }], {
      version: { version_number: 8 }, sections: [
        { slug: 'chapter', title: 'Benefits', content_status: 'pending' },
        { slug: 'custom', parent_slug: 'chapter', title: 'Travel', body_html: '<p>Updated policy</p><script>bad()</script>' }
      ]
    });
    expect(entry.handbook_locations).toEqual([expect.objectContaining({ slug: 'custom', path: 'Benefits › Travel', bodyHtml: '<p>Updated policy</p>', sourceLabel: 'Published handbook · version 8' })]);
  });
  it('does not fall back to old source text for removed or pending published sections', () => {
    const [entry] = handbookUpdateLocations({ slug: 'itsco' }, [{ subject: 'School mileage reimbursement' }], {
      version: { version_number: 2 }, sections: [{ slug: 'mileage-reimbursement-policy', title: 'Mileage', content_status: 'pending', body_html: '<p>Not ready</p>' }]
    });
    expect(entry.handbook_locations).toEqual([]);
  });
});
