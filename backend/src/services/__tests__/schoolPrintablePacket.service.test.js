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
  groupDisclosureProvidersByCareTeam
} from '../schoolPrintablePacket.service.js';
import {
  formatDisclosureEducation,
  formatSupervisorTypeLabel
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
  assert.match(html, /packet-watermark|Comfortaa/);
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
  assert.match(html, /Client Rights and Disclosures/i);
  assert.match(html, /page-break/);
  assert.doesNotMatch(html, /INTAKE QUESTIONNAIRE/);
  assert.doesNotMatch(html, /\{\{SCHOOL_NAME\}\}/);
  assert.doesNotMatch(html, /\{\{SCHOOL_STAFF_TABLE\}\}/);
  assert.doesNotMatch(html, /\{\{DISCLOSURE_CARE_TEAM\}\}/);
});
