import { describe, it, expect } from 'vitest';
import {
  defaultOfficePacketHtml,
  looksLikeSchoolSeedHtml
} from '../officePacketTemplateDefault.js';

describe('officePacketTemplateDefault', () => {
  it('builds independent self and parent English packets with the four legal sections', () => {
    const self = defaultOfficePacketHtml('self', 'en');
    const parent = defaultOfficePacketHtml('parent', 'en');

    expect(self).toMatch(/Client Enrollment Packet/);
    expect(parent).toMatch(/Parent\/Guardian Enrollment Packet/);
    expect(self).not.toMatch(/Parent\/Guardian Enrollment Packet/);
    expect(parent).not.toMatch(/Client Enrollment Packet/);

    for (const html of [self, parent]) {
      expect(html).toMatch(/CLIENT RIGHTS/i);
      expect(html).toMatch(/MENTAL HEALTH PROFESSIONAL INFORMATION/i);
      expect(html).toMatch(/DISCLOSURE_CARE_TEAM/);
      expect(html).toMatch(/INFORMED CONSENT/i);
      expect(html).toMatch(/POLICY AND SERVICES AGREEMENT/i);
      expect(html).toMatch(/HIPAA Privacy Policy/i);
      expect(html).not.toMatch(/INTAKE QUESTIONNAIRE/i);
      expect(html).not.toMatch(/Confidentiality in Schools/i);
      expect(html).not.toMatch(/About our Services In The Schools/i);
    }

    expect(parent).toMatch(/MINOR CONSENT/i);
    expect(self).not.toMatch(/MINOR CONSENT/i);
  });

  it('builds Spanish packets with the matching legal headings', () => {
    const self = defaultOfficePacketHtml('self', 'es');
    const parent = defaultOfficePacketHtml('parent', 'es');
    expect(self).toMatch(/Paquete de Inscripción del Cliente/);
    expect(parent).toMatch(/Paquete de Inscripción para Padre\/Tutor/);
    expect(parent).toMatch(/CONSENTIMIENTO DE MENOR/i);
    expect(self).not.toMatch(/CONSENTIMIENTO DE MENOR/i);
    for (const html of [self, parent]) {
      expect(html).toMatch(/CONSENTIMIENTO INFORMADO/i);
      expect(html).toMatch(/ACUERDO DE POLÍTICAS Y SERVICIOS/i);
      expect(html).toMatch(/DERECHOS DEL CLIENTE/i);
      expect(html).toMatch(/HIPAA/i);
    }
  });

  it('detects leftover school-seed HTML', () => {
    expect(looksLikeSchoolSeedHtml('<h1>INTAKE QUESTIONNAIRE</h1>')).toBe(true);
    expect(looksLikeSchoolSeedHtml(defaultOfficePacketHtml('self', 'en'))).toBe(false);
  });
});
