import {describe,it,expect} from 'vitest';import {toUploadsUrl} from '../uploadsUrl';
describe('static logos versus uploaded files',()=>{
 it('keeps bundled logo URLs on the frontend',()=>{expect(toUploadsUrl('/assets/ptco/logo-flat.webp')).toBe('/assets/ptco/logo-flat.webp');expect(toUploadsUrl('assets/schoolcarebridge/demo-school.svg')).toBe('/assets/schoolcarebridge/demo-school.svg');});
 it('preserves uploaded-file and absolute URL behavior',()=>{expect(toUploadsUrl('/uploads/agency 2/logo.png')).toMatch(/\/uploads\/agency%202\/logo.png$/);expect(toUploadsUrl('https://schoolcarebridge.org/assets/logo.png')).toBe('https://schoolcarebridge.org/assets/logo.png');expect(toUploadsUrl(null)).toBeNull();});
});
