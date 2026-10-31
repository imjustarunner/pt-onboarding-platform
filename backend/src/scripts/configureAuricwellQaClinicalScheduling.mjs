// Explicit synthetic-fixture repair. Does not book, sign, collect, or submit claims.
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { isAuricwellQaAgency, allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';

const providerIds = [1433, 1438, 1439];
const codes = ['90791', 'H0031', '90832', '90834', '90837', '90846', '90847', '90853', 'H0032'];
export const plan = { agencyId:450, schoolId:451, providerIds, codes,
  selfPayOnly:true, schoolPlaceOfService:'03', retainedDraft:285,
  feeSourceServiceId:287, fillsMissingFeesOnly:true,
  sendsMessages:false, changesSignatures:false, createsCharges:false };

export async function configureQaClinicalScheduling(db, clinical) {
  await db.beginTransaction();
  let clinicalReadLock = false;
  try {
    const [[agency]] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');
    if (!isAuricwellQaAgency(agency)) throw Error('Expected the isolated synthetic QA agency.');
    const [[selfPay]] = await db.execute('SELECT self_pay_only FROM agency_self_pay_settings WHERE agency_id=450');
    if (Number(selfPay?.self_pay_only)!==1) throw Error('The demo must remain self-pay only.');
    const [providers] = await db.execute(`SELECT u.id,u.email,u.role,u.is_demo FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=450 AND ua.is_active=1
      WHERE u.id IN(1433,1438,1439) AND u.is_active=1`);
    if (providers.length!==3 || new Set(providers.map(p=>Number(p.id))).size!==3
      || providers.some(p=>!providerIds.includes(Number(p.id)) || !allowQaExchangeRecipient(agency,p))) throw Error('Unexpected QA provider roster.');
    const [[school]] = await db.execute(`SELECT a.id,a.name FROM agencies a JOIN agency_schools s ON s.school_organization_id=a.id
      WHERE a.id=451 AND a.slug='auricwell-qa-demo-school' AND s.agency_id=450 AND s.is_active=1`);
    if (!school) throw Error('Expected the affiliated synthetic school.');
    const [services] = await db.execute(`SELECT id,service_code,billing_method,price_cents,cancellation_policy_id FROM tenant_services
      WHERE agency_id=450 AND is_active=1 AND service_code IN (${codes.map(()=>'?').join(',')}) FOR UPDATE`,codes);
    if (services.length!==codes.length || new Set(services.map(s=>s.service_code)).size!==codes.length
      || services.some(s=>!codes.includes(s.service_code) || s.billing_method!=='self_pay')) throw Error('Expected all requested self-pay services.');
    // Inherit the demo's already configured standard session terms. Never
    // invent a fee, replace a configured target rate, or alter another tenant.
    const [[feeSource]] = await db.execute(`SELECT id,agency_id,billing_method,price_cents,cancellation_policy_id
      FROM tenant_services WHERE id=287 AND agency_id=450 AND is_active=1 AND billing_method='self_pay' FOR UPDATE`);
    if (!feeSource || Number(feeSource.agency_id)!==450 || feeSource.billing_method!=='self_pay') throw Error('Expected the existing demo self-pay fee source.');
    const [sourceRates] = await db.execute(`SELECT rate_cents,rate_unit FROM self_pay_service_rates
      WHERE agency_id=450 AND tenant_service_id=287 AND provider_user_id=0 FOR UPDATE`);
    const rateCents=sourceRates.length ? Number(sourceRates[0].rate_cents) : Number(feeSource.price_cents);
    const rateUnit=sourceRates.length ? sourceRates[0].rate_unit : 'session';
    if (sourceRates.length>1 || rateCents!==12000 || rateUnit!=='session') throw Error('The demo standard session rate changed; review manually.');
    const [[feePolicy]] = await db.execute(`SELECT id,agency_id,notice_hours,late_fee_cents,no_show_fee_cents,is_active
      FROM booking_cancellation_policies WHERE id=? AND agency_id=450 FOR UPDATE`,[feeSource.cancellation_policy_id]);
    if (!feePolicy || Number(feePolicy.agency_id)!==450 || Number(feePolicy.is_active)!==1
      || Number(feePolicy.notice_hours)!==24 || Number(feePolicy.late_fee_cents)!==8000 || Number(feePolicy.no_show_fee_cents)!==10000)
      throw Error('The demo standard cancellation policy changed; review manually.');
    const [targetRates] = await db.execute(`SELECT tenant_service_id,rate_cents,rate_unit FROM self_pay_service_rates
      WHERE agency_id=450 AND provider_user_id=0 AND tenant_service_id IN (${services.map(()=>'?').join(',')}) FOR UPDATE`,services.map(service=>service.id));
    const configuredRates=new Set(targetRates.map(rate=>Number(rate.tenant_service_id)));
    let inheritedRateCount=0,inheritedPolicyCount=0;
    for (const service of services) {
      const needsRate=service.price_cents==null && !configuredRates.has(Number(service.id));
      const needsPolicy=service.cancellation_policy_id==null;
      if (needsRate || needsPolicy) {
        await db.execute(`UPDATE tenant_services SET price_cents=COALESCE(price_cents,?),cancellation_policy_id=COALESCE(cancellation_policy_id,?)
          WHERE agency_id=450 AND id=? AND service_code=? AND billing_method='self_pay' AND is_active=1`,
          [needsRate?rateCents:null,needsPolicy?feePolicy.id:null,service.id,service.service_code]);
      }
      if (needsRate) {
        await db.execute(`INSERT INTO self_pay_service_rates(agency_id,tenant_service_id,provider_user_id,rate_cents,rate_unit,updated_by_user_id)
          VALUES(450,?,0,?,?,1435) ON DUPLICATE KEY UPDATE tenant_service_id=tenant_service_id`,[service.id,rateCents,rateUnit]);
        inheritedRateCount++;
      }
      if (needsPolicy) inheritedPolicyCount++;
    }
    for (const providerId of providerIds) for (const service of services) {
      await db.execute(`INSERT INTO staff_service_assignments(agency_id,tenant_service_id,user_id,is_active)
        VALUES(450,?,?,1) ON DUPLICATE KEY UPDATE is_active=1`,[service.id,providerId]);
    }
    const [locations] = await db.execute('SELECT id,place_of_service,billing_office_location_id FROM agency_service_locations WHERE agency_id=450 AND school_organization_id=451 AND is_active=1');
    if (locations.length>1 || locations.some(row=>row.place_of_service!=='03' || Number(row.billing_office_location_id)!==9)) throw Error('The demo school location changed; review manually.');
    let location = locations[0];
    if (!location) {
      const [[office]] = await db.execute(`SELECT o.id FROM office_locations o JOIN office_location_agencies a ON a.office_location_id=o.id
        WHERE a.agency_id=450 AND o.id=9`);
      if (!office) throw Error('Expected the demo billing office.');
      const [created] = await db.execute(`INSERT INTO agency_service_locations
        (agency_id,name,place_of_service,school_organization_id,billing_office_location_id,notes,created_by_user_id)
        VALUES(450,?,'03',451,9,'Synthetic school setting for demo appointments; no insurance submission.',1435)`,[school.name]);
      location = {id:created.insertId};
    }
    // Preserve authored source/output and the orphan record. Relink only the
    // known unsigned draft to its existing, uniquely identified booked visit.
    const [[draft]] = await db.execute('SELECT * FROM clinical_note_drafts WHERE id=285 AND user_id=1433 AND agency_id=450 AND client_id=2277 FOR UPDATE');
    let repairedDraft = false, pendingDraftReason = null;
    if (draft) {
      if (![159,140].includes(Number(draft.clinical_session_id)) || String(draft.date_of_service).slice(0,10)!=='2026-10-19' || draft.archived_at)
        throw Error('The retained draft changed; review manually.');
      const [appointments] = await db.execute(`SELECT a.id,a.clinical_session_id,a.service_code FROM appointments a
        JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=2277
        WHERE a.agency_id=450 AND a.provider_user_id=1433 AND a.id=84 AND a.status IN('scheduled','confirmed','completed')
          AND a.start_at='2026-10-19 15:00:00' AND a.end_at='2026-10-19 16:00:00'`);
      const appointment = appointments[0];
      if (appointments.length!==1 || Number(appointment.clinical_session_id)!==140) throw Error('The retained draft appointment changed; review manually.');
      if (!draft.service_code || draft.service_code!==appointment.service_code) {
        pendingDraftReason = 'Draft 285 and appointment 84 use different services. Provider review is required; the draft was left unchanged.';
      } else {
        // Hold the signature rows while relinking the unsigned draft; the
        // clinical connection is read-only and rolled back after main commit.
        await clinical.beginTransaction();
        clinicalReadLock = true;
        const [sessions] = await clinical.execute(`SELECT id,appointment_id FROM clinical_sessions
          WHERE agency_id=450 AND client_id=2277 AND provider_user_id=1433 AND id=? AND appointment_id=84 FOR UPDATE`,[appointment.clinical_session_id]);
        const [notes] = await clinical.execute(`SELECT id,provider_signed_at FROM clinical_notes WHERE agency_id=450 AND client_id=2277
          AND clinical_session_id IN (?,?) AND is_deleted=0 FOR UPDATE`,[draft.clinical_session_id,appointment.clinical_session_id]);
        if (sessions.length!==1 || notes.some(note=>note.provider_signed_at)) throw Error('The retained note has changed or been signed; review manually.');
        if (Number(draft.clinical_session_id)!==Number(appointment.clinical_session_id)) {
          await db.execute('UPDATE clinical_note_drafts SET clinical_session_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=285 AND agency_id=450 AND user_id=1433',[appointment.clinical_session_id]);
          repairedDraft=true;
        }
      }
    } else pendingDraftReason = 'Retained draft 285 was not found in its expected QA account; no draft was changed.';
    await db.commit();
    return {...plan,applied:true,assignments:services.length*providerIds.length,inheritedRateCount,inheritedPolicyCount,
      inheritedRateCents:rateCents,inheritedRateUnit:rateUnit,schoolServiceLocationId:location.id,repairedDraft,pendingDraftReason};
  } catch(error) {await db.rollback();throw error;}
  finally { if (clinicalReadLock) { try { await clinical.rollback(); } catch { /* connection closes in CLI cleanup */ } } }
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  if (!args.includes('--apply')) console.log(JSON.stringify(plan));
  else {
    const envIndex=args.indexOf('--env');
    if (envIndex<0 || !args[envIndex+1]) throw Error('Provide --env explicitly.');
    dotenv.config({path:args[envIndex+1],quiet:true});
    const options={host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z',dateStrings:true};
    const db=await mysql.createConnection(options);
    const clinical=await mysql.createConnection({...options,user:process.env.CLINICAL_DB_USER||options.user,password:process.env.CLINICAL_DB_PASSWORD||options.password,database:process.env.CLINICAL_DB_NAME||options.database});
    try {console.log(JSON.stringify(await configureQaClinicalScheduling(db,clinical)));}
    finally {await db.end();await clinical.end();}
  }
}
