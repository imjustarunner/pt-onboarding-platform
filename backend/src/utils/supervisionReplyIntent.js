export function freshSupervisionReply(body) {
 return String(body||'').split(/\n(?:On .{5,200}wrote:|From:|_{5,}|-{5,}\s*Original|>)/i)[0].trim();
}
export function supervisionReplyIntent(body) {
 const text=freshSupervisionReply(body).toLowerCase().replace(/[’‘]/g,"'");
 // First-person attendance statements and common excuses can change the RSVP. Questions, uncertainty,
 // quoted invitations and other people's excuses remain messages for the host.
 if(/\b(?:next week|next month|different date|another session|end before|no conflict|doesn't conflict|won't affect)\b/.test(text))return null;
 if(/\b(?:might|maybe|not sure|if |unless|someone|she |he |they )/.test(text))return null;
 if(/\b(?:can|could|would) (?:we|you) (?:please )?(?:reschedule|cancel)\b/.test(text))return 'declined';
 if(/\?/.test(text))return null;
 const decline=/\b(?:i (?:can't|cannot|won't|will not) (?:attend|make it|make the|be (?:there|able to (?:attend|make)))|i(?:'m| am) (?:unable to (?:attend|make)|not (?:able to (?:attend|make)|attending|going to (?:attend|make)))|please (?:mark me (?:as )?(?:absent|not attending)|count me out))\b/.test(text);
 const accept=/\b(?:i(?:'ll| will| can) (?:attend|be there)|i(?:'m| am) (?:attending|able to attend))\b/.test(text);
 if(decline&&!accept)return 'declined';
 if(accept&&!decline)return 'accepted';
 // Interpret common explanations of absence even without an explicit decline.
 // Mere questions, being late, and hypothetical conflicts do not cancel an RSVP.
 if(/\b(?:running late|be late|join late|still (?:attend|join)|can still|might still)\b/.test(text))return null;
 const cancellation=/\b(?:please (?:cancel|reschedule) (?:my|our|the) (?:supervision|session|appointment)|(?:i|we) need to (?:cancel|reschedule)|count me out|have to miss|need to miss)\b/.test(text);
 const conflict=/\b(?:i have|i've got|my)\b/.test(text)&&/\b(?:conflict|conflicting|another appointment|doctor'?s appointment|dentist appointment|family emergency|schedule overlap|client (?:appointment|session) (?:at|during|scheduled)|another meeting (?:at|during))\b/.test(text);
 const unavailable=/\b(?:i(?:'m| am| will be)|i've been) (?:home sick|out sick|too sick|sick today|not feeling well|out of town|in (?:the )?hospital|unavailable)\b/.test(text);
 return cancellation||conflict||unavailable?'declined':null;
}
