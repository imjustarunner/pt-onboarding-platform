import {
  EMAIL_AI_POLICY_MODES,
  extractClientReferenceHeuristic,
  isSenderAllowedForPolicy,
  isStatusIntentHeuristic,
  matchSchoolClient,
  normalizeEmailAiPolicyMode
} from '../inboundEmailPolicy.service.js';

describe('inboundEmailPolicy.service', () => {
  test('normalizes policy mode with safe fallback', () => {
    expect(normalizeEmailAiPolicyMode('draft_known_contacts_or_accounts'))
      .toBe(EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_CONTACTS_OR_ACCOUNTS);
    expect(normalizeEmailAiPolicyMode('unknown_mode')).toBe(EMAIL_AI_POLICY_MODES.HUMAN_ONLY);
  });

  test('detects status intent heuristically', () => {
    expect(isStatusIntentHeuristic({
      subject: 'Status on John Donahue?',
      bodyText: 'Can you share where we are at with docs?'
    })).toBe(true);
    expect(isStatusIntentHeuristic({
      subject: 'Lunch schedule',
      bodyText: 'Here is next week menu'
    })).toBe(false);
  });

  test('extracts client reference from common status phrasing', () => {
    expect(extractClientReferenceHeuristic({
      subject: 'Status update',
      bodyText: 'Can I get a status on Destiny Roberts?'
    })).toBe('Destiny Roberts');
  });

  test('matches school client and detects ambiguity', () => {
    const clients = [
      { id: 1, full_name: 'John Donahue', initials: 'JD', identifier_code: 'JOHN01' },
      { id: 2, full_name: 'Johnny Doe', initials: 'JD', identifier_code: 'JOHN02' }
    ];
    const strong = matchSchoolClient({ query: 'John Donahue', clients });
    expect(strong.match?.id).toBe(1);
    expect(strong.confidence).toBeGreaterThan(0.8);

    const ambiguous = matchSchoolClient({ query: 'JD', clients });
    expect(ambiguous.match).toBeNull();
    expect(['ambiguous', 'low_confidence']).toContain(ambiguous.reason);
  });

  test('matches by identifier code and shorthand alias', () => {
    const clients = [
      { id: 7, full_name: 'John Donahue', initials: 'JD', identifier_code: 'JDON-1023' },
      { id: 8, full_name: 'Destiny Roberts', initials: 'DR', identifier_code: 'DEST-8841' }
    ];

    const byCode = matchSchoolClient({ query: 'JDON1023', clients });
    expect(byCode.match?.id).toBe(7);
    expect(byCode.confidence).toBeGreaterThan(0.8);

    const byShorthand = matchSchoolClient({ query: 'JohDon', clients });
    expect(byShorthand.match?.id).toBe(7);
    expect(byShorthand.confidence).toBeGreaterThan(0.7);
  });

  test('evaluates sender policy gates', () => {
    expect(isSenderAllowedForPolicy({
      policyMode: EMAIL_AI_POLICY_MODES.HUMAN_ONLY,
      isKnownContact: true,
      isKnownAccount: true
    })).toBe(false);
    expect(isSenderAllowedForPolicy({
      policyMode: EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_CONTACTS_ONLY,
      isKnownContact: true,
      isKnownAccount: false
    })).toBe(true);
    expect(isSenderAllowedForPolicy({
      policyMode: EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_ACCOUNTS_ONLY,
      isKnownContact: true,
      isKnownAccount: false
    })).toBe(false);
  });
});
