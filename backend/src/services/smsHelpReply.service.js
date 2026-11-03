import pool from '../config/database.js';

// An atomic claim survives process restarts and concurrent webhook aliases.
// Never resend an attempt whose carrier send or acknowledgement was uncertain.
export async function sendApplicationHelpReply({ sender, recipient, body, messageId, send }) {
  if (!messageId) throw Object.assign(new Error('HELP requires an inbound message ID'), { status: 400 });
  let attemptId;
  try {
    const [claim] = await pool.execute(`INSERT INTO sms_keyword_reply_attempts
      (agency_id,number_id,inbound_message_id,keyword,from_number,to_number,body,status)
      VALUES (?,?,?,'HELP',?,?,?,'pending')`,
    [sender.agency_id,sender.id,String(messageId),sender.phone_number,recipient,body]);
    attemptId = claim.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return;
    throw error;
  }
  try {
    const result = await send();
    if (!result?.sid) throw Object.assign(new Error('HELP acknowledgement missing'), { code: 'sms_help_ack_missing' });
    await pool.execute("UPDATE sms_keyword_reply_attempts SET status='submitted',provider_message_id=? WHERE id=?", [result.sid,attemptId]);
  } catch (error) {
    await pool.execute("UPDATE sms_keyword_reply_attempts SET status='needs_review',error_code=? WHERE id=?",
      [String(error.code || 'help_reply_uncertain').slice(0,80),attemptId]);
    throw error;
  }
}
