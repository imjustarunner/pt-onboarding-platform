import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
import pool from '../../config/database.js';
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import { buildSmartSchoolRoiContext, normalizeSmartSchoolRoiResponse } from '../smartSchoolRoi.service.js';
import { buildSchoolStaffTableHtml, schoolPrintablePacketContentHash } from '../schoolPrintablePacket.service.js';

const row = { school_staff_user_id: 7, first_name: 'School', last_name: 'Contact', school_phone_number: '303-555-0100' };
beforeEach(() => vi.clearAllMocks());

it.each([null, '', '   '])('uses the school main number in printable and digital ROIs for a blank override (%s)', async phone => {
  pool.execute.mockResolvedValue([[{ ...row, phone_number: phone, personal_phone: '303-555-0199' }]]);
  const staffRows = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({ schoolOrganizationId: 20 });
  expect(staffRows[0].phone_number).toBe('303-555-0100');
  expect(buildSchoolStaffTableHtml(staffRows)).toContain('303-555-0100');
  const context = await buildSmartSchoolRoiContext({ link: { organization_id: 20 }, boundClient: { id: 3, organization_id: 20 } });
  expect(context.staffRoster[0].phone).toBe('303-555-0100');
  const response = normalizeSmartSchoolRoiResponse({ roiContext: context });
  expect(response.staffDecisions[0].phone).toBe('303-555-0100');
});

it('preserves explicit staff overrides and leaves genuinely missing numbers blank', async () => {
  pool.execute.mockResolvedValue([[{ ...row, phone_number: ' 303-555-0123 ' }, { ...row, school_staff_user_id: 8, school_phone_number: null }]]);
  const staff = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({ schoolOrganizationId: 20 });
  expect(staff.map(s => s.phone_number)).toEqual(['303-555-0123', null]);
});

it('changes the printable packet cache hash when the default school number changes', async () => {
  pool.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ ...row, school_phone_number: '303-555-0111' }]]);
  const before = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({ schoolOrganizationId: 20 });
  const after = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({ schoolOrganizationId: 20 });
  expect(schoolPrintablePacketContentHash({ staffRows: before })).not.toBe(schoolPrintablePacketContentHash({ staffRows: after }));
});
