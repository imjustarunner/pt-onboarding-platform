export function generatedClientInitials(fullName) {
  const parts=String(fullName||'').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const title=part=>{const letters=part.replace(/[^\p{L}]/gu,'').slice(0,3).toLocaleLowerCase();return letters.charAt(0).toLocaleUpperCase()+letters.slice(1);};
  return [title(parts[0]),parts.length>1?title(parts[parts.length-1]):''].filter(Boolean).join(' ');
}
