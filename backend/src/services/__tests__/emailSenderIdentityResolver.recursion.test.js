import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../models/EmailSenderIdentity.model.js', () => ({
  default: {
    findById: vi.fn(async (id) => ({
      id: Number(id),
      identity_key: 'school_intake',
      from_email: 'notifications@itsco.health',
      display_name: 'ITSCO - School Intake',
      is_active: 1,
      agency_id: 2
    })),
    list: vi.fn(async () => ([
      {
        id: 2,
        identity_key: 'school_intake',
        from_email: 'notifications@itsco.health',
        display_name: 'ITSCO - School Intake',
        is_active: 1,
        agency_id: 2
      }
    ]))
  }
}));

vi.mock('../../models/NotificationTrigger.model.js', () => ({
  default: { findByKey: vi.fn(async () => null) }
}));

vi.mock('../../models/AgencyNotificationTriggerSetting.model.js', () => ({
  default: { listForAgency: vi.fn(async () => []) }
}));

vi.mock('../emailSettings.service.js', () => ({
  getAgencyEmailSettings: vi.fn(async () => ({
    templateSenderIdentityIds: {},
    defaultSenderIdentityId: null
  }))
}));

describe('resolvePreferredSenderIdentityForAgency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves without infinite recursion when no explicit sender is configured', async () => {
    const {
      resolvePreferredSenderIdentityForAgency,
      resolveConfiguredSenderIdentity
    } = await import('../emailSenderIdentityResolver.service.js');

    const preferredPromise = resolvePreferredSenderIdentityForAgency({
      agencyId: 2,
      preferredKeys: ['school_intake', 'notifications'],
      includePlatformDefaults: false,
      onlyActive: true
    });
    const configuredPromise = resolveConfiguredSenderIdentity({
      agencyId: 2,
      preferredKeys: ['school_intake', 'notifications'],
      includePlatformDefaults: false,
      onlyActive: true
    });

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('identity resolution hung (likely recursion)')), 1500);
    });

    const preferred = await Promise.race([preferredPromise, timeout]);
    const configured = await Promise.race([configuredPromise, timeout]);

    expect(preferred?.id).toBe(2);
    expect(configured?.id).toBe(2);
  });
});
