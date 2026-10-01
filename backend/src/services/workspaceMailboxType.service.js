import Directory from './googleWorkspaceDirectory.service.js';

const cache = new Map();
const TTL_MS = 60_000;

/** Mailbox type is independent of the app's password/SSO login override. */
export async function workspaceMailboxType(address) {
  const email = String(address || '').trim().toLowerCase();
  if (!Directory.isConfigured() || !email.includes('@')) {
    throw Object.assign(new Error('Work mailbox verification is unavailable. Please try again.'), { status: 503 });
  }
  const hit = cache.get(email);
  if (hit?.expiresAt > Date.now()) return hit.promise;
  const promise = (async () => {
    let user;
    try { user = await Directory.getUser({ primaryEmail: email, timeoutMs: 5000 }); }
    catch (error) {
      if (Number(error.code || error.response?.status) !== 400 || !/Type not supported: userKey/i.test(String(error.message))) throw error;
    }
    if (user && !user.suspended) return 'user';
    if (!user && await Directory.getGroup({ groupEmail: email, timeoutMs: 5000 })) return 'group';
    throw Object.assign(new Error('This work mailbox is unavailable. Ask an administrator to check its Workspace setup.'), { status: 400 });
  })().catch(error => { cache.delete(email); throw error; });
  cache.set(email, { expiresAt: Date.now() + TTL_MS, promise });
  if (cache.size > 1000) {
    for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key);
  }
  return promise;
}
