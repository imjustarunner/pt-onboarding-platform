import { getGmailClient } from './gmailClient.js';

let cachedLabelIds = null;

async function listLabels() {
  const gmail = await getGmailClient();
  const res = await gmail.users.labels.list({ userId: 'me' });
  return res.data?.labels || [];
}

export async function ensureLabelId(labelName) {
  const name = String(labelName || '').trim();
  if (!name) throw new Error('Label name required');

  if (!cachedLabelIds) cachedLabelIds = new Map();
  if (cachedLabelIds.has(name)) return cachedLabelIds.get(name);

  const labels = await listLabels();
  const existing = labels.find((l) => String(l?.name || '').toLowerCase() === name.toLowerCase());
  if (existing?.id) {
    cachedLabelIds.set(name, existing.id);
    return existing.id;
  }

  const gmail = await getGmailClient();
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    }
  });

  const id = created.data?.id || null;
  if (!id) throw new Error('Could not create label');
  cachedLabelIds.set(name, id);
  return id;
}

