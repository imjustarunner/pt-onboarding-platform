import {mobileScheduleHandoffFields} from '../mobile/mobileCalendar.js';
export const MOBILE_SCHEDULE_QUERY_KEYS=['scheduleAction','scheduleDate','scheduleStart','scheduleEnd','scheduleTimeZone','scheduleAgencyId'];
export function readMobileScheduleSelection(query){
 const fields=mobileScheduleHandoffFields(query);if(!fields.scheduleAction)return null;
 const agencyId=Number(query.scheduleAgencyId);
 if(!Number.isSafeInteger(agencyId)||agencyId<=0||!/^\d+$/.test(String(query.scheduleAgencyId)))return null;
 const minute=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
 return {action:fields.scheduleAction,agencyId,date:fields.scheduleDate,start:minute(fields.scheduleStart),end:minute(fields.scheduleEnd),timeZone:fields.scheduleTimeZone};
}
/** The canonical chooser remains the authority; never select a hidden or disabled action. */
export function availableMobileScheduleAction(actions,selection){return selection?actions.find(action=>action.id===selection.action&&action.visible!==false&&!action.disabledReason)||null:null;}
