// Shared presentation only. Channel IDs and transport permissions stay with each workspace.
export const CONVERSA_OWNER = 'Plot Twist Co.';
export const CONVERSA_OWNERSHIP = 'A Plot Twist Co. product';
export const CONVERSA_RELATIONSHIP = 'Conversa and AuricWell are wholly owned Plot Twist Co. products. Conversa brings communications together across AuricWell and Plot Twist HQ.';
export const CONVERSA_NAME = 'Messages by Conversa';
export const CONVERSA_ICON_URL = '/assets/conversa/mark.svg';
export const CONVERSA_TAGLINE = 'Every conversation, clearly connected.';

export const CONVERSA_TYPES = Object.freeze({
  secure: { label: 'Secure message', icon: 'LockKeyhole', tone: 'blue' },
  internal: { label: 'Internal message', icon: 'UserRound', tone: 'slate' },
  email: { label: 'Email', icon: 'Mail', tone: 'blue' },
  group: { label: 'Group message', icon: 'Users', tone: 'teal' },
  chat: { label: 'Chat', icon: 'MessageCircle', tone: 'blue' },
  thread: { label: 'Thread', icon: 'MessagesSquare', tone: 'purple' },
  channel: { label: 'Channel', icon: 'Hash', tone: 'purple' },
  ticket: { label: 'Ticket', icon: 'Ticket', tone: 'gold' },
  call: { label: 'Call', icon: 'Phone', tone: 'teal' },
  voicemail: { label: 'Voicemail', icon: 'Voicemail', tone: 'rose' },
  sms: { label: 'SMS', icon: 'MessageSquare', tone: 'teal' },
  announcement: { label: 'Announcement', icon: 'Megaphone', tone: 'blue' },
  attachment: { label: 'Attachment', icon: 'Paperclip', tone: 'slate' },
  scheduled: { label: 'Scheduled', icon: 'CalendarClock', tone: 'slate' },
  priority: { label: 'Priority', icon: 'Flag', tone: 'rose' },
  read: { label: 'Read', icon: 'CheckCheck', tone: 'blue' },
  unread: { label: 'Unread', icon: 'Circle', tone: 'blue' },
  all: { label: 'All conversations', icon: 'Inbox', tone: 'blue' },
  mention: { label: 'Mention', icon: 'AtSign', tone: 'purple' }
});

const aliases = { dm: 'internal', secure_message: 'secure', channels: 'channel', groups: 'group', threads: 'thread', calls: 'call', tickets: 'ticket', text: 'sms', note: 'internal' };
export function conversaType(type) {
  const key = String(type || '').trim().toLowerCase();
  return CONVERSA_TYPES[aliases[key] || key] || { label: 'Conversation', icon: 'MessageCircle', tone: 'slate' };
}

export function canManageConversaTeam(user) {
  return ['super_admin', 'admin', 'support'].includes(String(user?.role || '').trim().toLowerCase());
}
