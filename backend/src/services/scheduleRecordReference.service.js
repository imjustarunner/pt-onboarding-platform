import { randomBytes } from 'node:crypto';
import pool from '../config/database.js';
const prefixes={appointment:'S',office_booking:'O',schedule_event:'M',supervision:'U',virtual_hours:'V',virtual_slot:'V',in_person_slot:'I',school_session:'K'};
export function createScheduleRecordReferences({db=pool,random=()=>randomBytes(10).toString('hex').toUpperCase()}={}) {
  async function ensure(records) {
    const unique=[...new Map(records.filter(r=>prefixes[r.type]&&Number.isSafeInteger(Number(r.id))&&Number(r.id)>0).map(r=>[`${r.type}:${r.id}`,{type:r.type,id:Number(r.id)}])).values()];
    const references=new Map();
    if(!unique.length)return references;
    const where=unique.map(()=>'(record_type=? AND record_id=?)').join(' OR '),params=unique.flatMap(r=>[r.type,r.id]);
    const read=async()=>{const [rows]=await db.execute(`SELECT record_type,record_id,reference FROM schedule_record_references WHERE ${where}`,params);for(const row of rows)references.set(`${row.record_type}:${row.record_id}`,row.reference);};
    try {
      await read();
      for(let attempt=0;attempt<2;attempt++) {
        const missing=unique.filter(r=>!references.has(`${r.type}:${r.id}`));if(!missing.length)break;
        await db.execute(`INSERT IGNORE INTO schedule_record_references(record_type,record_id,reference) VALUES ${missing.map(()=>'(?,?,?)').join(',')}`,missing.flatMap(r=>[r.type,r.id,`${prefixes[r.type]}${random()}`]));
        await read();
      }
    } catch(error) { if(error.code!=='ER_NO_SUCH_TABLE')throw error; }
    return references;
  }
  async function enrich(summary) {
    const groups=[['officeEvents','office_booking'],['scheduleEvents','schedule_event'],['supervisionSessions','supervision'],['virtualWorkingHours','virtual_hours'],['virtualAvailability','virtual_slot'],['inPersonAvailability','in_person_slot'],['schoolSoftSessions','school_session']];
    const records=groups.flatMap(([key,type])=>(summary[key]||[]).flatMap(row=>[{type,id:row.id},...(Number(row.appointmentId)>0?[{type:'appointment',id:row.appointmentId}]:[])]));
    const refs=await ensure(records);
    for(const [key,type]of groups)summary[key]=(summary[key]||[]).map(row=>({...row,scheduleReference:refs.get(`${type}:${row.id}`)||null,
      appointmentReference:refs.get(`appointment:${row.appointmentId}`)||null}));
    return summary;
  }
  return {ensure,enrich};
}
export default createScheduleRecordReferences();
