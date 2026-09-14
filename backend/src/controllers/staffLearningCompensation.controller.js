import pool from '../config/database.js';
import User from '../models/User.model.js';
import {LEARNING_TIERS,learningStaffPay} from '../services/learningCatalog.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v||{};
async function access(req){
 const aid=Number(req.params.agencyId),uid=Number(req.params.providerId);
 if(!['admin','super_admin'].includes(req.user?.role))throw Object.assign(new Error('Administrator access required'),{status:403});
 if(!Number.isSafeInteger(aid)||aid<1||!Number.isSafeInteger(uid)||uid<1)throw Object.assign(new Error('Invalid agency or staff member'),{status:400});
 if(req.user.role!=='super_admin'&&!(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===aid))throw Object.assign(new Error('Agency access denied'),{status:403});
 if(!(await User.getAgencies(uid)).some(a=>Number(a.id)===aid))throw Object.assign(new Error('Staff member is not in this agency'),{status:403});
 return {aid,uid};
}
export async function readStaffLearningCompensation(req,res,next){try{
 const {aid,uid}=await access(req);
 const [[catalogs],[profiles],[clinical],[pay]]=await Promise.all([
  pool.execute('SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=?',[aid]),
  pool.execute('SELECT learning_settings_json FROM provider_tutoring_profiles WHERE agency_id=? AND user_id=?',[aid,uid]),
  pool.execute('SELECT category,level,bypass FROM payroll_user_compensation_levels WHERE agency_id=? AND user_id=?',[aid,uid]),
  pool.execute("SELECT service_code,rate_amount,rate_unit,effective_start FROM payroll_rates WHERE agency_id=? AND user_id=? AND service_code IN ('TUTORING VIRTUAL','TUTORING IN PERSON') ORDER BY effective_start DESC",[aid,uid])]);
 res.setHeader('Cache-Control','no-store');res.json({tiers:parse(catalogs[0]?.catalog_json).tiers||[],tierId:parse(profiles[0]?.learning_settings_json).tierId||'',counseling:clinical[0]||null,payRates:pay});
}catch(e){next(e);}}
export async function saveStaffLearningCompensation(req,res,next){try{
 const {aid,uid}=await access(req),tierId=req.body?.tierId,effectiveStart=String(req.body?.effectiveStart||'');
 if(!LEARNING_TIERS.includes(tierId)||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart)||!Number.isFinite(Date.parse(effectiveStart+'T00:00:00Z'))||new Date(effectiveStart+'T00:00:00Z').toISOString().slice(0,10)!==effectiveStart)throw Object.assign(new Error('Choose a learning level and valid pay effective date'),{status:400});
 const conn=await pool.getConnection();try{await conn.beginTransaction();
 const [catalogs]=await conn.execute('SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=? FOR SHARE',[aid]);const catalog=parse(catalogs[0]?.catalog_json);
 const virtual=learningStaffPay(catalog,{tierId},'virtual'),inPerson=learningStaffPay(catalog,{tierId},'in-person');
 if(virtual==null||inPerson==null)throw Object.assign(new Error('Configure virtual and in-person pay for this learning tier first'),{status:400});
 await conn.execute(`INSERT INTO provider_tutoring_profiles (agency_id,user_id,subject_areas_json,grade_levels_json,accepting_new_students,learning_settings_json) VALUES (?,?,JSON_ARRAY(),JSON_ARRAY(),0,JSON_OBJECT('tierId',?,'programs',JSON_ARRAY())) ON DUPLICATE KEY UPDATE learning_settings_json=JSON_SET(COALESCE(learning_settings_json,JSON_OBJECT()),'$.tierId',?)`,[aid,uid,tierId,tierId]);
 for(const [code,amount] of [['TUTORING VIRTUAL',virtual],['TUTORING IN PERSON',inPerson]])await conn.execute(`INSERT INTO payroll_rates (agency_id,user_id,service_code,rate_amount,rate_unit,effective_start) VALUES (?,?,?,?,'per_hour',?) ON DUPLICATE KEY UPDATE rate_amount=VALUES(rate_amount),rate_unit='per_hour'`,[aid,uid,code,amount/100,effectiveStart]);
 await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
 return readStaffLearningCompensation(req,res,next);
}catch(e){next(e);}}
