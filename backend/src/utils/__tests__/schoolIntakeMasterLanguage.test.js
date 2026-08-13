import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureSpanishClarificationFirst,
  localizeSchoolReferralPacketTitle,
  resolveRequestedMasterLanguage
} from '../schoolIntakeMasterLanguage.js';

describe('resolveRequestedMasterLanguage', () => {
  it('reads locale from query-like objects', () => {
    assert.equal(resolveRequestedMasterLanguage({ locale: 'es' }, 'en'), 'es');
    assert.equal(resolveRequestedMasterLanguage({ lang: 'en-US' }, 'es'), 'en');
    assert.equal(resolveRequestedMasterLanguage({ formLocale: 'es' }, 'en'), 'es');
  });

  it('falls back to the link language', () => {
    assert.equal(resolveRequestedMasterLanguage({}, 'es'), 'es');
    assert.equal(resolveRequestedMasterLanguage(null, 'en'), 'en');
  });
});

describe('ensureSpanishClarificationFirst', () => {
  it('prepends the Spanish clarification step when missing on ES', () => {
    const out = ensureSpanishClarificationFirst(
      [{ type: 'school_roi', label: 'School ROI' }],
      'es'
    );
    assert.equal(out[0].type, 'spanish_clarification');
    assert.equal(out[1].type, 'school_roi');
  });

  it('moves an existing clarification step to the front', () => {
    const out = ensureSpanishClarificationFirst(
      [
        { type: 'school_roi', label: 'School ROI' },
        { type: 'communications', label: 'Communication preferences' },
        { type: 'spanish_clarification', label: 'Aclaración de idioma' }
      ],
      'es'
    );
    assert.equal(out[0].type, 'spanish_clarification');
    assert.equal(out[out.length - 1].type, 'communications');
  });

  it('strips the clarification step from English masters', () => {
    const out = ensureSpanishClarificationFirst(
      [
        { type: 'spanish_clarification', label: 'Aclaración de idioma' },
        { type: 'school_roi', label: 'School ROI' }
      ],
      'en'
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'school_roi');
  });
});

describe('localizeSchoolReferralPacketTitle', () => {
  it('uses Spanish packet naming and drops (English)', () => {
    assert.equal(
      localizeSchoolReferralPacketTitle('Smart School Referral Packet (English)', 'es'),
      'Paquete digital de referidos escolares'
    );
  });
});
