import pool from '../config/database.js';
import { schoolSoftScheduleCalendar } from './schoolSoftScheduleCalendar.service.js';
import { isValidTimeZone, wallMysqlToUtcMysql, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { previewError } from './auricwellPreviewPolicy.js';
import { letterMatchSql } from '../utils/letterMatch.js';

const PRACTICE_ROLES = new Set(['super_admin','superadmin','admin','support','clinical_practice_assistant']);
function practiceFilter(value){if(value==null||value===''||value==='all')return null;const id=Number(value);if(!Number.isInteger(id)||id<1)throw previewError(400,'Choose a practice.');return id;}
function statusFilter(value){const status=String(value||'').trim();if(!status||status==='all')return '';if(status.length>80)throw previewError(400,'Choose a status.');return status;}
const marks = ids => ids.map(() => '?').join(',');
const name = r => [r.first_name,r.last_name].filter(Boolean).join(' ');
const iso = value => value == null ? null : value instanceof Date ? value.toISOString() : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(value)) ? value : String(value).replace(' ','T')+'Z').toISOString();
const active = r => !!Number(r.is_active) && !['ARCHIVED','INACTIVE_EMPLOYEE','INACTIVE'].includes(String(r.status).toUpperCase());
const boundedRows = rows => { if (rows.length > 10000) throw previewError(422,'This date range has too many records. Choose a shorter range or one provider.'); return rows; };
export function agendaWindow(input, timeZone, now = new Date()) {
  const start = String(input.start || utcDateToZonedYmd(now,timeZone));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(start))) throw previewError(400,'Choose a valid start date.');
  const endDefault = new Date(`${start}T12:00:00Z`); endDefault.setUTCDate(endDefault.getUTCDate()+7);
  const end = String(input.end || endDefault.toISOString().slice(0,10));
  const valid = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0,10) === s;
  const days = (Date.parse(end)-Date.parse(start))/86400000;
  if (!valid(start) || !valid(end) || days<1 || days>31) throw previewError(400,'Choose a date range of 1–31 days. The end date is exclusive.');
  return {start,end,windowStart:wallMysqlToUtcMysql(`${start} 00:00:00`,timeZone),windowEnd:wallMysqlToUtcMysql(`${end} 00:00:00`,timeZone)};
}
export function filterAgenda(items, input) {
  const search = String(input.search || '').trim().toLowerCase();
  const filtered = items.filter(r => (!search || [r.title,r.providerName,r.clientName,r.location,r.kind,r.status].join(' ').toLowerCase().includes(search)) &&
    (!input.kind || input.kind==='all' || r.kind===input.kind) && (!input.status || input.status==='all' || (input.status==='canceled' ? /cancel/i.test(r.status) : !/cancel/i.test(r.status))));
  const sort = ['date','client','provider','status'].includes(input.sort) ? input.sort : 'date';
  const field = {date:'date',client:'clientName',provider:'providerName',status:'status'}[sort];
  const direction = input.order==='desc' ? -1 : 1;
  filtered.sort((a,b) => direction*(String(a[field] || '').localeCompare(String(b[field] || '')) || String(a.startAt || `${a.date}T99`).localeCompare(String(b.startAt || `${b.date}T99`)) || a.key.localeCompare(b.key)));
  const calendar=['day','week'].includes(input.view);
  if(calendar && filtered.length>10000)throw previewError(400,'Choose one provider or a shorter calendar range.');
  const page = calendar?1:Math.max(1, Math.min(10000, Number.parseInt(input.page,10)||1)), pageSize=calendar?10000:50;
  return {items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize};
}

/** SELECT-only adapter over the stored sources used by My Schedule. Never materializes/syncs. */
export function createAuricwellAgenda({database=pool, school=schoolSoftScheduleCalendar}={}) {
  async function workspace({agencyId,actor}) {
    if (!Number.isInteger(Number(agencyId)) || Number(agencyId)<1 || !Number(actor?.id)) throw previewError(400,'Select a practice first.');
    const [providers] = await database.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.credential,u.is_active,u.status
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=?
      AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor') ORDER BY u.last_name,u.first_name`,[agencyId]);
    const [assignments] = await database.execute(`SELECT DISTINCT sa.supervisee_id FROM supervisor_assignments sa
      JOIN user_agencies ua ON ua.user_id=sa.supervisee_id AND ua.agency_id=sa.agency_id
      WHERE sa.agency_id=? AND sa.supervisor_id=?`,[agencyId,actor.id]);
    const supervisees = new Set(assignments.map(r=>Number(r.supervisee_id)));
    const practice = PRACTICE_ROLES.has(String(actor.role).toLowerCase());
    return {actorId:Number(actor.id),scopes:['mine',...(supervisees.size?['supervisees']:[]),...(practice?['practice']:[])],
      providers:providers.map(p=>({...p,name:name(p),active:active(p),supervisee:supervisees.has(Number(p.id)),canViewSchedule:practice||supervisees.has(Number(p.id))||Number(p.id)===Number(actor.id)}))};
  }
  function select(workspace,input) {
    const scope = String(input.scope || 'mine');
    if (!workspace.scopes.includes(scope)) throw previewError(403,'This schedule scope is not available to your account.');
    let ids=scope==='mine'?[workspace.actorId]:workspace.providers.filter(p=>scope==='practice'||p.supervisee).map(p=>Number(p.id));
    // Include the authenticated actor in practice scope even when their role is administrative.
    if(scope==='practice') ids=[...new Set([...ids,workspace.actorId])];
    if (input.providerId) {
      const id=Number(input.providerId);
      if(!Number.isInteger(id)||!ids.includes(id)) throw previewError(403,'That provider is outside the selected scope.');
      ids=[id];
    }
    return {scope,ids};
  }
  async function agenda({agencyId,actor,input={}}) {
    const ws=await workspace({agencyId,actor}), {scope,ids}=select(ws,input);
    const timeZone=isValidTimeZone(actor.timezone)?actor.timezone:'America/Denver';
    const range=agendaWindow(input,timeZone);
    if(!ids.length) return {...filterAgenda([],input),scope,timeZone,start:range.start,end:range.end};
    const providers=new Map(ws.providers.map(p=>[Number(p.id),p.name])); providers.set(Number(actor.id),name(actor));
    const base=r=>({...r,providerName:providers.get(Number(r.providerId))||`Provider #${r.providerId}`,readOnly:true});
    const [appointments]=await database.execute(`SELECT a.id,a.provider_user_id,a.start_at,a.end_at,a.title,a.service_code,a.status,a.modality,
      a.location_label,a.provider_schedule_event_id,a.office_event_id,c.id AS client_id,c.full_name,c.initials
      FROM appointments a LEFT JOIN appointment_participants ap ON ap.appointment_id=a.id
      LEFT JOIN clients c ON c.id=ap.client_id AND c.agency_id=a.agency_id
      WHERE a.agency_id=? AND a.provider_user_id IN (${marks(ids)}) AND a.start_at<? AND a.end_at>?
      ORDER BY a.start_at,a.id,c.id LIMIT 10001`,[agencyId,...ids,range.windowEnd,range.windowStart]);
    boundedRows(appointments);
    const grouped=new Map(),booked=[];
    for(const a of appointments) {
      const startAt=iso(a.start_at), date=utcDateToZonedYmd(new Date(startAt),timeZone), key=`appointment:${a.id}`;
      if(!grouped.has(key)) grouped.set(key,base({key,id:Number(a.id),providerId:Number(a.provider_user_id),kind:'appointment',title:a.title||a.service_code||'Client appointment',
        startAt,endAt:iso(a.end_at),date,status:a.status,location:a.location_label||a.modality||'',clientName:'',clientIds:[],eventKind:'APPOINTMENT'}));
      if(a.client_id) { const item=grouped.get(key); item.clientIds.push(Number(a.client_id)); item.clientName=[item.clientName,a.full_name||a.initials||`Client #${a.client_id}`].filter(Boolean).join(', ');
        booked.push({providerId:Number(a.provider_user_id),clientId:Number(a.client_id),date}); }
    }
    const items=[...grouped.values()];
    {
      const [events]=await database.execute(`SELECT DISTINCT pse.id,pse.provider_id,pse.kind,pse.title,pse.status,pse.start_at,pse.end_at,pse.all_day,
        DATE_FORMAT(pse.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(pse.end_date,'%Y-%m-%d') AS end_date,pse.agency_id,pse.reason_code,pse.client_id,c.full_name,c.initials,
        (SELECT GROUP_CONCAT(pe.user_id ORDER BY pe.user_id) FROM provider_schedule_event_attendees pe WHERE pe.event_id=pse.id AND pe.user_id IN (${marks(ids)})) AS viewer_ids
        FROM provider_schedule_events pse LEFT JOIN clients c ON c.id=pse.client_id AND c.agency_id=pse.agency_id WHERE (pse.agency_id=? OR (pse.agency_id IS NULL AND pse.provider_id=? AND pse.client_id IS NULL))
        AND (pse.provider_id IN (${marks(ids)}) OR EXISTS (SELECT 1 FROM provider_schedule_event_attendees pe WHERE pe.event_id=pse.id AND pe.user_id IN (${marks(ids)})))
        AND ${input.context==='false' ? "(pse.client_id IS NOT NULL OR UPPER(COALESCE(pse.reason_code,''))='CLIENT_SESSION')" : "1=1"}
        AND COALESCE(pse.recurrence_horizon_held,0)=0
        AND ((pse.all_day=1 AND pse.start_date<? AND pse.end_date>?) OR (pse.all_day=0 AND pse.start_at<? AND pse.end_at>?))
        AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.agency_id=? AND a.provider_schedule_event_id=pse.id)
        ORDER BY pse.id LIMIT 10001`,[...ids,agencyId,actor.id,...ids,...ids,range.end,range.start,range.windowEnd,range.windowStart,agencyId]);
      for(const e of boundedRows(events)) {
        if(e.client_id) booked.push({providerId:Number(e.provider_id),clientId:Number(e.client_id),date:utcDateToZonedYmd(new Date(iso(e.start_at)),timeZone)});
        items.push(base({key:`event:${e.id}`,id:Number(e.id),providerId:ids.includes(Number(e.provider_id))?Number(e.provider_id):Number(String(e.viewer_ids||'').split(',')[0])||ids[0],kind:e.client_id||e.reason_code==='CLIENT_SESSION'?'appointment':'block',title:e.title||e.reason_code||e.kind||'Schedule block',clientName:e.full_name||e.initials||'',location:'',status:e.status||'scheduled',allDay:!!e.all_day,
        date:e.all_day?e.start_date:utcDateToZonedYmd(new Date(iso(e.start_at)),timeZone),startAt:e.all_day?null:iso(e.start_at),endAt:e.all_day?null:iso(e.end_at),eventKind:e.kind||'PERSONAL_EVENT'}));
      }
    }
    if(input.context!=='false') {
      const [office]=await database.execute(`SELECT e.id,COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id) AS provider_id,
        e.start_at,e.end_at,e.status,e.slot_state,l.name AS office_name,r.name AS room_name
        FROM office_events e JOIN office_locations l ON l.id=e.office_location_id
        LEFT JOIN office_rooms r ON r.id=e.room_id LEFT JOIN office_standing_assignments sa ON sa.id=e.standing_assignment_id
        WHERE COALESCE(sa.booking_agency_id,l.agency_id)=? AND COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id) IN (${marks(ids)})
        AND e.start_at<? AND e.end_at>? AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.office_event_id=e.id)
        ORDER BY e.start_at,e.id LIMIT 10001`,[agencyId,...ids,range.windowEnd,range.windowStart]);
      for(const e of boundedRows(office)) items.push(base({key:`office:${e.id}`,id:Number(e.id),providerId:Number(e.provider_id),kind:'block',title:'Office reservation',clientName:'',
        location:[e.office_name,e.room_name].filter(Boolean).join(' · '),status:e.status||e.slot_state||'reserved',
        date:utcDateToZonedYmd(new Date(iso(e.start_at)),timeZone),startAt:iso(e.start_at),endAt:iso(e.end_at),eventKind:'OFFICE_EVENT'}));
      const [sessions]=await database.execute(`SELECT ss.id,ss.supervisor_user_id,ss.supervisee_user_id,ss.co_facilitator_user_id,ss.start_at,ss.end_at,ss.status,ss.session_type,ss.modality,
        (SELECT GROUP_CONCAT(sa.user_id ORDER BY sa.user_id) FROM supervision_session_attendees sa WHERE sa.session_id=ss.id AND sa.user_id IN (${marks(ids)})) AS viewer_ids
        FROM supervision_sessions ss WHERE ss.agency_id=? AND ss.calendar_deleted_at IS NULL AND COALESCE(ss.recurrence_horizon_held,0)=0
        AND ss.start_at<? AND ss.end_at>? AND (ss.supervisor_user_id IN (${marks(ids)}) OR ss.supervisee_user_id IN (${marks(ids)})
        OR ss.co_facilitator_user_id IN (${marks(ids)}) OR EXISTS (SELECT 1 FROM supervision_session_attendees sa WHERE sa.session_id=ss.id AND sa.user_id IN (${marks(ids)})))
        ORDER BY ss.start_at,ss.id LIMIT 10001`,[...ids,agencyId,range.windowEnd,range.windowStart,...ids,...ids,...ids,...ids]);
      for(const s of boundedRows(sessions)) items.push(base({key:`supervision:${s.id}`,id:Number(s.id),providerId:[s.supervisor_user_id,s.supervisee_user_id,s.co_facilitator_user_id,...String(s.viewer_ids||'').split(',')].map(Number).find(id=>ids.includes(id))||ids[0],kind:'supervision',title:`${s.session_type||'Individual'} supervision`,clientName:'',location:s.modality||'',status:s.status||'scheduled',
        date:utcDateToZonedYmd(new Date(iso(s.start_at)),timeZone),startAt:iso(s.start_at),endAt:iso(s.end_at),eventKind:'SUPERVISION'}));
    }
    const soft=await school.listMany({agencyId,providerIds:ids,startDate:range.start,endDate:range.end,timeZone,appointments:booked});
    for(const s of soft) for(const [index,slot] of (s.slots?.length?s.slots:[{}]).entries()) {
      const timed=slot.startAt&&slot.endAt&&Date.parse(slot.endAt)>Date.parse(slot.startAt);
      const deliveries=s.delivery?.deliveries||[];
      const failed=s.delivery?.held||deliveries.some(d=>['failed','skipped','held'].includes(d.status));
      const notice=s.canceled?(failed?'Contact needs attention':deliveries.length&&deliveries.every(d=>d.receiptConfirmedAt)?'Receipt confirmed':deliveries.some(d=>d.status==='sent')?'Email sent · receipt not confirmed':'Notice not confirmed'):'';
      items.push(base({key:`school:${s.key}:${slot.id||index}`,id:s.id||null,providerId:Number(s.providerId),kind:'school',title:'School soft schedule',clientName:s.clientName,clientIds:[s.clientId],location:s.schoolName,
        date:s.date,startAt:timed?slot.startAt:null,endAt:timed?slot.endAt:null,status:s.canceled?'canceled':'planned',notice,reason:s.reason||'',explanation:s.explanation,attention:!!failed,
        eventKind:'school-soft',schoolId:s.schoolId}));
    }
    return {...filterAgenda(items,input),scope,timeZone,start:range.start,end:range.end};
  }
  async function clients({agencyId,actor,input={}}) {
    const role=String(actor.role||'').toLowerCase();
    const query=String(input.search||'').trim(), page=Math.max(1,Math.min(10000,parseInt(input.page,10)||1)),pageSize=50;
    const practiceId=practiceFilter(input.filterAgencyId), status=statusFilter(input.status);
    const base=[], baseParams=[];
    if(['super_admin','superadmin'].includes(role)) base.push('1=1');
    else if(['admin','support'].includes(role)){base.push('c.agency_id IN (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1)');baseParams.push(Number(actor.id));}
    else {const ws=await workspace({agencyId,actor}),{ids}=select(ws,{...input,scope:'mine'});
      if(!ids.length) return {clients:[],total:0,page,pageSize,practices:[],statuses:[],limitedBy:[]};
      base.push(`(c.provider_id IN (${marks(ids)}) OR EXISTS (SELECT 1 FROM client_provider_assignments cpa WHERE cpa.client_id=c.id AND cpa.is_active=1 AND cpa.provider_user_id IN (${marks(ids)})))`);baseParams.push(...ids,...ids);}
    if(query){const match=letterMatchSql(['c.full_name','c.initials','a.name'],query);base.push(match.sql);baseParams.push(...match.params);}
    const extras=[];
    if(practiceId) extras.push({key:'practice',sql:'c.agency_id=?',params:[practiceId]});
    if(status) extras.push({key:'status',sql:`LOWER(COALESCE(cs.label,c.status,''))=?`,params:[status.toLowerCase()]});
    const from=`FROM clients c JOIN agencies a ON a.id=c.agency_id LEFT JOIN icons ai ON ai.id=a.icon_id LEFT JOIN client_statuses cs ON cs.id=c.client_status_id`;
    const where=parts=>`WHERE ${parts.join(' AND ')}`;
    const countOf=async(parts,vals)=>{const [[row]]=await database.execute(`SELECT COUNT(*) AS total ${from} ${where(parts)}`,vals);return Number(row.total);};
    const [practiceRows]=await database.execute(`SELECT DISTINCT a.id,a.name ${from} ${where(base)} ORDER BY a.name`,baseParams);
    const [statusRows]=await database.execute(`SELECT DISTINCT COALESCE(cs.label,NULLIF(c.status,'')) AS status_label ${from} ${where(base)} ORDER BY status_label`,baseParams);
    const facets={practices:practiceRows,statuses:statusRows.map(row=>row.status_label).filter(Boolean)};
    if(!query && !extras.length) return {clients:[],total:0,page,pageSize,limitedBy:[],...facets};
    const filters=[...base,...extras.map(item=>item.sql)], params=[...baseParams,...extras.flatMap(item=>item.params)];
    const total=await countOf(filters,params);
    let limitedBy=[];
    if(!total && extras.length){
      for(const extra of extras){const rest=extras.filter(item=>item!==extra);const count=await countOf([...base,...rest.map(item=>item.sql)],[...baseParams,...rest.flatMap(item=>item.params)]);if(count) limitedBy.push({key:extra.key,count});}
      if(!limitedBy.length){const open=await countOf(base,baseParams);if(open) limitedBy=[{key:'filters',count:open}];}
    }
    const sorts={name:"COALESCE(NULLIF(c.full_name,''),c.initials)",status:"COALESCE(cs.label,c.status)",practice:'a.name'};
    const sort=sorts[input.sort]||sorts.name, direction=input.order==='desc'?'DESC':'ASC';
    const [rows]=await database.execute(`SELECT c.id,c.full_name,c.initials,c.status,c.agency_id,a.name AS agency_name,a.slug AS agency_slug,COALESCE(ai.file_path, NULLIF(a.logo_path,''), NULLIF(a.logo_url,'')) AS agency_icon,cs.label AS status_label ${from} ${where(filters)} ORDER BY ${sort} ${direction},c.id ${direction} LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,params);
    return {clients:rows,total,page,pageSize,limitedBy,...facets};
  }
  return {workspace,agenda,clients};
}
export const auricwellAgenda=createAuricwellAgenda();
