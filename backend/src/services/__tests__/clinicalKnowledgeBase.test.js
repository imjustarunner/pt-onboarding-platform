import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  styleDocBoost,
  pickClinicalSnippet,
  buildKnowledgeBaseContextFromDocs,
  noteAidKnowledgeBaseOptions
} from '../clinicalKnowledgeBase.service.js';

describe('clinicalKnowledgeBase style selection', () => {
  it('boosts approved examples and Note Aid guides over generic PDFs', () => {
    assert.ok(
      styleDocBoost('psychotherapy/Approved and Verified Examples - 90832 90834 90837.pdf') >
        styleDocBoost('shared/Common Diagnoses and DSM Criteria.pdf')
    );
    assert.ok(styleDocBoost('psychotherapy/CLINICAL NOTE AID GUIDE.pdf') > 500);
    assert.ok(styleDocBoost('psychotherapy/Clinical Progress Note SOP Guide.pdf') > 500);
  });

  it('prefers tool-folder copies over shared duplicates', () => {
    assert.ok(
      styleDocBoost('psychotherapy/Clinical Progress Note SOP Guide.pdf') >
        styleDocBoost('shared/Clinical Progress Note SOP Guide.pdf')
    );
  });

  it('starts snippets at clinical example content when present', () => {
    const text = [
      'Cover page and table of contents go here for many pages.',
      'Approved and Verified Examples',
      'Subjective: Client reported increased anxiety.',
      'Objective: Affect congruent with content.'
    ].join('\n');
    const snippet = pickClinicalSnippet(text, 200, { preferClinical: true });
    assert.match(snippet, /Approved and Verified Examples/);
    assert.doesNotMatch(snippet, /^Cover page/);
  });

  it('includes every training/example doc for a tool folder, not a keyword top-N', () => {
    const docs = [
      {
        name: 'H2014_group/Approved and Verified Examples - H2014H2015H2016.pdf',
        text: 'Approved examples for H2014 group notes. Example 1 Subjective: ...'
      },
      {
        name: 'H2014_group/Approved and verified examples H2014.pdf',
        text: 'Second H2014 examples file with full sample notes.'
      },
      {
        name: 'shared/CLINICAL NOTE AID GUIDE.pdf',
        text: 'Note Aid guide shared training content for clinical phrasing.'
      },
      {
        name: 'shared/Common Diagnoses and DSM Criteria.pdf',
        text: 'Anxiety disorders criteria worry restlessness sleep.'
      },
      {
        name: 'shared/Service Descriptions.pdf',
        text: 'Service descriptions for community support.'
      }
    ];

    const ctx = buildKnowledgeBaseContextFromDocs(docs, {
      query: 'kid played soccer today', // should not drop training just because it doesn't match
      ...noteAidKnowledgeBaseOptions()
    });

    assert.match(ctx, /Approved and Verified Examples - H2014H2015H2016/);
    assert.match(ctx, /Approved and verified examples H2014\.pdf/);
    assert.match(ctx, /CLINICAL NOTE AID GUIDE/);
    assert.match(ctx, /Common Diagnoses/);
    assert.match(ctx, /Service Descriptions/);
  });

  it('dedupes shared and tool-folder copies of the same file', () => {
    const docs = [
      {
        name: 'shared/Clinical Progress Note SOP Guide.pdf',
        text: 'Shared SOP short.'
      },
      {
        name: 'psychotherapy/Clinical Progress Note SOP Guide.pdf',
        text: 'Tool SOP with Subjective: and Objective: section guidance.'
      }
    ];
    const ctx = buildKnowledgeBaseContextFromDocs(docs, noteAidKnowledgeBaseOptions({
      query: 'session note'
    }));
    assert.match(ctx, /psychotherapy\/Clinical Progress Note SOP Guide\.pdf/);
    assert.equal((ctx.match(/Clinical Progress Note SOP Guide\.pdf/g) || []).length, 1);
  });

  it('uses full-folder training options for Note Aid', () => {
    const opts = noteAidKnowledgeBaseOptions();
    assert.equal(opts.includeAllTrainingDocs, true);
    assert.ok(opts.maxChars >= 100000);
  });

  it('includes full example text rather than a short scrap', () => {
    const longExamples = `Approved and Verified Examples\n${'Subjective: Client endorsed worry. Objective: Affect congruent. Plan: Continue. '.repeat(200)}`;
    const docs = [
      {
        name: 'TPT/Approved and Verified Examples - TutoringPlusTherapy.pdf',
        text: longExamples
      },
      {
        name: 'shared/Common Diagnoses and DSM Criteria.pdf',
        text: `Diagnoses filler ${'anxiety criteria '.repeat(50)}`
      }
    ];
    const ctx = buildKnowledgeBaseContextFromDocs(docs, noteAidKnowledgeBaseOptions({
      query: 'client talked about school'
    }));
    assert.match(ctx, /TutoringPlusTherapy/);
    assert.ok(ctx.length > 8000);
  });
});
