const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function dialInEmailHtml(details) {
  if (!details) return '';
  return `<p><strong>Join by phone</strong><br>${esc(details.when)}<br><a href="${esc(details.oneTapUrl)}">Tap to call ${esc(details.number)} and enter your PIN</a><br>Personal PIN for ${esc(details.name)}: <strong>${esc(details.pin)} #</strong><br>${esc(details.callingPhoneHint)} ${esc(details.hostHint)}<br>Use only your own invitation. If your phone does not enter the PIN automatically, enter the code above followed by #. Joining opens 15 minutes before the meeting. This PIN is for the scheduled date above and expires when the meeting ends.</p>`;
}
