/** Preserve the editor's minutes when one continuous grid selection is published. */
export function virtualPublicationRanges(selected, edited) {
  const slots = [...(selected || [])].sort((a,b)=>Number(a.hour)-Number(b.hour));
  const continuous = slots.length <= 1 || slots.every((slot,i)=>
    slot.dayName === slots[0].dayName && slot.dateYmd === slots[0].dateYmd
    && (!i || Number(slot.hour) === Number(slots[i-1].hour)+1));
  if (continuous) return [{...edited}];
  return slots.map(slot=>({dayName:slot.dayName,startHour:Number(slot.hour),endHour:Number(slot.hour)+1,startMinute:0,endMinute:0}));
}

/** A virtual window occupies only its actual minutes within each calendar row. */
export function virtualAvailabilityCellSlice(startTime, endTime, hour, minute=0, step=60) {
  const toMinutes = value => {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return m && Number(m[1])<=24 && Number(m[2])<60 ? Number(m[1])*60+Number(m[2]) : NaN;
  };
  const start=toMinutes(startTime),end=toMinutes(endTime),cell=Number(hour)*60+Number(minute);
  if (!Number.isFinite(start+end+cell) || end<=start || step<=0) return null;
  const from=Math.max(start,cell),to=Math.min(end,cell+step);
  return to>from ? {topPct:(from-cell)/step*100,heightPct:(to-from)/step*100} : null;
}

/** Subtract actual busy minutes without editing the published working hours. */
export function virtualAvailabilityCellSlices(startTime,endTime,hour,minute=0,step=60,busy=[]) {
  const slice=virtualAvailabilityCellSlice(startTime,endTime,hour,minute,step);
  if(!slice)return [];
  const cell=Number(hour)*60+Number(minute);
  let free=[[cell+slice.topPct*step/100,cell+(slice.topPct+slice.heightPct)*step/100]];
  for(const [start,end] of busy) {
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
    free=free.flatMap(([from,to])=>end<=from||start>=to?[[from,to]]:[...(start>from?[[from,Math.min(start,to)]]:[]),...(end<to?[[Math.max(end,from),to]]:[])]);
  }
  return free.map(([from,to])=>({topPct:(from-cell)/step*100,heightPct:(to-from)/step*100}));
}
