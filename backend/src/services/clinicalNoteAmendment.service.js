import clinicalPool from '../config/clinicalDatabase.js';
import { policyError } from './supervisedBillingPolicy.service.js';
import { appendRevisionAddendum } from './clinicalNoteVersion.service.js';

// Compatibility for internal callers: corrections must use linked revisions.
// Independent additions keep every original and amendment approval on file.
export async function appendClinicalNoteAmendment(input, source = clinicalPool) {
  if (input.entryKind === 'correction' || input.serviceLines !== undefined) {
    throw policyError(409, 'Create and sign a linked amended version for corrections to signed content or services.');
  }
  return appendRevisionAddendum(input, source);
}
