import crypto from 'node:crypto';

export function schoolCareBridgeDeployment(env = process.env) {
  const origin = new URL(env.SCHOOLCAREBRIDGE_PUBLIC_ORIGIN || 'https://mh4kidz.org');
  if (origin.protocol !== 'https:' || !['mh4kidz.org', 'schoolcarebridge.org', 'www.schoolcarebridge.org'].includes(origin.hostname) || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid SchoolCareBridge public origin');
  const basePath = origin.hostname === 'mh4kidz.org' ? '/schoolcarebridge' : '';
  return { origin: origin.origin, basePath, legacyRedirectEnabled: env.SCHOOLCAREBRIDGE_LEGACY_REDIRECT_ENABLED === 'true' };
}
export function routingDestination(slug, env = process.env) {
  if (slug !== '' && !/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) throw new Error('Invalid school slug');
  const config = schoolCareBridgeDeployment(env);
  return `${config.origin}${config.basePath}/app${slug ? '/' + slug : ''}`;
}
export const routingTokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

// This token carries a login hint only. It cannot issue a session or grant access.
export async function mintRoutingHint(db, { username, slug }, env = process.env) {
  if (!schoolCareBridgeDeployment(env).legacyRedirectEnabled) return null;
  const destination = routingDestination(slug, env);
  const token = crypto.randomBytes(32).toString('hex');
  await db.execute('DELETE FROM schoolcarebridge_routing_hints WHERE expires_at < NOW()');
  await db.execute('INSERT INTO schoolcarebridge_routing_hints (token_hash, username, destination, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE))', [routingTokenHash(token), username, destination]);
  return `${destination}?routingHint=${token}`;
}
export async function consumeRoutingHint(db, { token, destination }, env = process.env) {
  const config = schoolCareBridgeDeployment(env);
  if (!config.legacyRedirectEnabled || !/^[a-f0-9]{64}$/.test(token || '')) return null;
  const url = new URL(destination);
  if (url.origin !== config.origin || !(url.pathname === `${config.basePath}/app` || url.pathname.startsWith(`${config.basePath}/app/`)) || url.search || url.hash) return null;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT username FROM schoolcarebridge_routing_hints WHERE token_hash = ? AND destination = ? AND expires_at > NOW() FOR UPDATE', [routingTokenHash(token), destination]);
    if (!rows.length) { await conn.rollback(); return null; }
    await conn.execute('DELETE FROM schoolcarebridge_routing_hints WHERE token_hash = ?', [routingTokenHash(token)]);
    await conn.commit();
    return rows[0].username;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
