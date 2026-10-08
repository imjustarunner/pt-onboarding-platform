import {it,expect} from 'vitest';
import {announcementSequence} from '../announcementSequence.js';
it('cycles all five birthdays and two anniversaries in seven stable colors',()=>{
 const people=Array.from({length:7},(_,i)=>({key:`${i}`,kind:i<5?'birthday':'work_anniversary',text:`Person ${i}`}));
 const loop=announcementSequence(people);
 expect(loop.map(p=>p.key)).toEqual(people.map(p=>p.key));expect(new Set(loop.map(p=>p.tone)).size).toBe(7);
 expect(announcementSequence(people)).toEqual(loop);
});
it('only repeats one announcement in multiple colors and never limits a longer list',()=>{
 expect(announcementSequence([{key:'one'}]).map(p=>p.tone)).toEqual([0,1,2,3,4]);
 expect(announcementSequence(Array.from({length:20},(_,i)=>({key:i})))).toHaveLength(20);
});
