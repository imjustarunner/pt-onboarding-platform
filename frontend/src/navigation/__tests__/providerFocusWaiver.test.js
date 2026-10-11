import {it,expect} from 'vitest';
import {FOCUS_GROUPS,validateFocus,publishedFocus,missingFocusGroups,focusMatch,validateMatchingPreferences} from '../providerFocus.js';
const waived=()=>({top:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]])),excluded:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]])),waived:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,true]))});
it('persists unique random highlights per waived group and preserves them on another save',()=>{
 const input=waived();input.excluded.specialties=['Depression','Anxiety'];
 const saved=validateFocus(input,FOCUS_GROUPS,{requireThree:true});
 expect(missingFocusGroups(saved)).toEqual([]);
 for(const group of FOCUS_GROUPS){const highlights=saved.automaticTop[group.key];expect(new Set(highlights).size).toBe(3);expect(highlights.every(v=>group.options.includes(v)&&!saved.excluded[group.key].includes(v))).toBe(true);expect(publishedFocus(group.key,saved).top).toEqual(highlights);}
 expect(validateFocus(saved).automaticTop).toEqual(saved.automaticTop);
 expect(focusMatch(saved,{specialties:[saved.automaticTop.specialties[0]]})).toEqual({eligible:true,score:0});
});
it('never fills highlights from excluded choices even with fewer than three available',()=>{
 const input=waived(),group=FOCUS_GROUPS[0];input.excluded.specialties=group.options.slice(2);
 let saved=validateFocus(input,FOCUS_GROUPS,{requireThree:true});expect(saved.automaticTop.specialties).toHaveLength(2);expect(publishedFocus('specialties',saved).top).toEqual(saved.automaticTop.specialties);
 input.excluded.specialties=[...group.options];saved=validateFocus(input,FOCUS_GROUPS,{requireThree:true});expect(publishedFocus('specialties',saved).top).toEqual([]);
});
it('does not silently waive unanswered groups or trust nonboolean waivers',()=>{
 const input=waived();delete input.waived.specialties;expect(missingFocusGroups(input).map(g=>g.key)).toEqual(['specialties']);expect(()=>validateFocus(input,FOCUS_GROUPS,{requireThree:true})).toThrow('Specialties');
 input.waived.specialties='true';expect(()=>validateFocus(input)).toThrow('waive');
});
it('allows all canonical client needs for Exchange while preserving the public intake priority cap',()=>{
 const input={specialties:FOCUS_GROUPS[0].options.slice(0,5)};
 expect(validateMatchingPreferences(input,{maxSelections:0}).specialties).toHaveLength(5);
 expect(()=>validateMatchingPreferences(input)).toThrow();expect(()=>validateMatchingPreferences({specialties:['invented']},{maxSelections:0})).toThrow();
});
