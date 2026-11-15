const fail=message=>Object.assign(new Error(message),{status:400});
export function normalizeChildcareWorkIntervals(input,now=new Date()) {
  if(!Array.isArray(input)||!input.length||input.length>12)throw fail('Enter one to twelve actual work intervals.');
  const intervals=input.map(row=>{
    for(const value of [row.startedAt,row.endedAt])if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(value)))throw fail('Include the time zone for actual work.');
    const start=new Date(row.startedAt),end=new Date(row.endedAt);
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end>now||end-start>24*3600000)throw fail('Actual work must have a valid start and later end, and cannot be in the future.');
    return {startedAt:start.toISOString(),endedAt:end.toISOString()};
  }).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
  for(let i=1;i<intervals.length;i++)if(intervals[i].startedAt<intervals[i-1].endedAt)throw fail('Actual work intervals cannot overlap.');
  if(intervals.reduce((n,row)=>n+(+new Date(row.endedAt)-+new Date(row.startedAt)),0)>24*3600000)throw fail('Review actual work longer than 24 hours with the office.');
  return intervals;
}
export function correctedChildcarePunches(punches,corrections) {
  const latest=new Map();
  for(const row of corrections||[])if(row.status==='approved'&&(!latest.has(Number(row.user_id))||Number(row.id)>Number(latest.get(Number(row.user_id)).id)))latest.set(Number(row.user_id),row);
  const utc=value=>new Date(typeof value==='string'&&!/Z$|[+-]\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value).getTime();
  const result=punches.filter(row=>!latest.has(Number(row.user_id))||utc(row.punched_at)>utc(latest.get(Number(row.user_id)).reviewed_at));
  for(const [userId,row] of latest){const intervals=typeof row.intervals_json==='string'?JSON.parse(row.intervals_json):row.intervals_json;
    intervals.forEach((interval,i)=>{
      result.push({id:-(Number(row.id)*100+i*2),user_id:userId,punch_type:'clock_in',punched_at:interval.startedAt,correctionId:row.id});
      result.push({id:-(Number(row.id)*100+i*2+1),user_id:userId,punch_type:'clock_out',punched_at:interval.endedAt,correctionId:row.id});
    });
  }
  return result.sort((a,b)=>new Date(a.punched_at)-new Date(b.punched_at)||a.id-b.id);
}
export function childcareWorkApproved(review,snapshotHash) {return review?.status==='approved'&&review.snapshot_hash===snapshotHash;}
