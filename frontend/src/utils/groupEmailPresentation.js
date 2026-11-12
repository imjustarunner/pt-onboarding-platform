// Department membership comes from the server. A personal app mailbox can also
// be backed by a Google Group, so the email address alone cannot classify it.
export function isTicketedGroup(mailbox) {
  if (!mailbox || ['personal', 'virtual'].includes(mailbox.kind) || /^personal_\d+$/.test(mailbox.identity_key || '')) return false;
  return [true, 1, '1'].includes(mailbox.is_ticketed_group) || mailbox.routing === 'ticketed_group';
}

export function isGroupEmail(mailbox){return !!mailbox && !['personal','virtual'].includes(mailbox.kind) && (isTicketedGroup(mailbox)||[true,1,'1'].includes(mailbox.is_group_email));}

const departments = {
  schools: {label:'Schools',icon:'Mail',ink:'#296c57',shade:'#edf6f0'},
  payroll: { label: 'Payroll', icon: 'Banknote', ink: '#276749', shade: '#e8f5ee' },
  billing: { label: 'Billing', icon: 'ReceiptText', ink: '#945c14', shade: '#fff4de' },
  credentialing: { label: 'Credentialing', icon: 'BadgeCheck', ink: '#6941a5', shade: '#f1eafa' },
  support: { label: 'Support', icon: 'Headset', ink: '#186487', shade: '#e7f4fb' },
  technology: { label: 'Technology', icon: 'Laptop', ink: '#3358a1', shade: '#eaf0ff' },
  admin: { label: 'Administration', icon: 'Settings', ink: '#526174', shade: '#edf1f5' },
  compliance: { label: 'Compliance', icon: 'ShieldCheck', ink: '#247270', shade: '#e5f5f3' },
  medical_records: { label: 'Medical Records', icon: 'FolderLock', ink: '#795136', shade: '#f6ede5' },
  hiring: { label: 'Hiring', icon: 'UserRoundPlus', ink: '#84508b', shade: '#f7ecf8' },
  intake: { label: 'Intake', icon: 'ClipboardList', ink: '#356c50', shade: '#edf6e9' }
};

export function groupEmailPresentation(mailbox) {
  const key = String(mailbox?.group_key || '').toLowerCase();
  const identity = String(mailbox?.identity_key || mailbox?.inbox_identity_key || '').toLowerCase();
  if (identity === 'school_groups' || ['schoolreply','school_reply'].includes(identity)) return { ...departments.schools, label: 'School groups', icon: 'UsersRound' };
  if (identity === 'schools') return { ...departments.schools, label: 'Schools@' };
  return departments[key] || { label: mailbox?.group_name || mailbox?.inbox_display_name || mailbox?.display_name || 'Group Email', icon: 'Mail', ink: '#526174', shade: '#edf1f5' };
}

export function ticketHref(ticketId, agencyId, organizationSlug = '') {
  const prefix = organizationSlug ? `/${encodeURIComponent(organizationSlug)}` : '';
  const query = new URLSearchParams({ ticketId: String(ticketId) });
  if (agencyId) query.set('agencyId', String(agencyId));
  return `${prefix}/tickets?${query}`;
}
