import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../models/User.model.js', () => ({
  default: {
    findById: vi.fn(async () => ({ id: 1, role: 'provider' }))
  }
}));

vi.mock('../../models/UserPreferences.model.js', () => ({
  default: {
    findByUserId: vi.fn()
  }
}));

vi.mock('../../models/UserWorkSchedule.model.js', () => ({
  default: {
    isInsideWorkSchedule: vi.fn()
  }
}));

import NotificationGatekeeperService from '../notificationGatekeeper.service.js';
import UserPreferences from '../../models/UserPreferences.model.js';
import UserWorkSchedule from '../../models/UserWorkSchedule.model.js';

describe('notificationGatekeeper work schedule precedence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks email/SMS outside work schedule when quiet hours off and allow-outside off', async () => {
    UserPreferences.findByUserId.mockResolvedValue({
      email_enabled: true,
      sms_enabled: true,
      quiet_hours_enabled: false,
      allow_notifications_outside_work_schedule: false
    });
    UserWorkSchedule.isInsideWorkSchedule.mockResolvedValue(false);

    const decision = await NotificationGatekeeperService.decideChannels({
      userId: 1,
      context: {},
      now: new Date('2026-07-18T22:00:00')
    });

    expect(decision.email).toBe(false);
    expect(decision.sms).toBe(false);
    expect(decision.reasonCodes).toContain('work_schedule_outside_window');
  });

  it('allows delivery outside work schedule when allow-outside is on', async () => {
    UserPreferences.findByUserId.mockResolvedValue({
      email_enabled: true,
      sms_enabled: true,
      quiet_hours_enabled: false,
      allow_notifications_outside_work_schedule: true
    });
    UserWorkSchedule.isInsideWorkSchedule.mockResolvedValue(false);

    const decision = await NotificationGatekeeperService.decideChannels({
      userId: 1,
      context: {},
      now: new Date('2026-07-18T22:00:00')
    });

    expect(decision.email).toBe(true);
    expect(decision.sms).toBe(true);
    expect(decision.reasonCodes).toContain('work_schedule_bypass_allow_outside');
    expect(UserWorkSchedule.isInsideWorkSchedule).not.toHaveBeenCalled();
  });

  it('prefers quiet hours over work schedule when quiet hours enabled', async () => {
    UserPreferences.findByUserId.mockResolvedValue({
      email_enabled: true,
      sms_enabled: true,
      quiet_hours_enabled: true,
      quiet_hours_allowed_days: ['Monday'],
      quiet_hours_start_time: '09:00',
      quiet_hours_end_time: '17:00',
      allow_notifications_outside_work_schedule: false
    });
    UserWorkSchedule.isInsideWorkSchedule.mockResolvedValue(true);

    // Saturday evening — outside quiet hours
    const decision = await NotificationGatekeeperService.decideChannels({
      userId: 1,
      context: {},
      now: new Date('2026-07-18T20:00:00') // Saturday
    });

    expect(decision.email).toBe(false);
    expect(decision.reasonCodes).toContain('quiet_hours_outside_window');
    expect(UserWorkSchedule.isInsideWorkSchedule).not.toHaveBeenCalled();
  });

  it('urgent bypasses work schedule window', async () => {
    UserPreferences.findByUserId.mockResolvedValue({
      email_enabled: true,
      sms_enabled: true,
      quiet_hours_enabled: false,
      allow_notifications_outside_work_schedule: false
    });
    UserWorkSchedule.isInsideWorkSchedule.mockResolvedValue(false);

    const decision = await NotificationGatekeeperService.decideChannels({
      userId: 1,
      context: { isUrgent: true },
      now: new Date('2026-07-18T22:00:00')
    });

    expect(decision.email).toBe(true);
    expect(decision.sms).toBe(true);
    expect(decision.reasonCodes).toContain('window_bypass_urgent');
  });
});
