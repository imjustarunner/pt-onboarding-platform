import {parseUtcDate} from '../../utils/officeEventDateTime.util.js';
export function receiptTimestamp(value,timeZone='America/Denver') {
  const date=parseUtcDate(value);
  return date?date.toLocaleString('en-US',{timeZone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'Not recorded';
}
