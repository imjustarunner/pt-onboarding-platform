const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** School-facing copy only; no staff/admin or clinical workflow instructions. */
export function schoolOnboardingWelcomeEmail({ schoolName, agencyName, groupEmail, portalUrl, technologyEmail }) {
  const sections = [
    ['Enrollment packets', 'Open Digital Forms to share the enrollment link or QR code with families. Families can switch to Spanish in the form. Use Printable Paperwork for English and Spanish paper packets and follow the portal’s upload instructions for completed packets.'],
    ['Referrals and students', 'Use the portal to submit referrals and view students connected to your school. Student details and documents depend on your permissions and the releases on file.'],
    ['Your clinicians', 'View the clinicians assigned to your school and their school contact and scheduling information as it becomes available.'],
    ['School staff access', 'School administrators can add staff through the school’s staff-management tools. Each person should use their own account. If you do not see those controls, ask your school administrator or reply to this email for help.'],
    ['What happens next', 'As completed enrollment information arrives, our team reviews it and coordinates assignment based on provider availability. The assigned clinician then connects with the family and your school to coordinate services. A referral does not guarantee an immediate appointment.']
  ];
  const intro = `Hello ${schoolName} team,\n\nYour school’s portal setup is complete. Welcome to ${agencyName}! You can now sign in with your individual school-staff account and begin using the portal for enrollment and referrals.`;
  const help = `Your school group email is ${groupEmail}. This shared address keeps your school team connected with ${agencyName}; it is not a shared portal login.\n\nFor portal questions or technical issues, reply to this email at ${technologyEmail}. Your reply will create or update a Technology support ticket for our team. Please use the portal for student documents and sensitive student information.`;
  return {
    subject: `${schoolName}: your school portal is ready`,
    text: `${intro}\n\nOpen your school portal: ${portalUrl}\n\n${sections.map(([title, body]) => `${title}\n${body}`).join('\n\n')}\n\n${help}\n\nWe’re glad to partner with your school!`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20332f"><h1 style="font-size:24px;color:#17634b">Your school portal is ready</h1><p>Hello ${escapeHtml(schoolName)} team,</p><p>Your school’s portal setup is complete. Welcome to ${escapeHtml(agencyName)}! Sign in with your individual school-staff account to begin using the portal for enrollment and referrals.</p><p style="margin:24px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#17634b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Open your school portal</a></p><p><strong>Your school group email:</strong><br><a href="mailto:${escapeHtml(groupEmail)}">${escapeHtml(groupEmail)}</a></p>${sections.map(([title, body]) => `<h2 style="font-size:17px;margin:22px 0 6px;color:#17634b">${escapeHtml(title)}</h2><p style="margin:0">${escapeHtml(body)}</p>`).join('')}<p style="margin-top:24px">${escapeHtml(help).replace(/\n\n/g, '</p><p>')}</p><p>We’re glad to partner with your school!</p></div>`
  };
}
