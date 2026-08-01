import { describe, expect, it } from 'vitest';
import {
  activeBriefingSections,
  buildTenantBlend,
  isLivePrivilegedPresence,
  isPrivilegedLoginBriefingUser,
  parseBrandPalette
} from '../privilegedLoginBriefing';

describe('privileged login briefing rules', () => {
  it('allows only active admin, support, and superadmin users', () => {
    expect(isPrivilegedLoginBriefingUser({ role: 'admin', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isPrivilegedLoginBriefingUser({ role: 'support', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isPrivilegedLoginBriefingUser({ role: 'super_admin', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isPrivilegedLoginBriefingUser({ role: 'provider', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isPrivilegedLoginBriefingUser({ role: 'admin', status: 'INACTIVE_EMPLOYEE' })).toBe(false);
    expect(isPrivilegedLoginBriefingUser({ role: 'support', status: 'ARCHIVED' })).toBe(false);
  });

  it('removes empty briefing sections', () => {
    const result = activeBriefingSections({
      messages: { count: 0, items: [] },
      tickets: { count: 2, items: [] },
      calendar: { count: 0, items: [{ id: 1 }] }
    });
    expect(result.map((section) => section.key)).toEqual(['tickets', 'calendar']);
  });

  it('keeps only live privileged presence rows', () => {
    expect(isLivePrivilegedPresence({ role: 'admin', status: 'online' })).toBe(true);
    expect(isLivePrivilegedPresence({ role: 'support', status: 'idle' })).toBe(true);
    expect(isLivePrivilegedPresence({ role: 'admin', status: 'offline' })).toBe(false);
    expect(isLivePrivilegedPresence({ role: 'staff', status: 'online' })).toBe(false);
  });

  it('parses palettes and builds a multi-tenant gradient', () => {
    expect(parseBrandPalette({ color_palette: '{"primary":"#112233"}' }).primary).toBe('#112233');
    const blend = buildTenantBlend([
      { color_palette: { primary: '#112233' } },
      { colorPalette: { primary: '#abcdef' } }
    ]);
    expect(blend).toContain('linear-gradient');
    expect(blend).toContain('#112233');
    expect(blend).toContain('#abcdef');
  });
});
