import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultOfficePacketHtml,
  applyNluOfficeLegalIfNeeded,
  officePacketHasNluPolicy,
  officePacketHasNluInformed,
  officePacketHasNluHipaa
} from '../officePacketTemplateDefault.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../schoolPacketTemplateDefault.en.js';
import {
  extractPacketSectionHtml,
  replacePacketSectionHtml,
  PACKET_SECTION_KEYS
} from '../../services/schoolPacketSections.service.js';

test('ITSCO office seed stays independent from the school packet and tokenizes the disclosure entity', () => {
  const itscoOffice = defaultOfficePacketHtml('self', 'en');
  assert.match(itscoOffice, /POLICY AND SERVICES AGREEMENT/i);
  assert.doesNotMatch(itscoOffice, /WELCOME TO NEXT LEVEL UP/i);
  assert.doesNotMatch(itscoOffice, /About our Services In The Schools/i);
  assert.match(itscoOffice, /Business Entity:<\/strong> \{\{AGENCY_NAME\}\}/);
  assert.match(DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML, /About our Services In The Schools/i);
  assert.doesNotMatch(DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML, /WELCOME TO NEXT LEVEL UP/i);
});

test('NLU overlay replaces office informed consent, policy, and HIPAA', () => {
  const itscoOffice = defaultOfficePacketHtml('self', 'en');
  const nluOffice = applyNluOfficeLegalIfNeeded(itscoOffice);
  assert.equal(officePacketHasNluPolicy(nluOffice), true);
  assert.equal(officePacketHasNluInformed(nluOffice), true);
  assert.equal(officePacketHasNluHipaa(nluOffice), true);
  assert.match(nluOffice, /Cost Estimates for Services/i);
  assert.match(nluOffice, /Digital Platforms, Virtual Services/);
  assert.match(nluOffice, /PO@NextLevelUpLCC\.com/i);
  assert.match(nluOffice, /CLIENT RIGHTS/i);
  assert.doesNotMatch(nluOffice, /About our Services In The Schools/i);
  assert.doesNotMatch(nluOffice, /Confidentiality in Schools/i);
  assert.doesNotMatch(nluOffice, /GROUP CONSENT/i);
  assert.equal(applyNluOfficeLegalIfNeeded(nluOffice), nluOffice);

  const informed = extractPacketSectionHtml(nluOffice, PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT);
  assert.match(informed, /Welcome to Next Level Up/i);
  assert.doesNotMatch(informed, /POLICY AND SERVICES AGREEMENT/i);

  const policy = extractPacketSectionHtml(nluOffice, PACKET_SECTION_KEYS.POLICY_SERVICES);
  assert.match(policy, /WELCOME TO NEXT LEVEL UP/i);
  assert.doesNotMatch(policy, /CLIENT RIGHTS/i);

  const hipaa = extractPacketSectionHtml(nluOffice, PACKET_SECTION_KEYS.HIPAA_NOTICE);
  assert.match(hipaa, /As a healthcare provider, Next Level Up is required/i);
  assert.doesNotMatch(hipaa, /School Portal Data Transfer/i);
});

test('replacePacketSectionHtml swaps policy without touching neighbors', () => {
  const html = `
      <h2>INFORMED CONSENT</h2>
      <p>Consent body</p>
      <h2>POLICY AND SERVICES AGREEMENT</h2>
      <p>Old ITSCO policy</p>
      <h2>CLIENT RIGHTS</h2>
      <p>Rights body</p>
    `;
  const replaced = replacePacketSectionHtml(
    html,
    PACKET_SECTION_KEYS.POLICY_SERVICES,
    '<h2>POLICY AND SERVICES AGREEMENT</h2><p>WELCOME TO NEXT LEVEL UP!</p>'
  );
  assert.match(replaced, /Consent body/);
  assert.match(replaced, /WELCOME TO NEXT LEVEL UP/);
  assert.match(replaced, /Rights body/);
  assert.doesNotMatch(replaced, /Old ITSCO policy/);
  assert.equal(replacePacketSectionHtml(html, PACKET_SECTION_KEYS.POLICY_SERVICES, ''), html);
});
