import {expect,it} from 'vitest';
import {formatFileSize} from '../fileSize.js';
it('shows tiny real files in bytes and KB instead of 0.0 MB',()=>{expect(formatFileSize(739)).toBe('739 bytes');expect(formatFileSize(2048)).toBe('2.0 KB');expect(formatFileSize(1048576)).toBe('1.0 MB');expect(formatFileSize(0)).toBe('0 bytes');expect(formatFileSize(null)).toBe('Size unavailable');});
