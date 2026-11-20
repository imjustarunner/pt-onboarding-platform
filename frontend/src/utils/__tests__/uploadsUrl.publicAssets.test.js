import {describe,it,expect} from 'vitest';import {toUploadsUrl} from '../uploadsUrl';
describe('static logos versus uploaded files',()=>{
 it('keeps bundled logo URLs on the frontend',()=>{expect(toUploadsUrl('/assets/ptco/logo-flat.webp')).toBe('/assets/ptco/logo-flat.webp');expect(toUploadsUrl('assets/schoolcarebridge/demo-school.svg')).toBe('/assets/schoolcarebridge/demo-school.svg');});
 it('preserves uploaded-file and absolute URL behavior',()=>{expect(toUploadsUrl('/uploads/agency 2/logo.png')).toMatch(/\/uploads\/agency%202\/logo.png$/);expect(toUploadsUrl('https://schoolcarebridge.org/assets/logo.png')).toBe('https://schoolcarebridge.org/assets/logo.png');expect(toUploadsUrl(null)).toBeNull();});
});

it('preserves the public Plotline logo route without adding an uploads prefix',()=>{
 for(const path of ['/api/plotline/logos/juniper-qa.webp','api/plotline/logos/juniper-qa.webp','plotline/logos/juniper-qa.webp']){
  expect(toUploadsUrl(path)).toBe('/api/plotline/logos/juniper-qa.webp');
 }
});
