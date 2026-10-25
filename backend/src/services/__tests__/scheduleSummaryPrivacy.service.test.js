import { describe, it, expect } from 'vitest';
import {
  canViewFullScheduleDetails,
  canManageOthersSchedule,
  resolveScheduleDetailLevel,
  toBusyOnlyScheduleSummary,
  toTypedPeerScheduleSummary,
  toPeerAvailabilitySummary, canViewPeerSchedule, canIncludeAllScheduleAgencies
} from '../scheduleSummaryPrivacy.service.js';

describe('scheduleSummaryPrivacy', () => {
  it.each(['provider', 'intern', 'tutor', 'staff', 'supervisor', 'assistant_admin'])('lets %s browse coworkers without management access being implied', role => {
    expect(canViewPeerSchedule(role)).toBe(true);
    expect(canIncludeAllScheduleAgencies({ isSelf: false, actorRole: role })).toBe(false);
    expect(resolveScheduleDetailLevel({ isSelf: false, actorRole: role, requestedLevel: 'availability' })).toBe('availability');
  });
  it.each(['client', 'guardian', 'school_staff', 'school_support', 'kiosk', 'athlete', 'parent', 'unknown', ''])('excludes %s from staff calendar access', role => expect(canViewPeerSchedule(role)).toBe(false));
  it('allows all agencies only for the calendar owner or super admin', () => {
    expect(canIncludeAllScheduleAgencies({ isSelf: true, actorRole: 'provider' })).toBe(true);
    expect(canIncludeAllScheduleAgencies({ isSelf: false, actorRole: 'super_admin' })).toBe(true);
    expect(canIncludeAllScheduleAgencies({ isSelf: false, actorRole: 'admin' })).toBe(false);
  });
  it('returns only generic times and labels, with no event identifiers, locations or appointment details', () => {
    const interval = { startAt: '2026-10-26T16:00:00Z', endAt: '2026-10-26T17:00:00Z' };
    const privateFields = { id: 567, clientId: 42, title: 'Private Client', description: 'Clinical details', joinUrl: 'https://private.example', attendees: [{ name: 'Private Person' }], buildingName: 'Private Office', roomNumber: 'Secret Room' };
    const result = toPeerAvailabilitySummary({
      providerId: 12, agencyId: 2, scheduleAgencyIds: [2, 99], weekStart: '2026-10-26', weekEnd: '2026-11-02',
      officeEvents: [{ ...interval, ...privateFields, slotState: 'ASSIGNED_BOOKED' }, { ...interval, slotState: 'ASSIGNED_AVAILABLE' }],
      scheduleEvents: [{ ...interval, ...privateFields, kind: 'TEAM_MEETING' }, { ...interval, ...privateFields, kind: 'PERSONAL_EVENT' }],
      supervisionSessions: [{ ...interval, ...privateFields }],
      googleEvents: [{ ...privateFields, start: { dateTime: interval.startAt }, end: { dateTime: interval.endAt } }]
    });
    expect(result).toEqual({ ok: true, detailLevel: 'availability', weekStart: '2026-10-26', weekEnd: '2026-11-02', busyBlocks: [
      { ...interval, activityType: 'session', title: 'Session' },
      { ...interval, activityType: 'meeting', title: 'Meeting' },
      { ...interval, activityType: 'busy', title: 'Busy' }
    ] });
    expect(JSON.stringify(result)).not.toMatch(/Private|Secret|Clinical|clientId|attendees|agency|joinUrl|567/);
  });
  it('full detail roles', () => {
    expect(canViewFullScheduleDetails('admin')).toBe(true);
    expect(canViewFullScheduleDetails('support')).toBe(true);
    expect(canViewFullScheduleDetails('clinical_practice_assistant')).toBe(true);
    expect(canViewFullScheduleDetails('provider')).toBe(false);
    expect(canViewFullScheduleDetails('staff')).toBe(false);
  });

  it('manage-others roles exclude plain provider', () => {
    expect(canManageOthersSchedule('admin')).toBe(true);
    expect(canManageOthersSchedule('provider_plus')).toBe(true);
    expect(canManageOthersSchedule('provider')).toBe(false);
  });

  it('resolves detailLevel defaults', () => {
    expect(resolveScheduleDetailLevel({ isSelf: true, actorRole: 'provider' })).toBe('full');
    expect(resolveScheduleDetailLevel({ isSelf: false, actorRole: 'provider' })).toBe('typed');
    expect(resolveScheduleDetailLevel({ isSelf: false, actorRole: 'admin' })).toBe('full');
    expect(resolveScheduleDetailLevel({
      isSelf: false,
      actorRole: 'provider',
      isSupervisorOfTarget: true,
      requestedLevel: 'full'
    })).toBe('full');
    expect(resolveScheduleDetailLevel({
      isSelf: false,
      actorRole: 'provider',
      requestedLevel: 'full'
    })).toBe('typed');
    expect(resolveScheduleDetailLevel({
      isSelf: false,
      actorRole: 'provider',
      requestedLevel: 'busy'
    })).toBe('busy');
    expect(resolveScheduleDetailLevel({
      isSelf: false,
      actorRole: 'provider',
      requestedLevel: 'typed'
    })).toBe('typed');
  });

  it('masks client and titles in busy-only payload', () => {
    const busy = toBusyOnlyScheduleSummary({
      providerId: 9,
      agencyId: 1,
      weekStart: '2026-07-13',
      weekEnd: '2026-07-20',
      officeEvents: [{
        id: 1,
        startAt: '2026-07-14 09:00:00',
        endAt: '2026-07-14 10:00:00',
        clientId: 55,
        roomName: 'Room A'
      }],
      scheduleEvents: [{
        id: 2,
        startAt: '2026-07-14 11:00:00',
        endAt: '2026-07-14 12:00:00',
        title: 'Secret meeting',
        clientId: 99
      }],
      supervisionSessions: [{
        startAt: '2026-07-15 13:00:00',
        endAt: '2026-07-15 14:00:00',
        counterpartyName: 'Alice',
        joinUrl: 'https://example.com/join'
      }]
    });
    expect(busy.detailLevel).toBe('busy');
    expect(busy.officeEvents).toEqual([]);
    expect(busy.scheduleEvents).toEqual([]);
    expect(busy.busyBlocks.length).toBe(3);
    expect(busy.busyBlocks.every((b) => b.title === 'Busy')).toBe(true);
    expect(JSON.stringify(busy)).not.toContain('Secret meeting');
    expect(JSON.stringify(busy)).not.toContain('Alice');
    expect(JSON.stringify(busy)).not.toMatch(/"clientId"\s*:\s*55/);
  });

  it('typed peer payload exposes activity type, office, and provider identity without client PII', () => {
    const typed = toTypedPeerScheduleSummary({
      providerId: 9,
      agencyId: 1,
      weekStart: '2026-07-13',
      weekEnd: '2026-07-20',
      officeEvents: [{
        id: 1,
        startAt: '2026-07-14 09:00:00',
        endAt: '2026-07-14 10:00:00',
        clientId: 55,
        slotState: 'ASSIGNED_BOOKED',
        appointmentType: 'SESSION',
        buildingName: 'Windchime',
        roomNumber: '9',
        roomLabel: 'Group Room',
        assignedProviderId: 485,
        bookedProviderId: 12,
        assignedProviderFullName: 'Jacquelyne Fernandez',
        bookedProviderFullName: 'Provider Two'
      }],
      scheduleEvents: [{
        id: 2,
        startAt: '2026-07-14 11:00:00',
        endAt: '2026-07-14 12:00:00',
        kind: 'SCHEDULE_HOLD',
        title: 'Secret hold for Client Jane',
        clientId: 99,
        agencyId: 1
      }],
      supervisionSessions: [{
        id: 3,
        startAt: '2026-07-15 13:00:00',
        endAt: '2026-07-15 14:00:00',
        counterpartyName: 'Alice',
        joinUrl: 'https://example.com/join'
      }]
    });
    expect(typed.detailLevel).toBe('typed');
    expect(typed.busyBlocks.length).toBe(3);
    const session = typed.busyBlocks.find((b) => b.activityType === 'session');
    expect(session?.title).toContain('Windchime');
    expect(session?.title).toContain('#9');
    expect(typed.busyBlocks.find((b) => b.activityType === 'hold')?.title).toBe('Schedule hold');
    expect(typed.busyBlocks.find((b) => b.activityType === 'supervision')?.title).toBe('Supervision');
    expect(typed.officeEvents[0]?.assignedProviderId).toBe(485);
    expect(typed.officeEvents[0]?.bookedProviderId).toBe(12);
    expect(typed.officeEvents[0]?.bookedProviderName).toBe('Provider Two');
    expect(JSON.stringify(typed)).toContain('Jacquelyne Fernandez');
    expect(JSON.stringify(typed)).not.toContain('Client Jane');
    expect(JSON.stringify(typed)).not.toContain('Alice');
    expect(JSON.stringify(typed)).not.toMatch(/"clientId"\s*:\s*55/);
  });
});
