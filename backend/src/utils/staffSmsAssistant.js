export const ITSCO_STAFF_ASSISTANT_NUMBER = '+17197163884';
export const STAFF_ASSISTANT_EXAMPLES = ['When is my first client today?','Who has confirmed today?','Who is still unconfirmed today?','When do I see [client initials]?','When am I available?','When is my next open appointment?','What was my last pay?','How many things are on my task list?','Send me my task list','How many notes do I have to do?','When is the pay period over?','How many messages do I have?','Send message to Rachel','Remind me to finish my notes tomorrow','Add task: review my schedule','Add to my schedule','Planned out tomorrow 8–12 PM'];
export function parseStaffSmsRequest(raw){
 const text=String(raw||'').trim();
 if(!text||text.length>1600)return null;
 if(/^(MENU|COMMANDS|ACCOUNT HELP|#MENU)$/i.test(text))return {kind:'menu'};
 if(/^(START|STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|HELP|YES|NO|Y|N|R|SUPPORT|\d+)$/i.test(text))return null;
 if(/^(when (is|do|am|are)|who (has|is)|how many|what (was|is)|send (me |message|a message)|remind me|add (a )?(task|to my schedule)|planned? out|my (tasks|schedule|pay|messages|notes)|#(schedule|tasks|pay|notes|messages))\b/i.test(text))return {kind:'request',text};
 return null;
}
