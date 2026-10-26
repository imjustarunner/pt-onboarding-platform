import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTicketAnswerEmbeddingDocument,
  combineHybridRetrievalScore,
  cosineSimilarity,
  deidentifySchoolReplyText,
  rankHybridReplyMatches,
  rankHistoricalReplyCandidates,
  REPLY_EMBEDDING_SOURCE_TYPES
} from '../schoolSupportReplyRetrieval.shared.js';

describe('schoolSupportReplyRetrieval.shared', () => {
  it('de-identifies emails and known client terms', () => {
    const text = 'Update for Jane Doe at jane@school.edu please';
    const out = deidentifySchoolReplyText(text, ['Jane Doe']);
    assert.match(out, /\[EMAIL\]/);
    assert.match(out, /\[CLIENT\]/);
    assert.doesNotMatch(out, /jane@school\.edu/i);
  });

  it('computes cosine similarity for identical vectors', () => {
    const vec = [0.2, 0.4, 0.6];
    assert.equal(cosineSimilarity(vec, vec), 1);
  });

  it('prefers hybrid score when semantic match is strong', () => {
    const hybrid = combineHybridRetrievalScore({ keywordScore: 2, semanticScore: 0.9 });
    const keywordOnly = combineHybridRetrievalScore({ keywordScore: 2, semanticScore: 0 });
    assert.ok(hybrid > keywordOnly);
  });

  it('ranks semantic ticket answers even without keyword overlap', () => {
    const queryVector = [1, 0, 0];
    const ranked = rankHybridReplyMatches({
      libraryEntries: [],
      embeddingRows: [
        {
          sourceType: REPLY_EMBEDDING_SOURCE_TYPES.TICKET_ANSWER,
          sourceId: 88,
          title: 'Similar past reply',
          intentKey: 'school_status_request',
          replyExcerpt: 'We are still waiting on provider paperwork.',
          embedding: [0.98, 0.02, 0]
        }
      ],
      queryTerms: ['completely', 'different', 'wording'],
      queryVector,
      intentKey: 'school_status_request',
      limit: 3,
      semanticMinScore: 0.5
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].entry.sourceTicketId, 88);
    assert.ok(ranked[0].semanticScore > 0.9);
  });

  it('builds de-identified ticket answer embedding document', () => {
    const doc = buildTicketAnswerEmbeddingDocument({
      subject: 'Status for Johnny',
      question: 'Any update on Johnny?',
      answer: 'Still waiting on ROI.',
      intentKey: 'school_status_request',
      scrubTerms: ['Johnny']
    });
    assert.match(doc, /\[CLIENT\]/);
    assert.match(doc, /ITSCO replied:/);
  });

  it('does not resurrect an archived library entry through its embedding', () => {
    const ranked = rankHybridReplyMatches({ libraryEntries: [], embeddingRows: [{ sourceType: 'library', sourceId: 7, replyExcerpt: 'Obsolete guidance', embedding: [1, 0] }], queryVector: [1, 0] });
    assert.deepEqual(ranked, []);
  });

  it('retrieves relevant delivered correspondence without claiming approval', () => {
    const matches = rankHistoricalReplyCandidates({ subject: 'Portal login trouble', question: 'The referral packet will not upload', intentKey: 'school_portal_packet_upload', candidates: [
      { ticketId: 1, messageId: 10, subject: 'Portal login', question: 'My referral packet will not upload', answer: 'What error do you see?', intentKey: 'school_portal_packet_upload' },
      { ticketId: 2, messageId: 20, subject: 'Account', question: 'A holiday greeting', answer: 'Happy holidays!', intentKey: 'general' }
    ] });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].sourceMessageId, 10);
    assert.equal(matches[0].approvalStatus, 'unreviewed_history');
    assert.equal(matches[0].historicalQuestion, 'My referral packet will not upload');
  });

  it('minimizes known identifiers in historical subject, request and reply', () => {
    const [match] = rankHistoricalReplyCandidates({ subject: 'Portal referral', question: 'The referral packet will not upload', intentKey: 'school_portal_packet_upload', candidates: [
      { ticketId: 1, messageId: 10, subject: 'Portal referral: Example Child', question: 'Example Child referral packet will not upload. Contact family@example.com.', answer: 'Example Child can call 303-555-1234.', scrubTerms: ['Example Child'], intentKey: 'school_portal_packet_upload' }
    ] });
    assert.doesNotMatch(JSON.stringify(match), /Example Child|family@example.com|303-555-1234/);
    assert.match(match.title, /\[CLIENT\]/);
    assert.match(match.historicalQuestion, /\[EMAIL\]/);
    assert.match(match.bodyTemplate, /\[PHONE\]/);
  });
});
