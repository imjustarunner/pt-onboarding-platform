import { normalizeWorkflowPhone } from './phoneWorkflow.service.js';

// The actor is always req.user.id in the call settings controller; callers
// cannot select a different provider's mailbox or greetings.
export function validateProviderVoicemailSettings(body = {}) {
  const patch = {};
  for (const key of ['voicemail_message','voicemail_ooo_message','voicemail_vacation_message']) {
    if (!Object.hasOwn(body,key)) continue;
    const value=body[key];
    if (typeof value !== 'string' || value.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
      throw Object.assign(new Error('Voicemail greetings must be text of at most 1,000 characters.'),{status:400});
    }
    patch[key]=value.trim();
  }
  if (Object.hasOwn(body,'forward_to_phone')) patch.forward_to_phone=normalizeWorkflowPhone(body.forward_to_phone,true) || null;
  return patch;
}
