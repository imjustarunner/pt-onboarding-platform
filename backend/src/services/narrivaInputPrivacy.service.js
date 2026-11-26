import { narrivaIdentifierMatches } from '../../../frontend/src/utils/narrivaIdentifierMatches.js';

export function containsNarrivaIdentifiers(text, knownIdentifiers = []) {
 return narrivaIdentifierMatches(text, knownIdentifiers).length > 0;
}

export function requireNarrivaIdentifierCorrection(text,knownIdentifiers=[]) {
 if(containsNarrivaIdentifiers(text,knownIdentifiers))throw Object.assign(new Error('Possible identifying information was found in the note or Session Narrative. Remove names, dates of birth, addresses, contact details and other identifiers before generating or checking.'),{status:422,code:'PHI_INPUT_REQUIRES_CORRECTION'});
}
