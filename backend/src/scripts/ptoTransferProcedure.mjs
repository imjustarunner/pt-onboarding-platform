import crypto from 'node:crypto';

const identifier = value => {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error('Invalid SQL identifier');
  return `\`${value}\``;
};
const integer = value => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid scoped ID');
  return value;
};
const quote = value => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
export const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Produces a procedure with no caller-selectable IDs, rates, dates or amounts. */
export function transferProcedure({ procedure, databaseUser, actorId, plan, cloudOperator }) {
  identifier(procedure); identifier(databaseUser);
  const { agencyId, employeeId, requestId, sourcePeriodId, targetPeriodId } = plan;
  [agencyId, employeeId, requestId, sourcePeriodId, targetPeriodId, actorId].forEach(integer);
  if (!/^[a-f0-9]{64}$/.test(plan.ratesHash) || !Array.isArray(plan.items) || plan.items.length !== 2 ||
      plan.items.some(i => !/^\d{4}-\d{2}-\d{2}$/.test(i.date) || !(i.hours > 0)) ||
      !(plan.hours > 0) || plan.items.reduce((s, i) => s + i.hours, 0) !== plan.hours ||
      !(plan.rate > 0) || !(plan.sourceHours > plan.hours)) throw new Error('Invalid transfer scope');
  const hash = digest({ plan, actorId, databaseUser, cloudOperator });
  const lock = `pto_transfer_${agencyId}_${requestId}`;
  const action = 'automation_pto_payroll_transfer';
  const note = `Automation ${databaseUser}: ${plan.hours}h at $${plan.rate}/h moved from payroll ${sourcePeriodId} to ${targetPeriodId}; user-authorized; original approval retained.`;
  if (note.length > 255) throw new Error('Ledger audit note too long');
  const fail = message => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=${quote(message)};`;
  const guard = (condition, message) => `IF ${condition} THEN ${fail(message)} END IF;`;
  const row = `agency_id=${agencyId} AND user_id=${employeeId}`;
  const amount = plan.hours * plan.rate;
  const remaining = plan.sourceHours - plan.hours;
  const inserts = plan.items.map(i => `
    INSERT INTO payroll_pto_ledger(agency_id,user_id,entry_type,pto_bucket,hours_delta,effective_date,payroll_period_id,request_id,note,created_by_user_id)
    VALUES(${agencyId},${employeeId},'manual_adjustment','sick',${i.hours},${quote(i.date)},${sourcePeriodId},${requestId},${quote(note)},${actorId}),
          (${agencyId},${employeeId},'usage','sick',-${i.hours},${quote(i.date)},${targetPeriodId},${requestId},${quote(note)},${actorId});`).join('\n');
  const metadata = quote(JSON.stringify({ actor_type: 'automation', automation_identity: databaseUser,
    automation_actor_user_id: actorId, cloud_operator: cloudOperator, authorization: plan.authorization,
    request_id: requestId, employee_id: employeeId, source_period_id: sourcePeriodId, target_period_id: targetPeriodId,
    hours: plan.hours, rate: plan.rate, transferred_pay: amount, manifest_hash: hash,
    source_pto_hours_before: plan.sourceHours, source_pto_hours_after: remaining,
    target_pto_hours_before: 0, target_pto_hours_after: plan.hours,
    preserves_original_approval: true, requires_rerun: true }));
  const sql = `CREATE PROCEDURE ${identifier(procedure)}(IN p_hash CHAR(64), IN p_apply BOOLEAN)
SQL SECURITY DEFINER
main: BEGIN
  DECLARE v_lock INT DEFAULT 0;
  DECLARE v_dummy INT DEFAULT NULL;
  DECLARE v_balance DECIMAL(12,2) DEFAULT NULL;
  DECLARE v_missing INT DEFAULT 0;
  DECLARE v_unused DECIMAL(12,2) DEFAULT NULL;
  DECLARE v_original_approver INT DEFAULT NULL;
  DECLARE v_original_approved_at DATETIME DEFAULT NULL;
  DECLARE v_source_end DATE DEFAULT NULL;
  DECLARE v_target_start DATE DEFAULT NULL;
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_bad INT DEFAULT 0;
  DECLARE v_sum DECIMAL(12,6) DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_missing=1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
    ROLLBACK;
    IF v_lock=1 THEN DO RELEASE_LOCK(${quote(lock)}); END IF;
    RESIGNAL;
  END;
  ${guard(`SUBSTRING_INDEX(USER(),'@',1)<>${quote(databaseUser)} OR p_hash IS NULL OR p_hash<>${quote(hash)} OR p_apply IS NULL`, 'This identity may execute only the approved PTO transfer')}
  SELECT GET_LOCK(${quote(lock)},5) INTO v_lock;
  ${guard('v_lock<>1 OR v_lock IS NULL', 'Another transfer is running')}
  IF EXISTS(SELECT 1 FROM user_activity_log WHERE action_type=${quote(action)} AND agency_id=${agencyId} AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.manifest_hash'))=p_hash) THEN
    DO RELEASE_LOCK(${quote(lock)}); SET v_lock=0;
    SELECT 'already_applied' execution_status,${requestId} request_id; LEAVE main;
  END IF;
  START TRANSACTION;
  SELECT sick_balance_hours INTO v_balance FROM payroll_pto_accounts WHERE ${row} FOR UPDATE;
  ${guard('v_balance IS NULL', 'Leave account is unavailable')}
  SELECT id,approved_by_user_id,approved_at INTO v_dummy,v_original_approver,v_original_approved_at FROM payroll_pto_requests WHERE id=${requestId} AND ${row} FOR UPDATE;
  ${guard(`v_dummy IS NULL OR NOT EXISTS(SELECT 1 FROM payroll_pto_requests WHERE id=${requestId} AND ${row} AND status='approved' AND request_type='sick' AND total_hours=${plan.hours} AND approved_payroll_period_id=${sourcePeriodId} AND SHA2(CAST(approved_rates_json AS CHAR),256)=${quote(plan.ratesHash)})`, 'The approved request or saved rate changed')}
  ${guard(`NOT EXISTS(SELECT 1 FROM users WHERE id=${actorId} AND role='assistant' AND is_assistant_account=1 AND is_active=0 AND is_archived=1 AND status='ARCHIVED' AND password_hash IS NULL) OR EXISTS(SELECT 1 FROM user_agencies WHERE user_id=${actorId})`, 'The automation actor is not isolated')}
  SELECT period_end INTO v_source_end FROM payroll_periods WHERE id=${sourcePeriodId} AND agency_id=${agencyId} FOR UPDATE;
  SELECT period_start INTO v_target_start FROM payroll_periods WHERE id=${targetPeriodId} AND agency_id=${agencyId} FOR UPDATE;
  ${guard(`(SELECT COUNT(*) FROM payroll_periods WHERE id IN(${sourcePeriodId},${targetPeriodId}) AND agency_id=${agencyId} AND status IN('draft','raw_imported','staged','ran') AND posted_at IS NULL AND finalized_at IS NULL AND posted_by_user_id IS NULL AND finalized_by_user_id IS NULL)<>2`, 'A payroll is posted or unavailable')}
  ${guard('v_source_end IS NULL OR v_target_start IS NULL OR v_target_start<>DATE_ADD(v_source_end,INTERVAL 1 DAY)', 'Target is not the next payroll')}
  SELECT sick_pto_hours INTO v_unused FROM payroll_adjustments WHERE payroll_period_id=${sourcePeriodId} AND ${row} FOR UPDATE;
  ${guard(`v_unused IS NULL OR NOT EXISTS(SELECT 1 FROM payroll_adjustments WHERE payroll_period_id=${sourcePeriodId} AND ${row} AND sick_pto_hours=${plan.sourceHours} AND training_pto_hours=0 AND pto_hours=${plan.sourceHours} AND pto_rate=${plan.rate})`, 'Current PTO was edited; reconcile before moving it')}
  SET v_unused=NULL;
  SELECT sick_pto_hours INTO v_unused FROM payroll_adjustments WHERE payroll_period_id=${targetPeriodId} AND ${row} FOR UPDATE;
  ${guard(`v_unused IS NOT NULL OR EXISTS(SELECT 1 FROM payroll_adjustments WHERE payroll_period_id=${targetPeriodId} AND ${row})`, 'Target already has adjustments; review before moving pay')}
  SELECT COUNT(*),SUM(hours_delta),SUM(payroll_period_id<>${sourcePeriodId} OR entry_type<>'usage' OR pto_bucket<>'sick' OR NOT(${plan.items.map(i => `(effective_date=${quote(i.date)} AND hours_delta=-${i.hours})`).join(' OR ')})) INTO v_count,v_sum,v_bad FROM payroll_pto_ledger WHERE request_id=${requestId} AND ${row} FOR UPDATE;
  ${guard(`v_count<>2 OR v_sum<>-${plan.hours} OR v_bad<>0`, 'Original leave usage needs reconciliation')}
  SELECT COUNT(*),SUM(hours),SUM(NOT( ${plan.items.map(i => `(request_date=${quote(i.date)} AND hours=${i.hours})`).join(' OR ')} )) INTO v_count,v_sum,v_bad FROM payroll_pto_request_items WHERE request_id=${requestId};
  ${guard(`v_count<>2 OR v_sum<>${plan.hours} OR v_bad<>0`, 'Request dates or hours changed')}
  ${guard(`(SELECT COALESCE(SUM(total_hours),0) FROM payroll_pto_requests WHERE ${row} AND status='approved' AND request_type='sick' AND approved_payroll_period_id=${sourcePeriodId})<>${plan.sourceHours}`, 'Other approved PTO changed')}
  ${guard(`EXISTS(SELECT 1 FROM payroll_manual_pay_lines WHERE ${row} AND payroll_period_id IN(${sourcePeriodId},${targetPeriodId}) AND line_type='pto')`, 'Manual leave adjustments require review')}
  ${guard(`EXISTS(SELECT 1 FROM payroll_pto_requests WHERE ${row} AND status='approved' AND approved_payroll_period_id=${targetPeriodId})`, 'Target already has approved leave; review before moving pay')}
  IF NOT p_apply THEN
    ROLLBACK; DO RELEASE_LOCK(${quote(lock)}); SET v_lock=0;
    SELECT 'ready' execution_status,${requestId} request_id,${amount} transferred_pay,${remaining} source_pto_hours_after,${plan.hours} target_pto_hours_after; LEAVE main;
  END IF;
  UPDATE payroll_adjustments SET sick_pto_hours=${remaining},pto_hours=${remaining},updated_by_user_id=${actorId} WHERE payroll_period_id=${sourcePeriodId} AND ${row};
  INSERT INTO payroll_adjustments(payroll_period_id,agency_id,user_id,sick_pto_hours,training_pto_hours,pto_hours,pto_rate,updated_by_user_id)
    VALUES(${targetPeriodId},${agencyId},${employeeId},${plan.hours},0,${plan.hours},${plan.rate},${actorId});
  ${inserts}
  UPDATE payroll_pto_requests SET approved_payroll_period_id=${targetPeriodId},approved_rates_json=JSON_SET(approved_rates_json,'$[0].payrollPeriodId',${targetPeriodId},'$[1].payrollPeriodId',${targetPeriodId}),notes=CONCAT(COALESCE(notes,''),'\\n',${quote(note)}) WHERE id=${requestId} AND ${row};
  ${guard(`(SELECT sick_balance_hours FROM payroll_pto_accounts WHERE ${row})<>v_balance OR (SELECT SUM(hours_delta) FROM payroll_pto_ledger WHERE request_id=${requestId} AND ${row})<>-${plan.hours}`, 'The transfer changed the leave balance')}
  DELETE FROM payroll_summaries WHERE agency_id=${agencyId} AND payroll_period_id IN(${sourcePeriodId},${targetPeriodId});
  UPDATE payroll_periods SET status=IF(status='draft','draft','staged'),ran_at=NULL,ran_by_user_id=NULL WHERE agency_id=${agencyId} AND id IN(${sourcePeriodId},${targetPeriodId});
  INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES(${quote(action)},${actorId},${agencyId},JSON_SET(${metadata},'$.database_session_user',USER(),'$.leave_balance_before',v_balance,'$.leave_balance_after',v_balance,'$.original_approver',v_original_approver,'$.original_approved_at',v_original_approved_at));
  COMMIT; DO RELEASE_LOCK(${quote(lock)}); SET v_lock=0;
  SELECT 'applied' execution_status,${requestId} request_id,${amount} transferred_pay,${remaining} source_pto_hours_after,${plan.hours} target_pto_hours_after,v_balance unchanged_leave_balance;
END`;
  return { sql, hash, action };
}
