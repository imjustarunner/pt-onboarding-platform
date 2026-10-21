import {encryptChatText,decryptChatText} from './chatEncryption.service.js';
const format='auricwell-guardian-screenshot/v1';
export function encryptGuardianScreenshot(buffer,{ticketId}) {
  const encrypted=encryptChatText(JSON.stringify({ticketId:Number(ticketId),image:buffer.toString('base64')}));
  return Buffer.from(JSON.stringify({format,...encrypted}));
}
export function decryptGuardianScreenshot(buffer,{ticketId}) {
  const envelope=JSON.parse(buffer.toString('utf8'));
  if(envelope.format!==format)throw new Error('Unsupported encrypted screenshot format');
  const payload=JSON.parse(decryptChatText(envelope));
  if(payload.ticketId!==Number(ticketId)||typeof payload.image!=='string')throw new Error('Screenshot does not belong to this support ticket');
  return Buffer.from(payload.image,'base64');
}
