import pool from '../config/database.js';
import OfficeSlotQuestionnaireRule from '../models/OfficeSlotQuestionnaireRule.model.js';
import OfficeQuestionnaireModule from '../models/OfficeQuestionnaireModule.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import { officeFeedbackForms } from './officeFeedbackForms.js';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const supported = new Set(['text','textarea','email','phone','number','date','select','multi_select','boolean']);
export function normalizeCheckinField(f, required = false) {
  const type = f.field_type || f.type || 'text';
  if (!supported.has(type)) return null;
  const options = parse(f.options) || [];
  return {id:String(f.id || f.field_key),label:f.field_label || f.label || f.field_key,type,required:required || !!f.is_required || !!f.required,
    options:Array.isArray(options) ? options.map(o=>typeof o === 'object' ? {value:String(o.value ?? o.label),label:String(o.label ?? o.value)} : {value:String(o),label:String(o)}) : []};
}
export async function formsForCheckin(event, agencyId, respondentType, serviceType='counseling') {
  if(serviceType==='tutoring')return {forms:officeFeedbackForms(respondentType,serviceType),unavailable:false};
  let rules = await OfficeSlotQuestionnaireRule.findForEvent({officeLocationId:event.office_location_id,roomId:event.room_id,startAt:event.start_at,bookedProviderId:event.booked_provider_id,timezone:event.timezone || 'America/Denver'});
  if (!rules.length) rules = (await OfficeQuestionnaireModule.listForOffice({officeLocationId:event.office_location_id})).filter(r=>!r.agency_id || Number(r.agency_id)===agencyId);
  rules = rules.filter(r=>(r.respondent_type || 'adult_self')===respondentType);
  const forms = [], seen = new Set(); let unavailable = false;
  for (const rule of rules) {
    const key = rule.intake_link_id ? `intake:${rule.intake_link_id}` : `module:${rule.module_id}`;
    if (seen.has(key)) continue; seen.add(key);
    let fields = [], title = '', respondentType = rule.respondent_type || 'adult_self';
    if (rule.intake_link_id) {
      const link = await IntakeLink.findById(rule.intake_link_id);
      if (!link?.is_active || Number(link.agency_id)!==agencyId) continue;
      title = link.title;

      fields = (Array.isArray(link.intake_fields) ? link.intake_fields : []).filter(f=>(f.scope || 'client')==='client').map(f=>normalizeCheckinField(f));
    } else {
      const [[module]] = await pool.execute('SELECT title,agency_id FROM modules WHERE id = ?',[rule.module_id]);
      if (!module || (module.agency_id && Number(module.agency_id)!==agencyId)) continue;
      title = module.title;
      const pages = (await ModuleContent.findByModuleId(rule.module_id)).filter(c=>c.content_type==='form').map(c=>parse(c.content_data) || {});

      const ids = [...new Set(pages.flatMap(p=>p.fieldDefinitionIds || []).map(Number).filter(Number.isSafeInteger))];
      if (ids.length) {
        const [rows] = await pool.execute(`SELECT * FROM user_info_field_definitions WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
        fields = ids.map(id=> {const row=rows.find(r=>Number(r.id)===id); return row ? normalizeCheckinField(row,pages.some(p=>p.requireAll && (p.fieldDefinitionIds || []).map(Number).includes(id))) : null;});
      }
    }
    if (!fields.length || fields.some(f=>!f)) { unavailable = true; continue; }
    forms.push({id:key,respondentType,title:title || 'Visit questionnaire',fields});
  }
  return {forms:forms.length?forms:officeFeedbackForms(respondentType,serviceType),unavailable};
}
export function validateCheckinAnswers(forms, input) {
  const fail = () => { throw Object.assign(new Error('Please complete the requested fields using the available choices.'),{status:400}); };
  if (!input || typeof input!=='object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input))>65536) fail();
  if (Object.keys(input).some(k=>!forms.some(f=>f.id===k))) fail();
  const output = Object.create(null);
  for (const form of forms) {
    const answers = input[form.id] || {};
    if (typeof answers!=='object' || Array.isArray(answers) || Object.keys(answers).some(k=>!form.fields.some(f=>f.id===k))) fail();
    output[form.id] = Object.create(null);
    for (const field of form.fields) {
      const value = answers[field.id];
      if (value==null || value==='' || (Array.isArray(value)&&!value.length)) { if(field.required) fail(); continue; }
      if (field.type==='boolean') { if(typeof value!=='boolean') fail(); }
      else if(field.type==='multi_select') {if(!Array.isArray(value) || value.some(v=>!field.options.some(o=>o.value===v))) fail();}
      else if (field.type==='number') {if(typeof value!=='number' || !Number.isFinite(value)) fail();}
      else { if(typeof value!=='string' || value.length>8000) fail(); if(field.type==='select' && !field.options.some(o=>o.value===value)) fail(); }
      output[form.id][field.id]=value;
    }
  }
  return output;
}
