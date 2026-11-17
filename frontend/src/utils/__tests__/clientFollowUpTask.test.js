import { describe, expect, it } from 'vitest';
import { clientFollowUpLocation, followUpClient } from '../clientFollowUpTask.js';

describe('client follow-up context', () => {
  it('normalizes office and school rows without confusing row IDs with client IDs', () => {
    expect(followUpClient({ id: 7, agencyId: 10, fullName: 'Synthetic Client' })).toMatchObject({ id: 7, agency_id: 10, full_name: 'Synthetic Client' });
    expect(followUpClient({ id: 88, client_id: 7, client_initials: 'SC' }, 10)).toMatchObject({ id: 7, agency_id: 10, initials: 'SC' });
  });

  it('retains the originating organization and agency when the task opens elsewhere', () => {
    const metadata = { source: 'client_follow_up', clientId: 7, agencyId: 10, organizationSlug: 'itsco' };
    expect(clientFollowUpLocation({ metadata: JSON.stringify(metadata) }, 'another-agency')).toEqual({ path: '/itsco/admin/clients/7', query: { agencyId: '10' } });
    expect(clientFollowUpLocation({ metadata: { ...metadata, organizationSlug: '' } }, 'another-agency').path).toBe('/admin/clients/7');
  });

  it('does not create links for unrelated tasks or invalid metadata', () => {
    for (const metadata of ['{', null, { source: 'other', clientId: 7 }, { source: 'client_follow_up', clientId: -1 }, { source: 'client_follow_up', clientId: '7/path' }]) {
      expect(clientFollowUpLocation({ metadata })).toBeNull();
    }
  });
});
