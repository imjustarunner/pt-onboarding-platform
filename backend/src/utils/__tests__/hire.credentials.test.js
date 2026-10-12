import {it,expect} from 'vitest';
import {validateCredentials,credentialItems} from '../credentialDisplay.js';
it('normalizes punctuation, preserves chosen order and removes duplicates',()=>{expect(validateCredentials('M.A., LPCC, MA')).toBe('MA, LPCC');expect(credentialItems('LPC, MA, LAC')).toEqual(['LPC','MA','LAC']);});
it('rejects invented credentials and preserves empty optional selection',()=>{expect(()=>validateCredentials('MA, MADE-UP')).toThrow('available list');expect(validateCredentials('')).toBe('');});
