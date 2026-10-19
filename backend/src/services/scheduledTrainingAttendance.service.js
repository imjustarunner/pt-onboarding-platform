import pool from '../config/database.js';
import {isScheduledTraining,trainingAttendancePolicy} from './scheduledTrainingPolicy.js';
export async function recordTrainingAttendance(event, attendees, db=pool) {
  if (!isScheduledTraining(event)) return;
  const [preferences]=await db.execute('SELECT user_id,is_required FROM meeting_participant_preferences WHERE event_id=?',[event.id]);
  for (const person of attendees) {
    const required = Number(preferences.find(p=>Number(p.user_id)===Number(person.user_id))?.is_required)===1;
    const [users]=await db.execute('SELECT role,credential,title,employment_type FROM users WHERE id=?',[person.user_id]);
    const policy=trainingAttendancePolicy(users[0],required);
    await db.execute(`INSERT INTO scheduled_training_logs (event_id,user_id,agency_id,attendance_seconds,credit_type,is_required,payable) VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE attendance_seconds=VALUES(attendance_seconds),credit_type=VALUES(credit_type),is_required=VALUES(is_required),payable=VALUES(payable)`,
      [event.id,person.user_id,event.agency_id,Math.max(0,Math.round(Number(person.total_seconds)||0)),policy.credit,Number(required),Number(policy.payable)]);
  }
}
