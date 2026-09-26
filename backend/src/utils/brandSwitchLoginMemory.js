import jwt from 'jsonwebtoken';

const PURPOSE = 'brand-switch-login-memory';

// The database still owns expiry, host binding, and one-time consumption. This
// envelope preserves the verified sign-in method and the browser's remember choice.
export function signBrandSwitchMemory({ jti, authMethod, rememberGoogle }, secret) {
  return jwt.sign({ purpose: PURPOSE, jti, authMethod: authMethod === 'google' ? 'google' : null, rememberGoogle: rememberGoogle === true }, secret, { expiresIn: 60, audience: PURPOSE });
}

export function readBrandSwitchMemory(token, secret) {
  // In-flight handoffs created before this release still work, without inferring SSO.
  if (/^[a-f0-9]{64}$/.test(token)) return { jti: token, authMethod: null, rememberGoogle: false };
  const value = jwt.verify(token, secret, { algorithms: ['HS256'], audience: PURPOSE });
  if (value.purpose !== PURPOSE || !/^[a-f0-9]{64}$/.test(value.jti || '')) throw new Error('Invalid handoff');
  return { jti: value.jti, authMethod: value.authMethod === 'google' ? 'google' : null, rememberGoogle: value.rememberGoogle === true };
}
