import pool from '../config/database.js';
import AgencyBusinessType from './AgencyBusinessType.model.js';

const SCOPE_LEVELS = new Set([
  'platform',
  'payer',
  'rate_category',
  'affiliation',
  'tenant',
  'business_type',
  'service',
  'package',
  'appointment'
]);

const LATE_ACTIONS = new Set(['release', 'forfeit', 'review']);

function mapRow(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: r.agency_id==null?null:Number(r.agency_id),
    name: String(r.name || ''),
    description: r.description || null,
    createdAt: r.created_at || null,
    noShowSuggestedWaitMinutes:Number(r.no_show_suggested_wait_minutes??15),noShowUndoAfterEndMinutes:Number(r.no_show_undo_after_end_minutes??10),
    scopeLevel: String(r.scope_level || 'tenant'),
    payerType:r.payer_type||null,serviceCode:r.service_code||null,providerCategory:r.provider_category==null?null:Number(r.provider_category),providerLevel:r.provider_level==null?null:Number(r.provider_level),customerTierId:r.customer_tier_id||null,modality:r.modality||null,supersedesPolicyId:r.supersedes_policy_id||null,
    businessType: r.business_type || null,
    tenantServiceId: r.tenant_service_id == null ? null : Number(r.tenant_service_id),
    bookingPackageId: r.booking_package_id == null ? null : Number(r.booking_package_id),
    noticeHours: Number(r.notice_hours ?? 24),
    lateFeeCents: Number(r.late_fee_cents || 0),
    noShowFeeCents: r.no_show_fee_cents == null ? null : Number(r.no_show_fee_cents),
    latePackageAction: String(r.late_package_action || 'forfeit'),
    complimentaryCancelsPerPeriod: Number(r.complimentary_cancels_per_period || 0),
    periodDays: Number(r.period_days || 90),
    allowClientCancel: Number(r.allow_client_cancel) === 1,
    requireReason: Number(r.require_reason) === 1,
    isActive: Number(r.is_active) === 1,
    sortOrder: Number(r.sort_order || 0)
  };
}

class BookingCancellationPolicy {
  static mapRow = mapRow;

  static async listForAgency(agencyId, { includeInactive = false, includePlatform = false } = {}) {
    const aid = Number(agencyId || 0);
    if (agencyId!==null&&!aid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM booking_cancellation_policies
       WHERE ${agencyId===null?'agency_id IS NULL':includePlatform?'(agency_id = ? OR agency_id IS NULL)':'agency_id = ?'}
         ${includeInactive ? '' : 'AND is_active = 1'}
       ORDER BY
         FIELD(scope_level, 'appointment', 'package', 'rate_category', 'service', 'payer', 'business_type', 'tenant', 'affiliation', 'platform'),
         sort_order ASC, id ASC`,
      agencyId===null?[]:[aid]
    );
    return (rows || []).map(mapRow);
  }

  static async findById(id, agencyId = null, db = pool) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const params = [pid];
    let sql = `SELECT * FROM booking_cancellation_policies WHERE id = ?`;
    if (agencyId) {
      sql += ` AND agency_id = ?`;
      params.push(Number(agencyId));
    }
    sql += ` LIMIT 1`;
    const [rows] = await db.execute(sql, params);
    return mapRow(rows?.[0]);
  }

  static normalizePayload(body = {}, agencyId) {
    const lateFee=body.lateFeeCents??body.late_fee_cents;
    if(lateFee!=null&&(!Number.isSafeInteger(Number(lateFee))||Number(lateFee)<0))throw Object.assign(new Error('Late-cancellation fee must be a nonnegative number of cents'),{status:400});
    const noShowFee = body.noShowFeeCents ?? body.no_show_fee_cents;
    if (noShowFee != null && (!Number.isSafeInteger(Number(noShowFee)) || Number(noShowFee) < 0)) throw Object.assign(new Error('No-show fee must be a nonnegative number of cents'), { status: 400 });
    const name = String(body.name || '').trim();
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    for(const [key,alias,max,integer] of [['noticeHours','notice_hours',8760,false],['complimentaryCancelsPerPeriod','complimentary_cancels_per_period',10000,true],['periodDays','period_days',36500,true]]){
      const value=body[key]??body[alias];
      if(value!=null&&(!Number.isFinite(Number(value))||Number(value)<(key==='periodDays'?1:0)||Number(value)>max||(integer&&!Number.isInteger(Number(value)))))throw Object.assign(new Error('Enter valid cancellation timing and allowance values.'),{status:400});
    }
    const scopeLevel = String(body.scopeLevel || body.scope_level || 'tenant').toLowerCase();
    if (!SCOPE_LEVELS.has(scopeLevel)) {
      throw Object.assign(new Error('Invalid scopeLevel'), { status: 400 });
    }
    const latePackageAction = String(body.latePackageAction || body.late_package_action || 'forfeit').toLowerCase();
    if (!LATE_ACTIONS.has(latePackageAction)) {
      throw Object.assign(new Error('Invalid latePackageAction'), { status: 400 });
    }
    const businessType = body.businessType || body.business_type
      ? AgencyBusinessType.normalizeType(body.businessType || body.business_type)
      : null;
    if((body.businessType||body.business_type)&&!businessType)throw Object.assign(new Error('Choose a supported service type.'),{status:400});
    const payerType=body.payerType||null,serviceCode=body.serviceCode?String(body.serviceCode).trim().toUpperCase():null;
    if(payerType&&!['self_pay','insurance','medicaid','medicare','commercial','other'].includes(payerType))throw Object.assign(new Error('Choose a supported payer / funding type.'),{status:400});
    if(serviceCode&&!/^[A-Z0-9_.-]{1,32}$/.test(serviceCode))throw Object.assign(new Error('Choose a valid service code.'),{status:400});
    const placement=(value,max)=>{if(value==null||value==='')return null;const n=Number(value);if(!Number.isInteger(n)||n<1||n>max)throw Object.assign(new Error('Choose a valid category or level.'),{status:400});return n;};
    const providerCategory=placement(body.providerCategory,4),providerLevel=placement(body.providerLevel,5),customerTierId=body.customerTierId||null;
    if(customerTierId&&!/^L[1-5]$/.test(customerTierId))throw Object.assign(new Error('Choose a tutoring customer tier from L1 to L5.'),{status:400});
    const modality=body.modality||null;
    if(modality&&!['TELEHEALTH','IN_PERSON'].includes(modality))throw Object.assign(new Error('Choose Virtual or In person.'),{status:400});
    if(scopeLevel==='payer'&&!payerType)throw Object.assign(new Error('Choose the payer / funding type for this policy.'),{status:400});
    if(scopeLevel==='service'&&!Number(body.tenantServiceId??body.tenant_service_id))throw Object.assign(new Error('Choose the specific service for this policy.'),{status:400});
    if(scopeLevel==='package'&&!Number(body.bookingPackageId??body.booking_package_id))throw Object.assign(new Error('Choose the package for this policy.'),{status:400});
    if(scopeLevel==='rate_category'&&!providerCategory&&!customerTierId)throw Object.assign(new Error('Choose the category or customer tier for this policy.'),{status:400});
    const suggested=body.noShowSuggestedWaitMinutes??15,undo=body.noShowUndoAfterEndMinutes??10;
    if(!Number.isInteger(Number(suggested))||Number(suggested)<0||Number(suggested)>120||!Number.isInteger(Number(undo))||Number(undo)<0||Number(undo)>1440)throw Object.assign(new Error('Use a suggested wait of 0–120 minutes and an undo / notice delay of 0–1440 minutes.'),{status:400});
    return {
      noShowSuggestedWaitMinutes:Number(suggested),noShowUndoAfterEndMinutes:Number(undo),
      agencyId: agencyId===null?null:Number(agencyId),payerType,serviceCode,providerCategory,providerLevel,customerTierId,modality,
      name: name.slice(0, 200),
      description: body.description != null ? String(body.description).slice(0, 8000) : null,
      scopeLevel,
      businessType,
      tenantServiceId: body.tenantServiceId != null || body.tenant_service_id != null
        ? Number(body.tenantServiceId ?? body.tenant_service_id) || null
        : null,
      bookingPackageId: body.bookingPackageId != null || body.booking_package_id != null
        ? Number(body.bookingPackageId ?? body.booking_package_id) || null
        : null,
      noticeHours: Math.max(0, Number(body.noticeHours ?? body.notice_hours ?? 24) || 0),
      noShowFeeCents: noShowFee == null ? null : Number(noShowFee),
      lateFeeCents: Math.max(0, Number(body.lateFeeCents ?? body.late_fee_cents ?? 0) || 0),
      latePackageAction,
      complimentaryCancelsPerPeriod: Math.max(0, Number(body.complimentaryCancelsPerPeriod ?? body.complimentary_cancels_per_period ?? 0) || 0),
      periodDays: Math.max(1, Number(body.periodDays ?? body.period_days ?? 90) || 90),
      allowClientCancel: body.allowClientCancel !== false && body.allow_client_cancel !== 0,
      requireReason: body.requireReason !== false && body.require_reason !== 0,
      isActive: body.isActive !== false && body.is_active !== 0,
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0) || 0
    };
  }

  static async create(agencyId, body = {}, createdByUserId = null, db = pool) {
    const p = this.normalizePayload(body, agencyId);
    const [result] = await db.execute(
      `INSERT INTO booking_cancellation_policies
        (agency_id, name, description, scope_level, business_type, tenant_service_id, booking_package_id,
         notice_hours, late_fee_cents, no_show_fee_cents, late_package_action, complimentary_cancels_per_period, period_days,
         allow_client_cancel, require_reason, is_active, sort_order, created_by_user_id,payer_type,service_code,provider_category,provider_level,customer_tier_id,modality,no_show_suggested_wait_minutes,no_show_undo_after_end_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.agencyId, p.name, p.description, p.scopeLevel, p.businessType, p.tenantServiceId, p.bookingPackageId,
        p.noticeHours, p.lateFeeCents, p.noShowFeeCents, p.latePackageAction, p.complimentaryCancelsPerPeriod, p.periodDays,
        p.allowClientCancel ? 1 : 0, p.requireReason ? 1 : 0,p.isActive?1:0,p.sortOrder,createdByUserId||null,p.payerType,p.serviceCode,p.providerCategory,p.providerLevel,p.customerTierId,p.modality,p.noShowSuggestedWaitMinutes,p.noShowUndoAfterEndMinutes
      ]
    );
    return this.findById(result.insertId, agencyId, db);
  }

  static async update(id, agencyId, body = {}, actorUserId = null) {
    const db=await pool.getConnection();
    try {
      await db.beginTransaction();
      const [rows]=await db.execute('SELECT * FROM booking_cancellation_policies WHERE id=? FOR UPDATE',[Number(id)]);
      const existing=mapRow(rows[0]);
      if(!existing||existing.agencyId!==agencyId){await db.rollback();return null;}
      if(!existing.isActive)throw Object.assign(new Error('This is a previous or inactive policy. Edit the current active version, or add a new policy.'),{status:409});
      // Published terms are versioned. Appointments retain their original row.
      const next=await this.create(agencyId,{...existing,...body},actorUserId,db);
      await db.execute('UPDATE booking_cancellation_policies SET supersedes_policy_id=? WHERE id=?',[existing.id,next.id]);
      await db.execute('UPDATE booking_cancellation_policies SET is_active=0 WHERE id=?',[existing.id]);
      await db.commit();return {...next,supersedesPolicyId:existing.id};
    } catch(error){await db.rollback();throw error;}finally{db.release();}
  }

  static async recordWaiver({
    agencyId,
    appointmentId,
    policyId = null,
    waivedFeeCents = 0,
    packageActionOverridden = null,
    reason,
    waivedByUserId
  } = {}) {
    const reasonText = String(reason || '').trim();
    if (!reasonText) throw Object.assign(new Error('Waiver reason is required'), { status: 400 });
    const [result] = await pool.execute(
      `INSERT INTO booking_cancellation_waivers
        (agency_id, appointment_id, policy_id, waived_fee_cents, package_action_overridden, reason, waived_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        Number(appointmentId),
        policyId || null,
        Math.max(0, Number(waivedFeeCents) || 0),
        packageActionOverridden || null,
        reasonText.slice(0, 500),
        Number(waivedByUserId)
      ]
    );
    return { id: Number(result.insertId) };
  }

  static async countComplimentaryUsed({ agencyId, clientId, periodDays = 90 } = {}) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return 0;
    const days = Math.max(1, Number(periodDays) || 90);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM appointments a
       JOIN appointment_participants p ON p.appointment_id = a.id AND p.client_id = ?
       WHERE a.agency_id = ?
         AND a.status LIKE 'canceled%'
         AND a.canceled_at >= (NOW() - INTERVAL ? DAY)
         AND JSON_EXTRACT(a.cancellation_recommendation_json, '$.usedComplimentary') = true`,
      [cid, aid, days]
    );
    return Number(rows?.[0]?.c || 0);
  }
}

export default BookingCancellationPolicy;
