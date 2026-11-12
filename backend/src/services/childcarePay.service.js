import {createHash} from 'node:crypto';
import {nluChildcareRate,isNluCompensationProfile} from '../content/nluCompensationPolicy.js';
import {effectiveCompensationAgreement,agreementRateProfile} from './employmentAgreementPolicy.service.js';
import {utcDateToZonedYmd,toUtcIso,zonedDateHourToMysqlUtc,utcMysqlToIso} from '../utils/zonedWallTime.util.js';

const money=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
export const childcareStoredIso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)?new Date(`${value.replace(' ','T')}Z`).toISOString():toUtcIso(value);
const instant=value=>new Date(childcareStoredIso(value)).getTime();
const fail=message=>Object.assign(new Error(message),{status:409,code:'CHILDCARE_PAY_REVIEW_REQUIRED'});
export const childcareSnapshotHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function childcareRateSchedule({agencyId,userId,asOfDate,db}) {
  const agreement=await effectiveCompensationAgreement({agencyId,userId,asOfDate},db);
  if(!agreement)throw fail('An effective executed or explicitly payroll-authorized childcare agreement is required.');
  const profile=agreementRateProfile({},agreement);
  if(!isNluCompensationProfile(profile)||!profile.childcareLevel)throw fail('Confirm the employee’s approved NLU childcare placement before calculating pay.');
  const ratesByBand={};
  for(const children of [1,2,3,4])ratesByBand[children]=nluChildcareRate({category:profile.category,level:profile.childcareLevel,children,caregivers:1,individualHourlyRate:profile.childcareRate,ratesByBand:profile.childcareRatesByBand}).rate;
  return {profile,category:profile.category,childcareLevel:profile.childcareLevel,ratesByBand,scheduleId:agreement.id,effectiveOn:agreement.effectiveOn,rateSource:profile.childcareRatesByBand?'individual_band_override':profile.childcareRate!=null?'legacy_individual_flat_override':'category_level',reviewRequired:false,reasons:[]};
}

/** Pair actual employee punches. An unmatched punch remains visible, never auto-completed. */
export function childcareWorkIntervals(punches) {
  const intervals=[],open=new Map(),reasons=[];
  for(const punch of [...punches].sort((a,b)=>instant(a.punched_at)-instant(b.punched_at)||Number(a.id)-Number(b.id))) {
    const uid=Number(punch.user_id),at=instant(punch.punched_at);
    if(!Number.isFinite(at)){reasons.push('An invalid recorded punch requires review.');continue;}
    if(punch.punch_type==='clock_in') {
      if(open.has(uid)){reasons.push(`Employee ${uid} has overlapping clock-ins.`);continue;}
      open.set(uid,{startedAt:at,punchInId:Number(punch.id)});
    } else if(punch.punch_type==='clock_out') {
      const start=open.get(uid);
      if(!start||at<=start.startedAt){reasons.push(`Employee ${uid} has an unmatched or invalid clock-out.`);continue;}
      intervals.push({userId:uid,...start,endedAt:at,punchOutId:Number(punch.id)});open.delete(uid);
    }
  }
  return {intervals,open,reasons};
}

function midnightBoundaries(start,end,timezone) {
  const out=[];let day=utcDateToZonedYmd(new Date(start),timezone);
  for(let guard=0;guard<32;guard++) {
    const next=new Date(`${day}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);day=next.toISOString().slice(0,10);
    const boundary=new Date(utcMysqlToIso(zonedDateHourToMysqlUtc(day,0,timezone))).getTime();
    if(boundary>=end)break;if(boundary>start)out.push(boundary);
  }
  return out;
}

/** Each employee is priced independently for every change in actual children/staffing/date. */
export async function calculateChildcarePay({shift,userId,punches,attendance,resolveSchedule=childcareRateSchedule,db}) {
  const {intervals,open,reasons:pairReasons}=childcareWorkIntervals(punches),uid=Number(userId);
  const reasons=[...pairReasons],segments=[],changes=[...attendance].map(row=>({...row,at:instant(row.effective_at)})).sort((a,b)=>a.at-b.at||Number(a.version)-Number(b.version));
  if(shift.attendance_review_required)reasons.push('Confirm when the reported child count changed before approving payroll.');
  if(open.has(uid))reasons.push('This employee has an open clock-in. Recorded time is retained; clock out when work ends.');
  const scheduleCache=new Map();
  for(const own of intervals.filter(row=>row.userId===uid)) {
    const allStaff=[...intervals,...[...open].map(([userId,row])=>({userId,...row,endedAt:Infinity}))];
    const boundaries=[own.startedAt,own.endedAt,...changes.map(row=>row.at),...allStaff.flatMap(row=>[row.startedAt,row.endedAt]),...midnightBoundaries(own.startedAt,own.endedAt,shift.timezone)];
    const points=[...new Set(boundaries.filter(at=>at>=own.startedAt&&at<=own.endedAt))].sort((a,b)=>a-b);
    for(let i=0;i<points.length-1;i++) {
      const startedAt=points[i],endedAt=points[i+1];if(endedAt<=startedAt)continue;
      const observed=changes.filter(row=>row.at<=startedAt).at(-1),children=observed?Number(observed.actual_children):null;
      const caregivers=new Set(allStaff.filter(row=>row.startedAt<=startedAt&&row.endedAt>startedAt).map(row=>row.userId)).size;
      const segment={startedAt:new Date(startedAt).toISOString(),endedAt:new Date(endedAt).toISOString(),minutes:(endedAt-startedAt)/60000,children,caregivers,punchInId:own.punchInId,punchOutId:own.punchOutId,band:children==null?null:Math.max(1,Math.ceil(children/caregivers)),rate:null,amount:null};
      try {
        if(children==null)throw fail('Actual child attendance is missing for part of the recorded work.');
        if(!(Number(shift.minimum_hourly_rate)>0)||!String(shift.wage_floor_jurisdiction||'').trim())throw fail('A manager must confirm the applicable work-location wage floor and jurisdiction.');
        const day=utcDateToZonedYmd(new Date(startedAt),shift.timezone);
        if(!scheduleCache.has(day))scheduleCache.set(day,await resolveSchedule({agencyId:shift.agency_id,userId:uid,asOfDate:day,db}));
        const schedule=scheduleCache.get(day),profile=schedule.profile;
        const result=nluChildcareRate({category:profile.category,level:profile.childcareLevel,children,caregivers,minimumHourlyRate:shift.minimum_hourly_rate,individualHourlyRate:profile.childcareRate,ratesByBand:profile.childcareRatesByBand});
        Object.assign(segment,{rate:result.rate,agreedRate:result.agreedRate,rateSource:result.rateSource,scheduleId:schedule.scheduleId,amount:money(segment.minutes/60*result.rate),wageFloorJurisdiction:shift.wage_floor_jurisdiction});
      } catch(error) {reasons.push(error.message);segment.reviewReason=error.message;}
      segments.push(segment);
    }
  }
  const unique=[...new Set(reasons)];
  return {shiftId:Number(shift.id),userId:uid,segments,totalMinutes:segments.reduce((sum,row)=>sum+row.minutes,0),totalAmount:unique.length?null:money(segments.reduce((sum,row)=>sum+row.amount,0)),reviewRequired:unique.length>0,reasons:unique};
}

export function childcareClaimAmount(claim,approvedHours=null) {
  const payload=claim?.payload||{},snapshot=payload.childcareSnapshot;
  if(!snapshot||snapshot.reviewRequired||snapshot.totalAmount==null||payload.childcareSnapshotHash!==childcareSnapshotHash(snapshot))throw fail('Review the childcare attendance, staffing and rate snapshot before approving pay.');
  if(approvedHours!=null&&Math.abs(Number(approvedHours)-snapshot.totalMinutes/60)>.005001)throw fail('Correct actual childcare time in its shift before changing payroll hours.');
  return snapshot.totalAmount;
}
