import { describe, it, expect } from 'vitest';
import {
  resolveChatContextForPerson,
  canDirectMessagePerson,
  sortDirectThreadsForPerson
} from '../chatTenantResolve.js';

const person = {
  id: 42,
  shared_agency_ids: [10, 20],
  shared_agency_memberships: [
    { id: 10, name: 'Demo ITSCO' },
    { id: 20, name: 'ITSCO' }
  ]
};

describe('sortDirectThreadsForPerson', () => {
  it('prefers unread threads, then most recent', () => {
    const threads = [
      {
        thread_type: 'direct',
        agency_id: 20,
        unread_count: 0,
        updated_at: '2026-01-02',
        other_participant: { id: 42 }
      },
      {
        thread_type: 'direct',
        agency_id: 10,
        unread_count: 2,
        updated_at: '2026-01-01',
        last_message: { created_at: '2026-01-01' },
        other_participant: { id: 42 }
      }
    ];
    expect(sortDirectThreadsForPerson(threads, 42)[0].agency_id).toBe(10);
  });
});

describe('resolveChatContextForPerson', () => {
  it('uses explicit agency override', () => {
    expect(
      resolveChatContextForPerson({
        person,
        agencyIdOverride: 99,
        organizationIdOverride: 5,
        myMembershipAgencyIds: [10, 20]
      })
    ).toEqual({ agencyId: 99, organizationId: 5 });
  });

  it('opens the existing thread with unread instead of compose agency', () => {
    const ctx = resolveChatContextForPerson({
      person,
      myMembershipAgencyIds: [10, 20],
      membershipAgencies: person.shared_agency_memberships,
      composeAgencyId: 20,
      threads: [
        {
          thread_type: 'direct',
          agency_id: 10,
          organization_id: null,
          unread_count: 2,
          updated_at: '2026-01-01',
          other_participant: { id: 42 }
        }
      ]
    });
    expect(ctx).toEqual({ agencyId: 10, organizationId: null });
  });

  it('keeps school-scoped thread context for providers', () => {
    const ctx = resolveChatContextForPerson({
      person: { id: 7, shared_agency_ids: [10] },
      myMembershipAgencyIds: [10],
      threads: [
        {
          thread_type: 'direct',
          agency_id: 10,
          organization_id: 501,
          unread_count: 1,
          updated_at: '2026-01-03',
          other_participant: { id: 7 }
        }
      ]
    });
    expect(ctx).toEqual({ agencyId: 10, organizationId: 501 });
  });

  it('picks compose agency when both share multiple tenants and no thread exists', () => {
    const ctx = resolveChatContextForPerson({
      person,
      myMembershipAgencyIds: [10, 20],
      membershipAgencies: person.shared_agency_memberships,
      composeAgencyId: 20,
      threads: []
    });
    expect(ctx).toEqual({ agencyId: 20, organizationId: null });
  });

  it('falls back to alphabetically first shared tenant when compose is not shared', () => {
    const ctx = resolveChatContextForPerson({
      person,
      myMembershipAgencyIds: [10, 20],
      membershipAgencies: person.shared_agency_memberships,
      composeAgencyId: 99,
      threads: []
    });
    expect(ctx).toEqual({ agencyId: 10, organizationId: null });
  });
});

describe('canDirectMessagePerson', () => {
  it('allows messaging when tenants overlap', () => {
    expect(
      canDirectMessagePerson({
        person,
        myMembershipAgencyIds: [20],
        threads: []
      })
    ).toBe(true);
  });

  it('blocks messaging with no shared tenant or thread', () => {
    expect(
      canDirectMessagePerson({
        person: { id: 8, shared_agency_ids: [55] },
        myMembershipAgencyIds: [20],
        threads: []
      })
    ).toBe(false);
  });

  it('allows reopening an existing thread even without shared tenant rows', () => {
    expect(
      canDirectMessagePerson({
        person: { id: 8, shared_agency_ids: [] },
        myMembershipAgencyIds: [20],
        threads: [
          {
            thread_type: 'direct',
            agency_id: 55,
            other_participant: { id: 8 }
          }
        ]
      })
    ).toBe(true);
  });
});
