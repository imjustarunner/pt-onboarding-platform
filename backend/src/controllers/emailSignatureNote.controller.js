import pool from '../config/database.js';
export async function emailSignatureNote(req,res,next){
 try{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='PUT'){
   const text=req.body?.text;
   if(typeof text!=='string'||text.length>2000)throw Object.assign(new Error('Use up to 2,000 characters of plain text.'),{status:400});
   await pool.execute(`INSERT INTO user_preferences(user_id,notification_categories) VALUES(?,JSON_OBJECT('email_signature_note',?)) ON DUPLICATE KEY UPDATE notification_categories=JSON_SET(COALESCE(notification_categories,JSON_OBJECT()),'$.email_signature_note',?),updated_at=CURRENT_TIMESTAMP`,[req.user.id,text.trim(),text.trim()]);
  }
  const [[row]]=await pool.execute("SELECT JSON_UNQUOTE(JSON_EXTRACT(notification_categories,'$.email_signature_note')) AS text FROM user_preferences WHERE user_id=?",[req.user.id]);
  res.json({text:row?.text||''});
 }catch(e){next(e);}
}
