import {describe,it,expect} from 'vitest';import {supportReplyEdits} from '../supportReplyEdits.js';
const row=(before,after)=>({comparison:{generatedDraft:before},deliveries:[{composedBody:after,body:`${after}\nSchools signature`}]});
describe('support reply edit evidence',()=>{
 it('compares the actual staff composition without counting an automatic signature as an edit',()=>{expect(supportReplyEdits(row('Thanks.','Thanks.')).changed).toBe(false);});
 it('shows exact removed and added wording while preserving ordinary text',()=>{const result=supportReplyEdits(row('Thanks. I will check soon.','Thanks. I can review it.'));expect(result.changed).toBe(true);expect(result.parts.filter(p=>p.kind!=='added').map(p=>p.text).join('')).toBe('Thanks. I will check soon.');expect(result.parts.filter(p=>p.kind!=='removed').map(p=>p.text).join('')).toBe('Thanks. I can review it.');});
 it('does not invent staff edits from an old email without a separately captured composition',()=>{expect(supportReplyEdits({comparison:{generatedDraft:'Thanks'},deliveries:[{body:'Thanks\nSignature'}]})).toBe(null);});
 it('keeps large comparisons bounded and treats HTML as ordinary text',()=>{const before='word '.repeat(1200)+'<script>old</script>',after='word '.repeat(1200)+'new';const result=supportReplyEdits(row(before,after));expect(result.parts.filter(p=>p.kind!=='added').map(p=>p.text).join('')).toBe(before);expect(result.parts.filter(p=>p.kind!=='removed').map(p=>p.text).join('')).toBe(after);});
});
