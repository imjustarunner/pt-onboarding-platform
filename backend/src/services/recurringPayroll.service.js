import pool from '../config/database.js';
export const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
export function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function occurrenceDates(schedule, periodStart, periodEnd) {
  const start=day(schedule.starts_on), end=day(schedule.ends_on)||periodEnd;
  if(!validDay(start)||!validDay(periodStart)||!validDay(periodEnd)) throw new Error('Valid schedule and period dates are required');
  if(!['once','weekly','biweekly','monthly'].includes(schedule.cadence)) throw new Error('Invalid recurrence');
  const out=[], anchor=new Date(start+'T12:00:00Z');
  for(let n=0;n<12000;n++) {
    const d=new Date(anchor);
    if(schedule.cadence==='monthly') {
      d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);
      const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
      d.setUTCDate(Math.min(anchor.getUTCDate(),last));
    } else d.setUTCDate(d.getUTCDate()+n*(schedule.cadence==='biweekly'?14:7));
    const current=day(d);
    if(current>periodEnd||current>end)break;
    if(current>=periodStart)out.push(current);
    if(schedule.cadence==='once')break;
  }
  return out;
}
export function normalizeRecurring(input) {
  const label=String(input.label||'').trim(), startsOn=day(input.startsOn),endsOn=input.endsOn?day(input.endsOn):null;
  const cadence=String(input.cadence||''),minutes=Number(input.minutes||0),hourlyRate=minutes>0?Number(input.hourlyRate):null;
  const amount=minutes>0?Math.round(minutes/60*hourlyRate*100)/100:Number(input.amount);
  if(!label||label.length>110||!validDay(startsOn)||(endsOn&&(!validDay(endsOn)||endsOn<startsOn))||!['once','weekly','biweekly','monthly'].includes(cadence)||!Number.isFinite(amount)||Math.round(amount*100)<=0||amount>100000||!Number.isFinite(minutes)||minutes<0||minutes>10080||(minutes>0&&(!Number.isFinite(hourlyRate)||hourlyRate<=0))) throw Object.assign(new Error('Enter a label, valid dates, frequency, and a positive amount or minutes and hourly rate.'),{status:400});
  return {label,startsOn,endsOn,cadence,minutes,hourlyRate,amount:Math.round(amount*100)/100};
}
export async function materializeRecurring({agencyId,payrollPeriodId}) {
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[period]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE',[payrollPeriodId,agencyId]);
    if(!period||['posted','finalized'].includes(period.status)){await db.rollback();return;}
    const [schedules]=await db.execute(`SELECT r.* FROM payroll_recurring_payments r JOIN users u ON u.id=r.user_id
      JOIN user_agencies ua ON ua.user_id=r.user_id AND ua.agency_id=r.agency_id
      WHERE r.agency_id=? AND r.starts_on<=? AND (r.ends_on IS NULL OR r.ends_on>=?) AND COALESCE(u.is_active,1)=1 AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.status='ACTIVE_EMPLOYEE' FOR UPDATE`,[agencyId,day(period.period_end),day(period.period_start)]);
    for(const s of schedules)for(const date of occurrenceDates(s,day(period.period_start),day(period.period_end))) {
      const [[existing]]=await db.execute('SELECT id FROM payroll_recurring_occurrences WHERE recurring_payment_id=? AND occurrence_date=?',[s.id,date]);
      if(existing)continue;
      const [line]=await db.execute(`INSERT INTO payroll_manual_pay_lines (payroll_period_id,agency_id,user_id,line_type,label,category,credits_hours,amount,metadata_json,created_by_user_id)
        VALUES (?,?,?,'pay',?,'indirect',?,?,?,?)`,[payrollPeriodId,agencyId,s.user_id,`${s.label} · ${date}`,Number(s.minutes)/60,s.amount,JSON.stringify({source:'recurring_payment',scheduleId:s.id,serviceDate:date,minutes:Number(s.minutes),hourlyRate:s.hourly_rate}),s.created_by_user_id]);
      await db.execute('INSERT INTO payroll_recurring_occurrences (recurring_payment_id,occurrence_date,payroll_period_id,manual_pay_line_id) VALUES (?,?,?,?)',[s.id,date,payrollPeriodId,line.insertId]);
    }
    await db.commit();
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
