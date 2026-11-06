const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function containsNarrivaIdentifiers(text,knownIdentifiers=[]) {
 const value=String(text || '');
 if(/\b[\w.+%-]+@[\w.-]+\.[a-z]{2,}\b|\b\d{3}-\d{2}-\d{4}\b|(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b|\b(?:DOB|date of birth|MRN|member id)\s*[:#]?\s*\S+/i.test(value))return true;
 // Mobile's masked display names are still identifying information. Inspect
 // both the known names and their first-three-character display equivalents.
 const candidates=knownIdentifiers.flatMap(identifier=>{
  const raw=String(identifier || '').trim(),parts=raw.split(/\s+/);
  return [raw,...parts.map(part=>{const chars=[...part];return chars.length>3?chars.slice(0,3).join('')+'*':part;})];
 });
 return candidates.some(identifier=>identifier.length>=3 && !['client','provider','guardian'].includes(identifier.toLowerCase()) && new RegExp(`(?<![\\p{L}\\p{N}])${escape(identifier)}(?![\\p{L}\\p{N}])`,'iu').test(value));
}
export function requireNarrivaIdentifierCorrection(text,knownIdentifiers=[]) {
 if(containsNarrivaIdentifiers(text,knownIdentifiers))throw Object.assign(new Error('Possible identifying information was found in the note or Session Narrative. Remove names, dates of birth, addresses, contact details and other identifiers before generating or checking.'),{status:422,code:'PHI_INPUT_REQUIRES_CORRECTION'});
}
