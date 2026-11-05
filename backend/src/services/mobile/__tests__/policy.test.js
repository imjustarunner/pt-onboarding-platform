import {expect,it} from 'vitest';
import {validClient,verifyChallenge,validChallenge,opaqueToken,accountFingerprint,digest,requireQuickCode} from '../policy.js';
import crypto from 'node:crypto';
it('binds a sign-in code to the exact registered client and S256 verifier',()=>{
  const verifier=opaqueToken(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  expect(validChallenge(challenge)).toBe(challenge);expect(verifyChallenge(verifier,challenge)).toBe(true);
  expect(verifyChallenge(opaqueToken(),challenge)).toBe(false);
  expect(()=>validClient('web','https://evil.example/mobile/callback')).toThrow();
  expect(()=>validClient('__proto__',undefined)).toThrow();
  expect(()=>validClient('ios','https://auricwell.com/mobile/callback')).toThrow();
});
it('invalidates device authorization after a password or identity change',()=>{
  const user={id:1,password_hash:'one'};
  expect(accountFingerprint(user)).not.toBe(accountFingerprint({...user,password_hash:'two'}));
  expect(accountFingerprint(user)).not.toBe(accountFingerprint({...user,identity_product:'ehr'}));
  expect(digest(opaqueToken())).toMatch(/^[a-f0-9]{64}$/);
});
it('requires the full six-digit quick access code',()=>{
  for(const bad of ['12345','1234567','12 456',null])expect(()=>requireQuickCode(bad)).toThrow();
  expect(requireQuickCode('012345')).toBe('012345');
});
