import { describe, it, expect } from 'vitest';
import {
  extractPacketSectionHtml,
  hashPacketSectionHtml,
  PACKET_SECTION_KEYS,
  stepTypeToSectionKey
} from '../schoolPacketSections.service.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../../content/schoolPacketTemplateDefault.en.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES } from '../../content/schoolPacketTemplateDefault.es.js';

describe('schoolPacketSections.service', () => {
  it('extracts informed+group consent from English default template', () => {
    const html = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
      PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT
    );
    expect(html).toMatch(/INFORMED CONSENT/i);
    expect(html).toMatch(/GROUP CONSENT/i);
    expect(html).not.toMatch(/POLICY AND SERVICES AGREEMENT/i);
    expect(html).not.toMatch(/CLIENT RIGHTS/i);
  });

  it('finds HIPAA when the heading uses a literal ampersand or the word and', () => {
    const amp = extractPacketSectionHtml(
      '<h2>HIPAA Privacy Policy &amp; Notice of Privacy Practices</h2><p>Body</p>',
      PACKET_SECTION_KEYS.HIPAA_NOTICE
    );
    expect(amp).toMatch(/Body/);

    const and = extractPacketSectionHtml(
      '<h2>HIPAA Privacy Policy and Notice of Privacy Practices</h2><p>Also</p>',
      PACKET_SECTION_KEYS.HIPAA_NOTICE
    );
    expect(and).toMatch(/Also/);
  });

  it('extracts HIPAA notice from English default template even when the heading uses &amp;', () => {
    const html = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
      PACKET_SECTION_KEYS.HIPAA_NOTICE
    );
    expect(html).toMatch(/HIPAA Privacy Policy/i);
    expect(html).toMatch(/Notice of Privacy Practices/i);
    expect(html).not.toMatch(/POLICY AND SERVICES AGREEMENT/i);
  });

  it('extracts policy and services from English default template', () => {
    const html = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
      PACKET_SECTION_KEYS.POLICY_SERVICES
    );
    expect(html).toMatch(/POLICY AND SERVICES AGREEMENT/i);
    expect(html).not.toMatch(/CLIENT RIGHTS/i);
    expect(html).not.toMatch(/INFORMED CONSENT/i);
  });

  it('extracts Spanish section headings from ES default template', () => {
    const consent = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES,
      PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT
    );
    expect(consent).toMatch(/CONSENTIMIENTO INFORMADO/i);
    expect(consent).toMatch(/CONSENTIMIENTO GRUPAL/i);

    const policy = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES,
      PACKET_SECTION_KEYS.POLICY_SERVICES
    );
    expect(policy).toMatch(/ACUERDO DE POLÍTICAS Y SERVICIOS/i);

    const hipaa = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES,
      PACKET_SECTION_KEYS.HIPAA_NOTICE
    );
    expect(hipaa).toMatch(/HIPAA/i);
  });

  it('hashes section html stably', () => {
    const html = extractPacketSectionHtml(
      DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
      PACKET_SECTION_KEYS.POLICY_SERVICES
    );
    expect(hashPacketSectionHtml(html)).toBe(hashPacketSectionHtml(html));
    expect(hashPacketSectionHtml(html)).toHaveLength(64);
  });

  it('maps step types to section keys', () => {
    expect(stepTypeToSectionKey('packet_informed_group_consent')).toBe('informed_group_consent');
    expect(stepTypeToSectionKey('packet_policy_services')).toBe('policy_services');
    expect(stepTypeToSectionKey('document')).toBeNull();
  });
});
