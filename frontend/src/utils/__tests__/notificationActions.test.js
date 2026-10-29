import { describe, expect, it } from 'vitest';
import { notificationDestination, notificationDismissPayload } from '../notificationActions';

describe('notificationActions', () => {
  it('opens a live invitation directly and supports older plural event entity types', () => {
    expect(notificationDestination({type:'team_meeting_scheduled',related_entity_type:'provider_schedule_event',related_entity_id:20,audience_json:'{"live":true}'},{organizationSlug:'itsco'})).toBe('/itsco/join/team-meeting/20');
    expect(notificationDestination({type:'team_meeting_scheduled',related_entity_type:'provider_schedule_events',related_entity_id:20})).toBe('/my-schedule?eventId=20&eventKind=TEAM_MEETING');
  });
  it('opens a tagged meeting offer and the reserved meeting from their notifications', () => {
    expect(notificationDestination({type:'team_meeting_scheduled',related_entity_type:'meeting_reservation_invitation',related_entity_id:30,agency_id:2},{organizationSlug:'itsco',role:'provider'}))
      .toBe('/itsco/meeting-times?invitation=30&agencyId=2');
    expect(notificationDestination({type:'team_meeting_scheduled',related_entity_type:'provider_schedule_event',related_entity_id:20},{organizationSlug:'itsco',role:'provider'}))
      .toBe('/itsco/my-schedule?eventId=20&eventKind=TEAM_MEETING');
  });
  it('routes packets to the client documents tab with organization context', () => {
    expect(notificationDestination({
      type: 'new_packet_uploaded', related_entity_type: 'client', related_entity_id: 42
    }, { organizationSlug: 'itsco', role: 'admin' })).toEqual({
      path: '/itsco/admin/clients', query: { clientId: '42', tab: 'documents' }
    });
  });

  it('routes office and ticket workflows to their operational destinations', () => {
    expect(notificationDestination({ type: 'office_availability_request_pending', agency_id: 8 }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/admin/office-approvals?agencyId=8&tab=requests');
    expect(notificationDestination({ type: 'support_ticket_created', related_entity_id: 3 }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/tickets?status=open&ticketId=3');
    expect(notificationDestination({
      type: 'escalation_mention',
      related_entity_type: 'escalation',
      related_entity_id: 19
    }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/admin/escalations?id=19');
    expect(notificationDestination({ type: 'school_portal_onboarding_completed', agency_id: 12 }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/admin/school-onboarding?agencyId=12');
    expect(notificationDestination({ type: 'provider_year_update_completed', agency_id: 9 }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/admin/provider-year-update?agencyId=9');
    expect(notificationDestination({
      type: 'school_collaborative_year_update_completed',
      agency_id: 4,
      related_entity_type: 'school',
      related_entity_id: 88
    }, { organizationSlug: 'org', role: 'admin' }))
      .toBe('/org/admin/school-reinit/88?agencyId=4');
  });

  it('does not expose admin profile navigation to ordinary providers', () => {
    expect(notificationDestination({ type: 'status_expired', user_id: 7, related_entity_type: 'user' }, { role: 'provider' })).toBeNull();
  });

  it('opens the scoped waitlist instead of a client chart from weekly reminders', () => {
    const reminder = {type:'provider_waitlist_reminder',agency_id:2,related_entity_type:'client',related_entity_id:42};
    expect(notificationDestination(reminder,{organizationSlug:'itsco',role:'provider'})).toBe('/itsco/my-schedule?waitlist=1&agencyId=2');
    expect(notificationDestination(reminder,{organizationSlug:'itsco',role:'support'})).toBe('/itsco/admin/office-clients?waitlist=1&agencyId=2');
  });

  it('opens staff event links from notifications without requiring an administrator role', () => {
    const event = { type: 'company_event_message', related_entity_type: 'company_event', related_entity_id: 8 };
    expect(notificationDestination({ ...event, audience_json: JSON.stringify({ navigationUrl: '/company-events/8/staff/shared-token' }) }, { role: 'provider' })).toBe('/company-events/8/staff/shared-token');
    expect(notificationDestination({ ...event, audienceJson: { navigationUrl: `${window.location.origin}/company-events/8/staff/shared-token` } })).toBe('/company-events/8/staff/shared-token');
    expect(notificationDestination({ ...event, audience_json: { navigationUrl: 'https://untrusted.example/company-events/8/staff/shared-token' } })).toBeNull();
    expect(notificationDestination({ ...event, audience_json: { navigationUrl: '/company-events/9/staff/shared-token' } })).toBeNull();
    expect(notificationDestination({ ...event, audience_json: '{invalid' })).toBeNull();
  });

  it('clears follow-up atomically when dismissing a protected notification', () => {
    expect(notificationDismissPayload({ _requires_follow_up_for_viewer: true }))
      .toEqual({ followUp: false, dismissed: true });
    expect(notificationDismissPayload({ _requires_follow_up_for_viewer: false }))
      .toEqual({ dismissed: true });
  });
});

it('opens an exchange match in its own agency, even from another tenant', () => {
  expect(notificationDestination({ type: 'client_exchange_match', related_entity_type: 'client_exchange_listing', related_entity_id: 44, agency_id: 2, audience_json: JSON.stringify({ agencySlug: 'itsco' }) }, { organizationSlug: 'other', role: 'provider' }))
    .toBe('/itsco/client-exchange?listingId=44&agencyId=2');
});

it('opens urgent SMS support requests in the ticket queue', () => {
 expect(notificationDestination({type:'support_safety_net_alert',related_entity_type:'support_ticket',related_entity_id:60}, {organizationSlug:'itsco',role:'support'})).toBe('/itsco/tickets?status=open&ticketId=60');
});

it('opens eligible year awards in the notification agency', () => {
  expect(notificationDestination({type:'employee_award_eligible',agency_id:2},{organizationSlug:'itsco',role:'admin'})).toBe('/itsco/admin/employee-relations?agencyId=2&status=owed');
});
