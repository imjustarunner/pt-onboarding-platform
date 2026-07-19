import { describe, it, expect } from 'vitest';
import {
  offsetToMinutes,
  resolveEffectiveChannels,
  diffAppointmentChanges
} from '../sessionNotification.service.js';

describe('sessionNotification helpers', () => {
  it('converts offset units to minutes', () => {
    expect(offsetToMinutes(1, 'days')).toBe(1440);
    expect(offsetToMinutes(2, 'hours')).toBe(120);
    expect(offsetToMinutes(30, 'minutes')).toBe(30);
  });

  it('locks channels tenants cannot disable', () => {
    const platform = {
      channels: { in_app: 'available', email: 'available', sms: 'consent_required', phone: 'disabled' },
      allowTenantDisable: { in_app: true, email: false, sms: true, phone: true }
    };
    const effective = resolveEffectiveChannels(platform, {
      in_app: false,
      email: false,
      sms: true,
      phone: true
    });
    expect(effective.email).toBe(true); // locked on
    expect(effective.in_app).toBe(false); // tenant may disable
    expect(effective.phone).toBe(false); // platform disabled
    expect(effective.sms).toBe(true);
  });

  it('diffs appointment fields for push updates', () => {
    const changes = diffAppointmentChanges(
      { startAt: '2026-07-18 15:00:00', providerUserId: 1 },
      { startAt: '2026-07-18 16:00:00', providerUserId: 1 },
      99
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('startAt');
    expect(changes[0].actorUserId).toBe(99);
  });
});
