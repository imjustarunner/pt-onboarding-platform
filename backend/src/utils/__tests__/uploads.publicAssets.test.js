import {afterEach,it,expect,vi} from 'vitest';
import {publicUploadsUrlFromStoredPath} from '../uploads.js';
afterEach(()=>vi.unstubAllEnvs());
it.each(['','https://backend.example.test','https://backend.example.test/api'])('keeps the public Plotline route with backend base %s',base=>{
 vi.stubEnv('BACKEND_PUBLIC_URL',base);vi.stubEnv('BACKEND_URL','');
 const origin=base.replace(/\/api$/,'');
 for(const path of ['/api/plotline/logos/juniper.webp','api/plotline/logos/juniper.webp','plotline/logos/juniper.webp'])
  expect(publicUploadsUrlFromStoredPath(path)).toBe(`${origin}/api/plotline/logos/juniper.webp`);
});
it('retains ordinary upload paths and existing absolute URLs',()=>{
 vi.stubEnv('BACKEND_PUBLIC_URL','https://backend.example.test');
 expect(publicUploadsUrlFromStoredPath('uploads/company/logo.png')).toBe('https://backend.example.test/uploads/company/logo.png');
 expect(publicUploadsUrlFromStoredPath('https://cdn.example.test/logo.png')).toBe('https://cdn.example.test/logo.png');
 expect(publicUploadsUrlFromStoredPath(null)).toBeNull();
});
