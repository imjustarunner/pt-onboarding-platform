import { describe, expect, it } from 'vitest';
import { notificationDestination, notificationDismissPayload } from '../notificationActions';

describe('notificationActions', () => {
  it('routes packets to the client documents tab with organization context', () => {
    expect(notificationDestination({
      type: 'new_packet_uploaded', related_entity_type: 'client', related_entity_id: 42
    }, { organizationSlug: 'itsco', role: 'admin' })).toEqual({
      path: '/itsco/admin/clients', query: { clientId: '42', tab: 'documents' }
    });
  });

  it('routes office and ticket workflows to their operational destinations', () => {
    expect(notificationDestination({ type: 'office_availability_request_pending', agency_id: 8 }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/admin/availability-intake?agencyId=8&tab=office');
    expect(notificationDestination({ type: 'support_ticket_created', related_entity_id: 3 }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/tickets?status=open&ticketId=3');
  });

  it('does not expose admin profile navigation to ordinary providers', () => {
    expect(notificationDestination({ type: 'status_expired', user_id: 7, related_entity_type: 'user' }, { role: 'provider' })).toBeNull();
  });

  it('clears follow-up atomically when dismissing a protected notification', () => {
    expect(notificationDismissPayload({ _requires_follow_up_for_viewer: true }))
      .toEqual({ followUp: false, dismissed: true });
    expect(notificationDismissPayload({ _requires_follow_up_for_viewer: false }))
      .toEqual({ dismissed: true });
  });
});
