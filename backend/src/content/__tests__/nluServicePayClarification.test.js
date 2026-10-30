import { describe, expect, it } from 'vitest';
import { applyNluServicePayClarification } from '../nluServicePayClarification.js';
import { getHandbookSource } from '../../services/workplaceHandbookContent.js';

describe('NLU staff handbook service pay classification', () => {
  it('shows the H2014 program allowance and distinct clinical credits in the staff reference edition', () => {
    const book = getHandbookSource({ slug: 'nlu' }, { employeeTemplates: [] });
    const comparison = book.sections.find(s => s.slug === 'service-code-compensation-and-authorizations').body_html;
    expect(comparison).toContain('H2014 within NLU’s authorized Therapy + Tutoring program');
    expect(comparison).toContain('10 paid minutes per direct-hour equivalent for Categories 1, 2 and 3');
    expect(comparison).toContain('One unit adds 2.5 minutes; four units add 10 minutes');
    expect(comparison).toContain('No separate automatic 10-minute Direct Care allowance');
    expect(comparison).toContain('99414 and 99416 when mapped to supervision/indirect work');
    expect(comparison).toContain('Employee compensation category and service pay type are different');
    for (const slug of ['colorado-billing-compensation-appendix', 'nlu-tutoring-and-h2014-compensation']) {
      expect(book.sections.find(s => s.slug === slug).body_html).toContain('H2014 is the Therapy + Tutoring H-code program pay type');
    }
  });

  it('preserves existing authorization text and is idempotent', () => {
    const source = { sections: [{ slug: 'service-code-compensation-and-authorizations', bodyHtml: '<p>Written authorization required.</p>', status: 'ready' }] };
    applyNluServicePayClarification(source, 'nlu');
    const once = structuredClone(source);
    expect(source.sections[0].bodyHtml).toContain('<p>Written authorization required.</p>');
    expect(source.sections[0].bodyHtml).toContain('preserve any greater agreed allowance');
    expect(applyNluServicePayClarification(source, 'nlu')).toEqual(once);
  });

  it('leaves other companies unchanged and keeps the all-company Category 1 correction', () => {
    for (const tenant of ['itsco', 'isi']) {
      const source = { sections: [{ slug: 'service-code-compensation-and-authorizations', bodyHtml: '<p>Existing policy</p>' }] };
      const before = structuredClone(source);
      expect(applyNluServicePayClarification(source, tenant)).toEqual(before);
      const book = getHandbookSource({ slug: tenant === 'isi' ? 'tisi' : tenant }, { employeeTemplates: [] });
      const text = book.sections.map(s => s.body_html).join('\n');
      expect(text).toContain('All employees in Categories 1, 2 and 3 receive an automatic paid indirect allowance');
      expect(text).not.toContain('H2014 within NLU’s authorized Therapy + Tutoring program');
    }
  });
});
