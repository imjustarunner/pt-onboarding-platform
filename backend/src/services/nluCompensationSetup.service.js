import {NLU_COMPENSATION_POLICY_VERSION,NLU_COMPENSATION_CATEGORIES,NLU_PAY_LEVELS,NLU_FOUNDATIONAL_RATES,NLU_BACHELOR_CHILDCARE_RATES,NLU_BACHELOR_TUTORING_VIRTUAL_RATES,NLU_BACHELOR_TUTORING_IN_PERSON_RATES} from '../content/nluCompensationPolicy.js';

const parse=value=>typeof value==='string'?JSON.parse(value):(value||{});
const tables=['payroll_pay_system_rates','payroll_compensation_levels','payroll_compensation_category_labels','payroll_compensation_level_rates','payroll_user_compensation_levels','payroll_user_compensation_level_pending'];

/** Caller supplies a dedicated connection. Dry run is the default; never enables payroll. */
export async function configureNluCompensation(db,{dryRun=true,effectiveOn='2026-11-21',beforeApply}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn))throw new Error('A prospective NLU effective date is required.');
  await db.beginTransaction();
  try {
    const [[agency]]=await db.query("SELECT id,slug,feature_flags,new_pay_system_enabled FROM agencies WHERE slug='nlu' LIMIT 1 FOR UPDATE");
    if(!agency)throw new Error('NLU agency not found.');
    const flags=parse(agency.feature_flags);
    if(flags.nluCompensationPolicyVersion===NLU_COMPENSATION_POLICY_VERSION){await db.rollback();return {alreadyConfigured:true,agencyId:agency.id,version:NLU_COMPENSATION_POLICY_VERSION};}
    const backup={agency};
    for(const table of tables){const [rows]=await db.query(`SELECT * FROM ${table} WHERE agency_id=?`,[agency.id]);backup[table]=rows;}
    const [additionHistory]=await db.query('SELECT * FROM payroll_conditional_addition_policies WHERE agency_id=?',[agency.id]);
    backup.payroll_conditional_addition_policies=additionHistory;
    if(backup.payroll_pay_system_rates.some(r=>Number(r.category)===4))throw new Error('NLU already has Category 4 rows without the new policy marker. Review those rows before renumbering.');
    const configuration={
      version:NLU_COMPENSATION_POLICY_VERSION,effectiveOn,
      categories:NLU_COMPENSATION_CATEGORIES,levels:NLU_PAY_LEVELS,
      childcare:{category1:NLU_FOUNDATIONAL_RATES,category2AndAbove:NLU_BACHELOR_CHILDCARE_RATES,additionalChildAmounts:[0,4,6,8],sharedCaregiverRatio:'ceil(actualChildren/activeAssignedCaregivers)',maxChildrenPerCaregiver:4,indirectMinutesPerHour:0},
      tutoring:{category1:NLU_FOUNDATIONAL_RATES,category2Virtual:NLU_BACHELOR_TUTORING_VIRTUAL_RATES,category2InPerson:NLU_BACHELOR_TUTORING_IN_PERSON_RATES,category3And4:'separate approved tutoring placement',indirectMinutesPerHour:10},
      testing:{eligibleCategories:[2,3,4],administrationAndScoring:'actualMinutes / 60 * applicable Direct Care hourly rate',evaluation:'actualMinutes / 60 * separately approved testing evaluation hourly rate',evaluationIndirectMinutesPerHour:0,administrationIndirectMinutesPerHour:10,authorization:'separately documented instruments, personnel, scope, supervision and payer review'},
      preservesIndividualAgreements:true,requiresProspectiveIndividualAdoption:true
    };
    const result={dryRun,agencyId:agency.id,version:NLU_COMPENSATION_POLICY_VERSION,effectiveOn,renumbering:{1:2,2:3,3:4},assignmentCount:backup.payroll_user_compensation_levels.length,payrollEnabledBefore:agency.new_pay_system_enabled,configuration,backup};
    if(dryRun){await db.rollback();return result;}
    if(beforeApply)await beforeApply(result);
    // Descending updates avoid collisions in the (agency,category,level) unique keys.
    for(const table of tables)await db.query(`UPDATE ${table} SET category=category+1 WHERE agency_id=? AND category IN (1,2,3) ORDER BY category DESC`,[agency.id]);
    for(const {level,label} of NLU_PAY_LEVELS){
      await db.query(`INSERT INTO payroll_pay_system_rates (agency_id,category,level,credit_rate,credit_rate_probation,hcode_rate,hcode_rate_probation,tutoring_rate,h2014_rate,indirect_rate,support_activity_rate,auto_indirect_minutes_per_hour,tier_bonus_json,spanish_bonus_json,location_bonus_json)
        VALUES (?,1,?,NULL,NULL,NULL,NULL,?,NULL,18,18,10,JSON_OBJECT('1',0,'2',0,'3',0),JSON_OBJECT('1',0,'2',0,'3',0),JSON_OBJECT('1',0,'2',0,'3',0))`,[agency.id,level,NLU_FOUNDATIONAL_RATES[level-1]]);
      await db.query(`INSERT INTO payroll_compensation_levels (agency_id,category,level,label,direct_rate,indirect_rate,ffs_rate,has_ffs) VALUES (?,1,?,?,NULL,18,NULL,0)`,[agency.id,level,label]);
    }
    for(const [id,category] of Object.entries(NLU_COMPENSATION_CATEGORIES))await db.query('INSERT INTO payroll_compensation_category_labels (agency_id,category,name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)',[agency.id,Number(id),category.label]);
    for(const category of [2,3,4])for(const {level,label} of NLU_PAY_LEVELS){
      const original=backup.payroll_pay_system_rates.find(row=>Number(row.category)===category-1&&Number(row.level)===level);
      if(!original)throw new Error(`NLU's original Category ${category-1} / Level ${level} rate is missing; review before configuring categories.`);
      await db.query(`INSERT INTO payroll_compensation_levels (agency_id,category,level,label,direct_rate,indirect_rate,ffs_rate,has_ffs) VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE label=COALESCE(label,VALUES(label))`,[agency.id,category,level,label,original.hcode_rate,original.indirect_rate,original.credit_rate]);
    }
    // Dated additions retain all historical category meanings. Add prospective
    // policy rows rather than relabeling prior-period policies or signed terms.
    for(const category of [1,2,3,4])for(const {level} of NLU_PAY_LEVELS){
      const prior=backup.payroll_pay_system_rates.find(row=>Number(row.category)===category-1&&Number(row.level)===level);
      const bonuses=parse(prior?.tier_bonus_json),ffs=parse(prior?.tier_bonus_ffs_json),hcode=parse(prior?.tier_bonus_hcode_json);
      await db.query('INSERT INTO payroll_conditional_addition_policies (agency_id,category,level,effective_on,clinical_addition,hcode_addition) VALUES (?,?,?,?,?,?)',[agency.id,category,level,effectiveOn,category===1?0:Number(ffs[3]??bonuses[3]??0),category===2?Number(hcode[3]??bonuses[3]??0):0]);
    }
    // Retain NLU's individual tutoring overrides and signed schedule snapshots.
    // Stored generic tutoring rows are deliberately cleared above Category 1:
    // the new format/placement-specific schedule must be adopted individually.
    await db.query('UPDATE payroll_pay_system_rates SET tutoring_rate=NULL WHERE agency_id=? AND category IN (2,3,4)',[agency.id]);
    await db.query(`UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.nluCompensationPolicyVersion',?,'$.nluCompensationEffectiveOn',?,'$.nluServiceCompensation',CAST(? AS JSON)) WHERE id=?`,[NLU_COMPENSATION_POLICY_VERSION,effectiveOn,JSON.stringify(configuration),agency.id]);
    const [[after]]=await db.query('SELECT new_pay_system_enabled FROM agencies WHERE id=?',[agency.id]);
    if(Number(after.new_pay_system_enabled)!==Number(agency.new_pay_system_enabled))throw new Error('Payroll activation changed unexpectedly; rolling back.');
    await db.commit();
    return result;
  } catch(error){await db.rollback();throw error;}
}
