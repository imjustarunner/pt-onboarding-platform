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
 it('keeps a canceled clinical session in front of its school assignment without removing the rest of the school day',()=>{
  const lanes=layoutScheduleDayBlocks([{hour:9,blocks:[{key:'school',kind:'school',timedSlice:{topPct:0,heightPct:400}},{key:'session',kind:'sevt',isClientSession:true,isCancelled:true,timedSlice:{topPct:0,heightPct:100}}]}]);
  expect(lanes.get('9:0:school')).toEqual({col:0,cols:1,background:true});expect(lanes.get('9:0:session')).toEqual({col:0,cols:1});
  const schoolOnly=layoutScheduleDayBlocks([{hour:11,blocks:[{key:'school',kind:'school'}]}]);expect(schoolOnly.get('11:0:school')).toEqual({col:0,cols:1});
 });
 it('keeps virtual availability and school context behind overlapping clients while retaining their real appointment lanes',()=>{
  const lanes=layoutScheduleDayBlocks([
   {hour:10,blocks:[
    {key:'school',kind:'school'},
    {key:'virtual',kind:'portal',virtualSlice:{topPct:25,heightPct:75}},
    {key:'student',kind:'school-soft',isClientSession:true,timedSlice:{topPct:28/60*100,heightPct:53/60*100}},
    {key:'office',kind:'sevt',isClientSession:true,timedSlice:{topPct:75,heightPct:75}}
   ]},
   {hour:11,blocks:[{key:'school',kind:'school'},{key:'virtual',kind:'portal'}]},
   {hour:12,blocks:[{key:'virtual',kind:'portal'}]}
  ]);
  for(const key of ['10:0:school','10:0:virtual','11:0:school','11:0:virtual'])expect(lanes.get(key)).toEqual({col:0,cols:1,background:true});
  expect(lanes.get('10:0:student')).toEqual({col:0,cols:2});
  expect(lanes.get('10:0:office')).toEqual({col:1,cols:2});
  expect(lanes.get('12:0:virtual')).toEqual({col:0,cols:1});
 });
 it('keeps quarter-hour virtual context out of a short client slot without hiding an adjacent opening',()=>{
  const lanes=layoutScheduleDayBlocks([
   {hour:10,minute:15,blocks:[{key:'virtual',kind:'portal'},{key:'student',kind:'school-soft',timedSlice:{topPct:13/15*100,heightPct:53/15*100}}]},
   {hour:10,minute:30,blocks:[{key:'virtual',kind:'portal'}]},
   {hour:11,minute:30,blocks:[{key:'virtual',kind:'portal'}]}
  ],15);
  expect(lanes.get('10:15:student')).toEqual({col:0,cols:1});
  expect(lanes.get('10:15:virtual').background).toBe(true);
  expect(lanes.get('10:30:virtual').background).toBe(true);
  expect(lanes.get('11:30:virtual')).toEqual({col:0,cols:1});
 });
 it('gives intersecting intervals different lanes regardless of source order',()=>{
  const rows=Array.from({length:70},(_,i)=>({key:`item-${i}`,startMs:i*17%180,endMs:i*17%180+13+i%60}));
  const lanes=assignOverlapLanes(rows.reverse());
  for(const a of rows) for(const b of rows) if(a.key!==b.key&&a.startMs<b.endMs&&b.startMs<a.endMs)expect(lanes.get(a.key).col).not.toBe(lanes.get(b.key).col);
 });
});

it('gives the office, saved availability and Google busy block three visible lanes in side-by-side mode', () => {
  const cells = [{ hour: 8, blocks: [{key:'office',kind:'office'},{key:'virtual',kind:'portal'},{key:'busy',kind:'gbusy'}] }];
  const layout = layoutScheduleDayBlocks(cells,60,{showAvailabilityLanes:true});
  expect([...layout.values()].map(item=>item.col).sort()).toEqual([0,1,2]);
  expect([...layout.values()].every(item=>item.cols===3 && !item.background)).toBe(true);
});
