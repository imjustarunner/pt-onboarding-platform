export const isSchoolEmailType = value => /^(school_|smart_school_roi$|secure_message_notification_school_staff$)/.test(String(value || '').replace(/^trigger:/, '').toLowerCase());
// Shared, compact network attribution for school email bodies.
export function schoolCareBridgeEmailBlock() {
  return `<table role="presentation" data-schoolcarebridge="compact" style="margin:12px 0 0;border:1px solid #dce7ec;border-radius:8px;background:#f4f8fb;width:100%"><tr><td style="width:88px;padding:4px 0 4px 8px;vertical-align:middle"><img src="https://mh4kidz.org/assets/schoolcarebridge/logo.png" width="88" alt="SchoolCareBridge" style="display:block;width:88px;height:auto;border:0"></td><td style="padding:8px 12px;font-family:Arial,sans-serif;line-height:1.4"><strong style="color:#184765">Part of the SchoolCareBridge network</strong><br><span style="font-size:13px;color:#334155">A program of MH4Kidz</span><br><a href="https://mh4kidz.org/schoolcarebridge" style="font-size:13px;color:#184765">Learn about SchoolCareBridge →</a></td></tr></table>`;
}
export function compactSchoolCareBridgeEmail({ text, html, templateType, schoolCommunication = false }) {
  if (html) {
    // Older welcome templates contain a single attribution div with a square logo.
    html = html.replace(/<div\b[^>]*>\s*<img\b[^>]*\/assets\/schoolcarebridge\/logo\.png[^>]*>\s*<p\b[^>]*>Part of the SchoolCareBridge network<\/p>\s*<p\b[^>]*>A program of MH4Kidz<\/p>\s*<a\b[^>]*>Learn about SchoolCareBridge<\/a>\s*<\/div>/gi, schoolCareBridgeEmailBlock());
  }
  if (schoolCommunication || isSchoolEmailType(templateType)) {
    if (!String(html || '').includes('data-schoolcarebridge="compact"')) html = `${html || `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${String(text || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</div>`}${schoolCareBridgeEmailBlock()}`;
    if (!String(text || '').includes('Part of the SchoolCareBridge network')) text = `${text || ''}\n\nPart of the SchoolCareBridge network\nA program of MH4Kidz\nLearn about SchoolCareBridge: https://mh4kidz.org/schoolcarebridge`;
  }
  return { text, html };
}
