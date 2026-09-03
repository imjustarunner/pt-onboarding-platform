import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePrehireConfig, mergePrehireDocuments } from '../prehireConfigSanitize.js';

describe('prehireConfigSanitize', () => {
  it('keeps supported kinds and drops empty titles', () => {
    const out = sanitizePrehireConfig({
      documents: [
        { id: 'a', kind: 'print_only', title: 'Print me', printInstructions: 'Do this' },
        { kind: 'reference', title: 'IdentoGO', url: 'https://uenroll.identogo.com' },
        { kind: 'nope', title: '' }
      ]
    });
    assert.equal(out.documents.length, 2);
    assert.equal(out.documents[0].kind, 'print_only');
    assert.equal(out.documents[1].kind, 'reference');
  });

  it('merges job docs ahead of agency defaults without duplicating ids', () => {
    const merged = mergePrehireDocuments(
      { documents: [{ id: 'jd', title: 'Job ack', kind: 'acknowledgement' }] },
      { documents: [{ id: 'jd', title: 'Default ack', kind: 'acknowledgement' }, { id: 'def', title: 'IdentoGO', kind: 'reference' }] }
    );
    assert.equal(merged.documents.length, 2);
    assert.equal(merged.documents[0].title, 'Job ack');
    assert.equal(merged.documents[1].id, 'def');
  });
});
