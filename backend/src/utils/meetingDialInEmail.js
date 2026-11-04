const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function dialInEmailHtml(details) {
  if (!details) return '';
  return `<p><strong>Join by phone</strong><br>${esc(details.when)}<br><a href="${esc(details.oneTapUrl)}">${esc(details.number)}</a><br>Personal PIN for ${esc(details.name)}: <strong>${esc(details.pin)} #</strong><br>Use only your own PIN. It identifies your attendance. This PIN is for the scheduled date above and expires when the meeting ends.</p>`;
}
