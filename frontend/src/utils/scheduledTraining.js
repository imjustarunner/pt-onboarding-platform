export const canScheduleTraining = user => ['admin','super_admin','superadmin','clinical_practice_assistant','provider_plus'].includes(String(user?.role || '').toLowerCase());
export function trainingWallInstant(date,time,timeZone) {
  const text=`${date}T${time}:00`, wall=Date.parse(`${text}Z`);
  if(!Number.isFinite(wall))throw Error('Choose a date, start time, and end time for every training day.');
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const wallAt=instant=>{const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;};
  let instant=wall;for(let i=0;i<3;i++)instant+=wall-Date.parse(`${wallAt(instant)}Z`);
  if(wallAt(instant)!==text)throw Error('This time does not exist because of daylight saving time. Choose another time.');
  return new Date(instant).toISOString();
}
