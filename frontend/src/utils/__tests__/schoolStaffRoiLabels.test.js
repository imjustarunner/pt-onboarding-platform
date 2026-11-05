import { describe, expect, it } from 'vitest';
import {
  isSchoolScheduleClientLocked,
  schoolStaffCanOpenFromState,
  schoolStaffCanCollaborateFromState,
  schoolStaffCanInterfaceFromState,
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

  it('treats No ROI, limited, speak, all-active, and expired as open', () => {
    expect(schoolStaffCanOpenFromState('none')).toBe(true);
    expect(schoolStaffCanOpenFromState('packet')).toBe(true);
    expect(schoolStaffCanOpenFromState('limited')).toBe(true);
    expect(schoolStaffCanOpenFromState('roi')).toBe(true);
    expect(schoolStaffCanOpenFromState('roi_docs')).toBe(true);
    expect(schoolStaffCanOpenFromState('expired')).toBe(true);
  });

  it('keeps own-document scope off for ROI All Active', () => {
    expect(schoolStaffOwnDocumentsOnly('limited')).toBe(true);
    expect(schoolStaffOwnDocumentsOnly('roi')).toBe(true);
    expect(schoolStaffOwnDocumentsOnly('expired')).toBe(false);
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
      school_portal_can_open: true,
      school_portal_force_placeholder: false
    })).toBe(false);
  });
});

it('keeps expired-ROI schedule entries open despite a stale lock flag without unlocking missing ROI',()=>{
 expect(isSchoolScheduleClientLocked({school_staff_effective_access_state:'expired',school_portal_can_open:false,school_portal_force_placeholder:true})).toBe(false);
 expect(isSchoolScheduleClientLocked({school_staff_effective_access_state:'none',school_portal_can_open:true})).toBe(false);
});

it('keeps expired overviews open but blocks all collaboration', () => {
  expect(schoolStaffCanOpenFromState('expired')).toBe(true);
  expect(schoolStaffCanCollaborateFromState('expired')).toBe(false);
  expect(schoolStaffCanInterfaceFromState('none')).toBe(true);
  expect(schoolStaffCanInterfaceFromState('packet')).toBe(true);
  expect(schoolStaffCanCollaborateFromState('none')).toBe(false);
  for (const state of ['limited', 'roi', 'roi_docs']) expect(schoolStaffCanCollaborateFromState(state)).toBe(true);
  expect(isSchoolScheduleClientLocked({school_staff_effective_access_state: 'expired', school_portal_can_open: false})).toBe(false);
});
