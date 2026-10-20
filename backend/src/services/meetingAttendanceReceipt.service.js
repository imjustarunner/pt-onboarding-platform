import { isStudentIntern } from '../utils/studentIntern.js';
import { supervisionAttendance } from './supervisionAttendancePolicy.js';
import { meetingClaimHourlyRate } from './meetingClaimRate.service.js';
import pool from '../config/database.js';
import { meetingClaimCompensation } from './meetingClaimRate.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
const json = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const rounded = value => Math.round(Number(value || 0) * 100) / 100;
export async function meetingAttendanceReceipt(type, id, userId, meeting) {
  const supervision = type === 'supervision';
  const table = supervision ? 'supervision_session_attendance_rollups' : 'agency_meeting_attendance_rollups';
  const key = supervision ? 'session_id' : 'event_id';
  const [[attendance]] = await pool.execute(`SELECT total_seconds FROM ${table} WHERE ${key}=? AND user_id=?`, [id,userId]);
  const [[host]] = await pool.execute("SELECT CONCAT_WS(' ',COALESCE(NULLIF(preferred_name,''),first_name),last_name) name FROM users WHERE id=?", [Number(supervision ? meeting.supervisor_user_id : meeting.provider_id) || 0]);
  const date = parseUtcDate(meeting.start_at);
  const receipt = { host:host?.name || '', minutes:attendance ? rounded(attendance.total_seconds / 60) : null,
    dateLabel:date ? new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:meeting.event_timezone || 'America/Denver'}).format(date) + ` (${meeting.event_timezone || 'America/Denver'})` : '', compensation:'', balance:null };
  if (supervision) {
    const [[credit]] = await pool.execute('SELECT individual_hours,group_hours,total_seconds,source_json FROM supervision_session_hour_credits WHERE session_id=? AND user_id=?',[id,userId]);
    const [[person]] = await pool.execute(`SELECT u.id,u.role,u.credential,u.title,u.employment_type,
      ua.supervision_is_prelicensed,ua.supervision_is_compensable,ua.supervision_start_date,
      a.is_required,a.is_compensable_snapshot,sa.individual_hours AS supervision_individual_hours,sa.group_hours AS supervision_group_hours
      FROM users u LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      LEFT JOIN supervision_session_attendees a ON a.user_id=u.id AND a.session_id=?
      LEFT JOIN supervision_accounts sa ON sa.user_id=u.id AND sa.agency_id=ua.agency_id WHERE u.id=?`,[meeting.agency_id,id,userId]);
    const intern=isStudentIntern(person || {});
    const tracked=!intern && (Number(person?.supervision_is_prelicensed)===1 || /\b(LPCC|LMFTC|MFTC|LSW|SWC|LPC-A)\b/i.test(person?.credential || ''));
    if (credit) {
      const snapshot=json(credit.source_json);
      receipt.minutes=rounded(credit.total_seconds/60);
      if (tracked && snapshot.countable !== false) receipt.balance={before:snapshot.hoursBefore ?? null,after:snapshot.hoursAfter ?? null,earned:rounded(Number(credit.individual_hours)+Number(credit.group_hours)),track:meeting.session_type === 'group' ? 'Group supervision' : 'Individual supervision'};
    }
    const eligibility=person ? supervisionAttendance(meeting,person) : null;
    if(intern)receipt.compensation='Unpaid supervision attendance; record this as indirect internship time.';
    else if(eligibility?.label.endsWith(' · Compensated')) {
      const host=[meeting.supervisor_user_id,meeting.co_facilitator_user_id].some(id=>Number(id)>0 && Number(userId)===Number(id));
      const code=host?'99415':'MEETING';
      const day=date ? new Intl.DateTimeFormat('en-CA',{timeZone:meeting.event_timezone || 'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : null;
      const rate=host ? null : await meetingClaimHourlyRate({agency_id:meeting.agency_id,user_id:userId,claim_date:day,payload:{serviceCode:code}},null);
      receipt.compensation=rate!=null && receipt.minutes!=null
        ? `Estimated compensation: $${rounded(rate*receipt.minutes/60).toFixed(2)} for ${receipt.minutes} recorded minutes at $${Number(rate).toFixed(2)}/hour. Pending payroll review; this is not a payment confirmation.`
        : 'Compensated attendance recorded. The amount is pending payroll review.';
    } else if(eligibility)receipt.compensation=eligibility.tier==='optional'?'Optional attendance; not compensated.':'Attendance recorded; not currently eligible for compensation.';
  } else {
    const [[claim]] = await pool.execute("SELECT * FROM payroll_time_claims WHERE agency_id=? AND user_id=? AND claim_type='meeting_training' AND JSON_EXTRACT(payload_json,'$.scheduleEventId')=? AND status NOT IN ('withdrawn','rejected') ORDER BY id DESC LIMIT 1",[meeting.agency_id,userId,id]);
    if (claim) {
      claim.payload=json(claim.payload_json);
      const pay=await meetingClaimCompensation(claim);
      receipt.claimId=claim.id;
      receipt.compensation=pay.appliedAmount != null ? `Payroll amount: $${pay.appliedAmount.toFixed(2)} (${pay.rateLabel}).`
        : pay.estimatedAmount != null ? `Estimated compensation: $${pay.estimatedAmount.toFixed(2)} for ${claim.payload.totalMinutes} submitted minutes at $${pay.hourlyRate.toFixed(2)}/hour (${pay.rateLabel}). Pending payroll review; this is not a payment confirmation.`
        : `${claim.payload.totalMinutes} minutes submitted automatically for ${pay.rateLabel}. Rate needs review; an estimate is not available yet. Pending payroll review.`;
    } else if (meeting.meeting_subtype === 'training') {
      const [[log]]=await pool.execute('SELECT credit_type,payable FROM scheduled_training_logs WHERE event_id=? AND user_id=?',[id,userId]);
      receipt.compensation=log?.credit_type === 'indirect' ? 'Unpaid indirect training time toward your internship requirements.' : log && !Number(log.payable) ? 'Attendance recorded; this training attendance is not compensated.' : 'Compensation is awaiting review.';
    }
  }
  return receipt;
}
