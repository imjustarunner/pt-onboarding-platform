import { describe,it,expect } from 'vitest';
import { assignOverlapLanes,layoutScheduleDayBlocks } from '../scheduleOverlapLayout.js';
describe('calendar overlap layout',()=>{
 it('keeps a long block beside later events and releases lanes for adjacent events',()=>{
  const lanes=assignOverlapLanes([{key:'long',startMs:7,endMs:15},{key:'meeting',startMs:13,endMs:14},{key:'next',startMs:14,endMs:15},{key:'later',startMs:16,endMs:17}]);
  expect(lanes.get('long')).toEqual({col:0,cols:2});expect(lanes.get('meeting')).toEqual({col:1,cols:2});expect(lanes.get('next')).toEqual({col:1,cols:2});expect(lanes.get('later')).toEqual({col:0,cols:1});
 });
 it('allocates every item, including more than three simultaneous events',()=>{
  const rows=Array.from({length:6},(_,i)=>({key:`event-${i}`,startMs:13,endMs:14}));
  const lanes=assignOverlapLanes(rows);expect(lanes.size).toBe(6);expect(new Set([...lanes.values()].map(l=>l.col)).size).toBe(6);
  expect([...lanes.values()].every(l=>l.cols===6)).toBe(true);
 });
 it('uses one layout for multi-hour spans, office cells, Google overlays and partial openings',()=>{
  const lanes=layoutScheduleDayBlocks([
   {hour:7,blocks:[{key:'hold',timedSlice:{topPct:0,heightPct:750}},{key:'google'}]},
   {hour:13,blocks:[{key:'office'},{key:'opening',virtualSlice:{topPct:50,heightPct:50}}]},
   {hour:14,blocks:[{key:'office'}]}
  ]);
  const hold=lanes.get('7:0:hold');expect(hold.cols).toBe(3);
  expect(lanes.get('13:0:office').col).not.toBe(hold.col);expect(lanes.get('14:0:office').col).not.toBe(hold.col);
  expect(lanes.get('13:0:opening').col).not.toBe(lanes.get('13:0:office').col);
 });
 it('keeps quarter-hour events at their real offsets',()=>{
  const lanes=layoutScheduleDayBlocks([{hour:13,minute:15,blocks:[{key:'a',timedSlice:{topPct:0,heightPct:200}}]},{hour:13,minute:30,blocks:[{key:'b'}]},{hour:13,minute:45,blocks:[{key:'c'}]}],15);
  expect(lanes.get('13:15:a').cols).toBe(2);expect(lanes.get('13:30:b').col).toBe(1);expect(lanes.get('13:45:c').cols).toBe(1);
 });
 it('gives intersecting intervals different lanes regardless of source order',()=>{
  const rows=Array.from({length:70},(_,i)=>({key:`item-${i}`,startMs:i*17%180,endMs:i*17%180+13+i%60}));
  const lanes=assignOverlapLanes(rows.reverse());
  for(const a of rows) for(const b of rows) if(a.key!==b.key&&a.startMs<b.endMs&&b.startMs<a.endMs)expect(lanes.get(a.key).col).not.toBe(lanes.get(b.key).col);
 });
});
