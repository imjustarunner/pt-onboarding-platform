import { describe, expect, it } from 'vitest';
import {
  isSchoolScheduleClientLocked,
  schoolStaffCanOpenFromState,
  schoolStaffHidesReferralPackets,
  schoolStaffOwnDocumentsOnly,
  schoolStaffRoiLabel
} from '../schoolStaffRoiLabels.js';

describe('schoolStaffRoiLabels', () => {
  it('labels the three open ROI levels', () => {
    expect(schoolStaffRoiLabel('limited')).toBe('ROI Active');
    expect(schoolStaffRoiLabel('roi')).toBe('ROI (Speak)');
    expect(schoolStaffRoiLabel('roi_docs')).toBe('ROI All Active');
    expect(schoolStaffRoiLabel('packet')).toBe('No ROI on file');
  });

  it('treats limited, speak, all-active, and expired as open', () => {
    expect(schoolStaffCanOpenFromState('limited')).toBe(true);
    expect(schoolStaffCanOpenFromState('roi')).toBe(true);
    expect(schoolStaffCanOpenFromState('roi_docs')).toBe(true);
    expect(schoolStaffCanOpenFromState('expired')).toBe(true);
    expect(schoolStaffCanOpenFromState('packet')).toBe(false);
  });

  it('keeps own-document scope off for ROI All Active', () => {
    expect(schoolStaffOwnDocumentsOnly('limited')).toBe(true);
    expect(schoolStaffOwnDocumentsOnly('roi')).toBe(true);
    expect(schoolStaffOwnDocumentsOnly('expired')).toBe(true);
    expect(schoolStaffOwnDocumentsOnly('roi_docs')).toBe(false);
  });

  it('hides referral packets for ROI (Speak), including own uploads', () => {
    expect(schoolStaffHidesReferralPackets('roi')).toBe(true);
    expect(schoolStaffHidesReferralPackets('limited')).toBe(false);
    expect(schoolStaffHidesReferralPackets('roi_docs')).toBe(false);
  });

  it('does not grey ROI Active / Speak / All Active on the schedule', () => {
    expect(isSchoolScheduleClientLocked({
      school_staff_effective_access_state: 'limited',
      school_portal_can_open: false,
      school_portal_force_placeholder: true
    })).toBe(false);
    expect(isSchoolScheduleClientLocked({
      school_staff_effective_access_state: 'roi',
      school_portal_can_open: true
    })).toBe(false);
    expect(isSchoolScheduleClientLocked({
      school_staff_effective_access_state: 'packet',
      school_portal_can_open: false,
      school_portal_force_placeholder: true
    })).toBe(true);
  });
});
