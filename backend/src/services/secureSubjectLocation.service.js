import pool from '../config/database.js';
import {assertCanReadFamilySecureMessage} from './familySecureMessageAccess.service.js';

/** Resolve a notification to its subject only after current and saved-audience access. */
export async function locateSecureSubject({userId,threadId,messageId},db=pool,{authorize=assertCanReadFamilySecureMessage}={}){
  const tid=Number(threadId),mid=Number(messageId);
  if(!Number.isSafeInteger(tid)||tid<1||!Number.isSafeInteger(mid)||mid<1)throw Object.assign(new Error('Invalid secure message.'),{status:400});
  await authorize({userId,messageId:mid,threadId:tid},db);
  const [[message]]=await db.execute('SELECT id,parent_message_id FROM chat_messages WHERE id=? AND thread_id=?',[mid,tid]);
  if(!message)throw Object.assign(new Error('Secure message not found.'),{status:404});
  const root=Number(message.parent_message_id||message.id);
  await authorize({userId,messageId:root,threadId:tid},db);
  return {threadId:tid,rootMessageId:root,messageId:mid};
}
