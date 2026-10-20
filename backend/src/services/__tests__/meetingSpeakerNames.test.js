import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {replaceMeetingSpeakerNames} from '../meetingSpeakerNames.service.js';
it('replaces recognized speaker labels with preferred names without editing spoken text or unknown speakers',()=>{
 expect(replaceMeetingSpeakerNames('[RYN@test] Email ryn@test for details.\n[guest@test] Hello', [{email:'ryn@test',name:'Ryn Pantoya'}])).toBe('[Ryn Pantoya] Email ryn@test for details.\n[guest@test] Hello');
});
