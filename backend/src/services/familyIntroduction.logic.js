function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function providerNameSlug(name) {
  const slug = String(name || 'provider')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'provider';
}

export function portalProfilePath({ agencySlug, providerId, providerName }) {
  const id = Number(providerId || 0);
  if (!id) return '';
  if (agencySlug === 'itsco') return `https://www.itsco.health/providers/${providerNameSlug(providerName)}-${id}`;
  if (!agencySlug) return '';
  return `/${encodeURIComponent(agencySlug)}/provider/${id}`;
}

export function familyIntroductionLetter({
  providerName,
  schoolName,
  serviceDay,
  softTime = '',
  hasAccount = false,
  remindersOn = false,
  reminderUrl = '',
  profileUrl = '',
  portalUrl = '',
  providerCopied = false
}) {
  const day = serviceDay || 'a school day that will be confirmed';
  const time = softTime ? ` The usual time is ${softTime}.` : '';
  const lines = [
    `${providerName} is assigned to you or your dependent at ${schoolName}.`,
    `The school day is ${day}.${time}`,
    'Sessions happen at school in a private space, usually about 40 minutes and up to 60 minutes. They are typically weekly and sometimes monthly.',
    providerCopied ? `Questions go to support. ${providerName} is copied on this email.` : 'Questions go to support.'
  ];
  if (hasAccount) lines.push('Sign in to AuricWell to see the assignment, the day, and the time.');
  else lines.push("You can use your email and your child's birthdate to open AuricWell.");
  lines.push(remindersOn
    ? 'Appointment reminders are on.'
    : 'Appointment reminders are off. You can turn on texting reminders and provider reminders.');
  if (profileUrl) lines.push(`Public profile: ${profileUrl}`);
  const html = [
    `<p>${escapeHtml(lines[0])}</p>`,
    `<p>${escapeHtml(lines[1])}</p>`,
    `<p>${escapeHtml(lines[2])}</p>`,
    `<p>${escapeHtml(lines[3])}</p>`,
    hasAccount
      ? `<p><a href="${escapeHtml(portalUrl)}">Sign in to AuricWell</a> to see the assignment, the day, and the time.</p>`
      : `<p>You can use your email and your child's birthdate to open AuricWell.</p><p><a href="${escapeHtml(portalUrl)}">Open AuricWell</a></p>`,
    remindersOn
      ? '<p>Appointment reminders are on.</p>'
      : `<p>Appointment reminders are off.</p><p><a href="${escapeHtml(reminderUrl)}">Turn on texting reminders and provider reminders</a></p>`,
    profileUrl ? `<p><a href="${escapeHtml(profileUrl)}">Public profile</a></p>` : ''
  ].join('');
  return {
    subject: `${providerName} is assigned at ${schoolName}`,
    text: lines.filter(Boolean).join('\n\n'),
    html
  };
}
