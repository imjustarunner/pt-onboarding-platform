import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSchoolPrintablePacketEnabled,
  buildVirtualPrintablePacketDocument,
  SCHOOL_PRINTABLE_PACKET_VERSION
} from '../../constants/schoolPrintablePacket.js';
import {
  buildSchoolPrintablePacketHtml,
  buildSchoolStaffTableHtml,
  buildDisclosureCareTeamHtml,
  groupDisclosureProvidersByCareTeam,
  schoolPrintablePacketContentHash
} from '../schoolPrintablePacket.service.js';
import {
  formatDisclosureEducation,
  formatSupervisorTypeLabel,
  isDemoPacketIdentity,
  isDisclosureClinicalRole,
  isNonClinicalDisclosureTitle
} from '../smartDisclosure.service.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../../content/schoolPacketTemplateDefault.en.js';

test('enables school/program/learning orgs including Hogwarts demo', () => {
  assert.equal(isSchoolPrintablePacketEnabled({
    slug: 'springfield-high',
    portal_url: 'springfield-high',
    organization_type: 'school',
    name: 'Springfield High'
  }), true);
  assert.equal(isSchoolPrintablePacketEnabled({
    slug: 'hogwarts',
    portal_url: 'hogwarts',
    organization_type: 'school',
    name: 'Hogwarts'
  }), true);
  assert.equal(isSchoolPrintablePacketEnabled({ organization_type: 'agency', name: 'ITSCO' }), false);
});

test('builds virtual library document metadata with template version', () => {
  const doc = buildVirtualPrintablePacketDocument({
    schoolOrganizationId: 42,
    org: { name: 'Springfield High' },
    templateVersion: 3
  });
  assert.equal(doc.kind, 'system_printable_packet');
  assert.match(doc.title, /Springfield High/);
  assert.match(doc.title, /School Packet/);
  assert.doesNotMatch(doc.title, /Blank Referral Packet/i);
  assert.equal(doc.packet_version, '3');
  assert.equal(doc.packet_content_version, SCHOOL_PRINTABLE_PACKET_VERSION);
  assert.equal(doc.is_virtual, true);
});

test('groups disclosure providers into your care team vs potential care team', () => {
  const grouped = groupDisclosureProvidersByCareTeam([
    { fullName: 'Assigned A', schoolAssigned: true, category: 'FULLY_LICENSED' },
    { fullName: 'Potential B', schoolAssigned: false, category: 'PRE_LICENSED' },
    { fullName: 'Assigned C', schoolAssigned: true, category: 'UNLICENSED' }
  ]);
  assert.equal(grouped.yourCareTeam.length, 2);
  assert.equal(grouped.potentialCareTeam.length, 1);
  assert.equal(grouped.potentialCareTeam[0].fullName, 'Potential B');
});

test('formats supervisor type with leading capital', () => {
  assert.equal(formatSupervisorTypeLabel('clinical'), 'Clinical');
  assert.equal(formatSupervisorTypeLabel('BILLING'), 'Billing');
  assert.equal(formatSupervisorTypeLabel(''), 'Clinical');
});

test('formats education to graduate degree only without GPA/honors', () => {
  const formatted = formatDisclosureEducation(
    "Bachelor of Arts, Political Science – Christopher Newport University | GPA: 3.74| 2017-2020 Deans Academic Honor List\nMaster of Arts in Counseling – Adams State University | Expected May 2027"
  );
  assert.match(formatted, /Master/i);
  assert.doesNotMatch(formatted, /GPA/i);
  assert.doesNotMatch(formatted, /Honor/i);
  assert.doesNotMatch(formatted, /Bachelor/i);
  assert.equal(
    formatDisclosureEducation('Bachelors of Arts Spanish | GPA: 3.9 Dean\'s List'),
    null
  );
});

test('builds authorized school staff table from non-scheduler roster rows', () => {
  const html = buildSchoolStaffTableHtml([
    {
      first_name: 'Jane',
      last_name: 'Doe',
      role_title: 'Special Education Director',
      phone_number: '555-0100',
      email: 'jane@school.org'
    }
  ]);
  assert.match(html, /packet-staff-table/);
  assert.match(html, /Jane Doe/);
  assert.match(html, /Special Education Director/);
  assert.match(html, /jane@school\.org/);
  // One staff row + two handwritten blank rows
  assert.equal((html.match(/<tr>/g) || []).length, 1 + 1 + 2); // header + jane + 2 blanks
  assert.equal((html.match(/form-blank/g) || []).length, 8); // 2 blank rows × 4 cells
});

test('builds four empty fill-in rows when no school staff are attached', () => {
  const html = buildSchoolStaffTableHtml([]);
  assert.doesNotMatch(html, /No authorized school staff listed/);
  assert.equal((html.match(/form-blank/g) || []).length, 16); // 4 blank rows × 4 cells
});

test('builds disclosure care team HTML with bold names and centered section titles', () => {
  const html = buildDisclosureCareTeamHtml([
    {
      fullName: 'School Assigned',
      schoolAssigned: true,
      category: 'FULLY_LICENSED',
      credential: 'LPC',
      licenseNumber: 'LPC-1',
      supervisors: [{ fullName: 'Pat Supervisor', type: 'clinical' }]
    },
    {
      fullName: 'Agency Only',
      schoolAssigned: false,
      category: 'PRE_LICENSED',
      credential: 'LPCC',
      licenseNumber: 'LPCC-2'
    }
  ]);
  assert.match(html, /Your Care Team/);
  assert.match(html, /Potential Care Team Members/);
  assert.match(html, /packet-provider-name">School Assigned/);
  assert.match(html, /Pat Supervisor, Clinical/);
  assert.match(html, /Agency Only/);
});

test('merges live tokens into agency template HTML with cover and fonts', () => {
  const html = buildSchoolPrintablePacketHtml({
    version: 2,
    packetVersionLabel: SCHOOL_PRINTABLE_PACKET_VERSION,
    organization: {
      name: 'Springfield High',
      address: '123 Main St, Colorado Springs, CO 80903'
    },
    templateHtml: DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
    staffRows: [{
      first_name: 'Jane',
      last_name: 'Doe',
      role_title: 'Counselor',
      email: 'jane@school.org'
    }],
    providers: [{
      fullName: 'Alex Provider',
      schoolAssigned: true,
      category: 'FULLY_LICENSED',
      credential: 'LPC',
      licenseNumber: 'LPC-100'
    }]
  });

  assert.match(html, /packet-cover/);
  assert.match(html, /cover-photo|cover-title/);
  assert.match(html, /Springfield High School Packet/);
  assert.doesNotMatch(html, /BLANK SCHOOL PACKET/);
  assert.match(html, /Comfortaa/);
  assert.match(html, /Anton/);
  assert.match(html, /form-blank/);
  assert.match(html, /deny-col/);
  assert.match(html, /Deny/);
  assert.match(html, /Springfield High/);
  assert.match(html, /123 Main St, Colorado Springs, CO 80903/);
  assert.match(html, /Jane Doe/);
  assert.match(html, /Your Care Team/);
  assert.match(html, /Alex Provider/);
  assert.match(html, /Client Rights/i);
  assert.match(html, /Please retain these documents for your personal records/i);
  assert.match(html, /INSURANCE INFORMATION/);
  assert.match(html, /MINOR CONSENT/);
  assert.match(html, /page-break/);
  assert.match(html, /INTAKE QUESTIONNAIRE/);
  assert.doesNotMatch(html, /\{\{SCHOOL_NAME\}\}/);
  assert.doesNotMatch(html, /\{\{SCHOOL_STAFF_TABLE\}\}/);
  assert.doesNotMatch(html, /\{\{DISCLOSURE_CARE_TEAM\}\}/);
});

test('content hash changes when school staff roster changes, not when unrelated fields do', () => {
  const base = {
    version: 1,
    locale: 'en',
    packetVersionLabel: '1.15',
    organization: { name: 'Grant Elementary School', address: '1 Main St' },
    staffRows: [{ school_staff_user_id: 10 }],
    providers: [{ id: 20 }]
  };
  const a = schoolPrintablePacketContentHash(base);
  const b = schoolPrintablePacketContentHash({
    ...base,
    staffRows: [{ school_staff_user_id: 10 }, { school_staff_user_id: 11 }]
  });
  const c = schoolPrintablePacketContentHash({
    ...base,
    generatedAt: new Date('2099-01-01')
  });
  assert.notEqual(a, b);
  assert.equal(a, c);
});

test('disclosure clinical roles include CPA and provider plus, exclude admin', () => {
  assert.equal(isDisclosureClinicalRole('clinical_practice_assistant'), true);
  assert.equal(isDisclosureClinicalRole('CPA'), true);
  assert.equal(isDisclosureClinicalRole('provider_plus'), true);
  assert.equal(isDisclosureClinicalRole('Provider Plus'), true);
  assert.equal(isDisclosureClinicalRole('intern_plus'), true);
  assert.equal(isDisclosureClinicalRole('facilitator'), true);
  assert.equal(isDisclosureClinicalRole('admin'), false);
  assert.equal(isDisclosureClinicalRole('super_admin'), false);
  assert.equal(isDisclosureClinicalRole('staff'), false);
  assert.equal(isDisclosureClinicalRole('school_staff'), false);
  assert.equal(isNonClinicalDisclosureTitle('Credentialing Specialist'), true);
  assert.equal(isNonClinicalDisclosureTitle('Billing & Support Specialist'), true);
  assert.equal(isNonClinicalDisclosureTitle('Therapist'), false);
});

test('demo packet identity covers known test disclosure names', () => {
  assert.equal(isDemoPacketIdentity({ first_name: 'Robin', last_name: 'Williams' }), true);
  assert.equal(isDemoPacketIdentity({ first_name: 'Piper', last_name: 'Finch' }), true);
  assert.equal(isDemoPacketIdentity({ first_name: 'QR', last_name: 'Tester' }), true);
  assert.equal(isDemoPacketIdentity({ first_name: 'Admin', last_name: 'One' }), true);
  assert.equal(isDemoPacketIdentity({ first_name: 'Harry', last_name: 'Potter' }), true);
  assert.equal(isDemoPacketIdentity({ first_name: 'Ivy', last_name: 'Boyer-Morton' }), false);
});

test('care team grouping drops demo/test identities even if they were school-assigned', () => {
  const grouped = groupDisclosureProvidersByCareTeam([
    { id: 1, fullName: 'Robin Williams', schoolAssigned: true, category: 'PRE_LICENSED' },
    { id: 2, fullName: 'Real Provider', schoolAssigned: true, category: 'FULLY_LICENSED' }
  ]);
  assert.equal(grouped.yourCareTeam.length, 1);
  assert.equal(grouped.yourCareTeam[0].fullName, 'Real Provider');
});
