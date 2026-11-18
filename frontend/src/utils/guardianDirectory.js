export function guardianDirectoryMatches(guardian, query) {
  const words=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text=[guardian.first_name,guardian.last_name,guardian.email,guardian.phone,guardian.agencies,guardian.school_names,
    ...(guardian.linked_clients||[]).map(client=>client.name)].filter(Boolean).join(' ').toLowerCase();
  const digits=String(guardian.phone||'').replace(/\D/g,'');
  return words.every(word=>text.includes(word)||(/^[\d()+.-]+$/.test(word)&&word.replace(/\D/g,'').length>1&&digits.includes(word.replace(/\D/g,''))));
}
export const guardianAccountPath=(id,slug='')=>`${slug?`/${encodeURIComponent(slug)}`:''}/admin/users/${Number(id)}`;
