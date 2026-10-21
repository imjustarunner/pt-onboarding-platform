export const isSchoolEmailType = value => /^(school_|smart_school_roi$|secure_message_notification_school_staff$)/.test(String(value || '').replace(/^trigger:/, '').toLowerCase());
// Shared, compact network attribution for school email bodies.
export function schoolCareBridgeEmailBlock({ accountUpdatesOnly = false } = {}) {
  if (accountUpdatesOnly) return `<table role="presentation" data-schoolcarebridge="account-updates" style="margin:12px 0 0;border:1px solid #dce7ec;border-radius:8px;background:#f4f8fb;width:100%"><tr><td style="width:88px;padding:4px 0 4px 8px;vertical-align:middle"><img src="https://mh4kidz.org/assets/schoolcarebridge/logo.png" width="88" alt="SchoolCareBridge" style="display:block;width:88px;height:auto;border:0"></td><td style="padding:8px 12px;font-family:Arial,sans-serif;line-height:1.4"><strong style="color:#184765">School coordination through SchoolCareBridge</strong><br><span style="font-size:13px;color:#334155">A program of MH4Kidz</span></td></tr></table>`;
  return `<table role="presentation" data-schoolcarebridge="compact" style="margin:12px 0 0;border:1px solid #dce7ec;border-radius:8px;background:#f4f8fb;width:100%"><tr><td style="width:88px;padding:4px 0 4px 8px;vertical-align:middle"><img src="https://mh4kidz.org/assets/schoolcarebridge/logo.png" width="88" alt="SchoolCareBridge" style="display:block;width:88px;height:auto;border:0"></td><td style="padding:8px 12px;font-family:Arial,sans-serif;line-height:1.4"><strong style="color:#184765">Part of the SchoolCareBridge network</strong><br><span style="font-size:13px;color:#334155">A program of MH4Kidz</span><br><a href="https://schoolcarebridge.org" style="font-size:13px;color:#184765">Learn about SchoolCareBridge</a><br><a href="https://mh4kidz.org/about" style="font-size:13px;color:#184765">Learn about MH4Kidz</a> · <a href="https://mh4kidz.org/donate" style="font-size:13px;color:#184765">Donate</a></td></tr></table>`;
}
export function compactSchoolCareBridgeEmail({ text, html, templateType, schoolCommunication = false }) {
  const accountUpdatesOnly = ['family_notification_invitation','portal_migration_invite'].includes(String(templateType || '').replace(/^trigger:/,''))
    || String(html || '').includes('data-schoolcarebridge="account-updates"');
  if (accountUpdatesOnly) {
    if (html) html = html.replace(/<table\b[^>]*data-schoolcarebridge="compact"[^>]*>[\s\S]*?<\/table>/gi, schoolCareBridgeEmailBlock({accountUpdatesOnly:true}));
    if (schoolCommunication && !String(html || '').includes('data-schoolcarebridge="account-updates"')) {
      const plain = String(text || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      html = `${html || `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${plain}</div>`}${schoolCareBridgeEmailBlock({accountUpdatesOnly:true})}`;
    }
    if (schoolCommunication && !String(text || '').includes('SchoolCareBridge')) text = `${text || ''}\n\nSchool coordination through SchoolCareBridge, a program of MH4Kidz.`;
    return {text,html};
  }
  if (html) {
    // Upgrade already-branded drafts as well as newly generated messages.
    html = html.replace(/<table\b[^>]*data-schoolcarebridge="compact"[^>]*>[\s\S]*?<\/table>/gi, schoolCareBridgeEmailBlock());
    // Older welcome templates contain a single attribution div with a square logo.
    html = html.replace(/<div\b[^>]*>\s*<img\b[^>]*\/assets\/schoolcarebridge\/logo\.png[^>]*>\s*<p\b[^>]*>Part of the SchoolCareBridge network<\/p>\s*<p\b[^>]*>A program of MH4Kidz<\/p>\s*<a\b[^>]*>Learn about SchoolCareBridge<\/a>\s*<\/div>/gi, schoolCareBridgeEmailBlock());
  }
  if (schoolCommunication || isSchoolEmailType(templateType)) {
    if (!String(html || '').includes('data-schoolcarebridge="compact"')) html = `${html || `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${String(text || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</div>`}${schoolCareBridgeEmailBlock()}`;
    if (!String(text || '').includes('Part of the SchoolCareBridge network')) text = `${text || ''}\n\nPart of the SchoolCareBridge network\nA program of MH4Kidz\nLearn about SchoolCareBridge: https://schoolcarebridge.org`;
  }
  if (String(text || '').includes('Part of the SchoolCareBridge network')) {
    if (!text.includes('Learn about SchoolCareBridge:')) text += '\nLearn about SchoolCareBridge: https://schoolcarebridge.org';
    if (!text.includes('Learn about MH4Kidz:')) text += '\nLearn about MH4Kidz: https://mh4kidz.org/about';
    if (!text.includes('Donate: https://mh4kidz.org/')) text += '\nDonate: https://mh4kidz.org/donate';
  }
  return { text, html };
}
