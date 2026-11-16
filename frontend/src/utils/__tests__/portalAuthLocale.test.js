import { beforeEach, expect, it } from 'vitest';
import { portalAuthLanguage, portalAuthText, portalAuthError, rememberAuthenticatedPortalLanguage, withPortalAuthLanguage } from '../portalAuthLocale.js';
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
it('recovers Spanish from the invitation or protected-page redirect and keeps it through password setup', () => {
  expect(portalAuthLanguage({query:{lang:'es'}})).toBe('es');
  expect(portalAuthLanguage({query:{redirect:'/itsco/guardian?lang=es'}})).toBe('es');
  expect(withPortalAuthLanguage('/itsco/new_account/synthetic?portal=itsco#step', 'es')).toBe('/itsco/new_account/synthetic?portal=itsco&lang=es#step');
  expect(withPortalAuthLanguage('/itsco/login?lang=es','en')).toBe('/itsco/login?lang=en');
  expect(withPortalAuthLanguage('/itsco/login', 'en')).toBe('/itsco/login');
});
it('remembers only an authenticated family account’s UI language', () => {
  rememberAuthenticatedPortalLanguage({id:42,role:'client_guardian'},'es');
  expect(localStorage.getItem('familyPortalLanguage:42')).toBe('es');
  rememberAuthenticatedPortalLanguage({id:43,role:'provider'},'es');
  expect(localStorage.getItem('familyPortalLanguage:43')).toBeNull();
});
it('translates password requirements and preserves names as text', () => {
  expect(portalAuthText('es','Password must be at least 10 characters')).toBe('La contraseña debe tener al menos 10 caracteres');
  expect(portalAuthText('es','Hi {name},',{name:'Parent'})).toBe('Hola Parent,');
});
it('keeps expired and changed-link errors in Spanish when the API returns English', () => {
  expect(portalAuthError({response:{status:410,data:{error:{message:'The private link expired'}}}},'es','Loading…')).toContain('ha vencido');
  expect(portalAuthError({response:{status:409,data:{error:{message:'Internal conflict details'}}}},'es','Loading…')).toContain('Actualice');
});
