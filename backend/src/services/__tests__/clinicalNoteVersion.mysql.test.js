import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';

// Uses an explicitly selected disposable local socket; never reads deployment
// credentials or connects to the Cloud SQL proxy on the application's port.
test('immutable clinical revisions enforce exact signatures, durable audit and billing holds in MySQL', {
  skip: process.env.CLINICAL_NOTE_VERSION_MYSQL_TEST !== '1'
}, async t => {
  const socketPath = process.env.CLINICAL_NOTE_VERSION_MYSQL_SOCKET;
  const syntheticCi = process.env.CI === 'true' && process.env.CLINICAL_NOTE_VERSION_MYSQL_CI === '1';
  const localPort = process.env.CLINICAL_NOTE_VERSION_MYSQL_LOCAL_PORT;
  if (localPort !== undefined) assert.equal(localPort, '33319', 'Only the explicitly isolated pilot server is allowed');
  assert.ok(syntheticCi || localPort === '33319' || socketPath?.startsWith('/private/tmp/pt-immutable-note-mysql-20261103/'));
  const connection = syntheticCi
    ? { host: '127.0.0.1', port: 33316, user: 'root', password: 'synthetic-root-only', timezone: 'Z' }
    : localPort === '33319' ? { host: '127.0.0.1', port: 33319, user: 'root', password: '', timezone: 'Z' }
      : { socketPath, user: 'root', timezone: 'Z' };
  // Only the explicit test pool can access the disposable schema. Accidental
  // default-pool use, including optional assistant queuing, fails on local port 1.
  process.env.NODE_ENV='test';process.env.SKIP_DB_CONNECT='1';process.env.SKIP_CLINICAL_DB_CONNECT='1';
  for (const prefix of ['DB','CLINICAL_DB']) for (const [key,value] of Object.entries({HOST:'127.0.0.1',PORT:'1',NAME:'never_production',USER:'assistant_tests_never_prod',PASSWORD:'unused'})) process.env[`${prefix}_${key}`]=value;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
  const { default: mysql } = await import('mysql2/promise');
  const admin = await mysql.createConnection(connection);
  const database = `immutable_note_revision_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  assert.match(database, /^immutable_note_revision_test_\d+_[a-f0-9]{8}$/);
  let pool;
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({ ...connection, database, connectionLimit: 4 });
    const apply = async file => {
      const sql = await readFile(new URL(`../../../../database/clinical_migrations/${file}`, import.meta.url), 'utf8');
      for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await pool.query(statement);
    };
    for (const file of ['001_create_clinical_data_plane.sql', '002_medical_billing_foundations.sql', '003_session_service_code_location.sql', '006_diagnosis_justification_and_plan_note_links.sql', '007_treatment_plan_effective_date_direction_diagnoses.sql', '013_addenda_interventions_billing_audit.sql', '018_claimmd_workflow.sql', '021_typed_note_entries.sql']) await apply(file);
    await pool.execute(`INSERT INTO clinical_sessions(id,agency_id,client_id,office_event_id,provider_user_id,source_timezone,scheduled_start_at,scheduled_end_at,duration_minutes,place_of_service,service_code,service_location_id,billing_office_location_id,metadata_json)
      VALUES(7,1,3,77,5,'America/Denver','2026-11-03 17:00:00','2026-11-03 17:45:00',45,'11','90834',10,11,?)`, [JSON.stringify({ locationLabel: 'Synthetic office' })]);
    const metadata = { serviceCode: '90834', dateOfService: '2026-11-03', clinicalValue: 'original', billingPrimaryUnits: 1, structuredChart: { durationMinutes: 45, startTime: '10:00', endTime: '10:45', locationLabel: 'Synthetic office', placeOfService: '11' } };
    await pool.execute(`INSERT INTO clinical_notes(id,clinical_session_id,agency_id,client_id,title,note_payload,metadata_json,created_by_user_id,note_type,is_billable,content_hash,provider_signed_at,provider_signed_by_user_id,supervisor_cosigned_at,supervisor_cosigned_by_user_id)
      VALUES(4,7,1,3,'Original','Original signed narrative',?,5,'PROGRESS',1,?,'2026-11-03 18:00:00',5,'2026-11-03 18:30:00',9)`, [JSON.stringify(metadata), 'f'.repeat(64)]);
    await pool.execute(`INSERT INTO clinical_note_addenda(clinical_note_id,agency_id,client_id,body,created_by_user_id,entry_kind,entry_reason,author_signed_at) VALUES(4,1,3,'Historical signed addition',5,'addendum','Legacy context','2026-11-03 18:40:00')`);
    await apply('027_immutable_note_revisions.sql');
    const service = await import('../clinicalNoteVersion.service.js');
    const { maybeDecryptNotePayload } = await import('../clinicalNoteCrypto.service.js');
    const note = async () => (await pool.execute('SELECT * FROM clinical_notes WHERE id=4'))[0][0];
    const summary = () => service.getRevisionSummary({ noteId: 4, agencyId: 1 }, pool);
    const proposal = async (origin, actorUserId, changes = {}) => {
      const { effectiveRevision } = await summary();
      return service.proposeRevision({ noteId: 4, agencyId: 1, actorUserId, origin, reason: 'Correct the documented context', responsibleSupervisorUserId: 9,
        requiresSupervisorCosign: true, baseRevisionId: effectiveRevision.id, expectedContentHash: effectiveRevision.contentHash, expectedVersionNumber: effectiveRevision.revisionNumber,
        notePayload: 'Corrected clinical narrative', ...changes }, pool);
    };
    const sign = (revision, actorUserId, action) => service.signRevision({ noteId: 4, agencyId: 1, revisionId: revision.id, actorUserId, action, attested: true, expectedContentHash: revision.contentHash }, pool);

    await t.test('legacy backfill is an observed snapshot with no manufactured signatures', async () => {
      const state = await summary(), original = state.effectiveRevision;
      assert.equal(original.origin, 'original');
      assert.equal(original.snapshot.notePayload, 'Original signed narrative');
      assert.equal(original.snapshot.addenda.length, 1);
      assert.equal(original.provenance.kind, 'legacy_observed');
      assert.equal(original.provenance.legacyProviderSignedByUserId, 5);
      assert.equal(original.provenance.legacyStoredPayloadHashMatches, false);
      assert.equal(original.signatures.length, 0);
      const [[audit]] = await pool.execute('SELECT COUNT(*) n FROM clinical_note_revision_audit WHERE revision_id=?', [original.id]);
      assert.equal(Number(audit.n), 1);
      assert.equal(original.snapshot.encounterContext.metadataJson.locationLabel, 'Synthetic office');
      await assert.rejects(pool.execute("UPDATE clinical_note_revisions SET reason='rewrite' WHERE id=?", [original.id]), /immutable/);
      await assert.rejects(pool.execute('DELETE FROM clinical_note_revisions WHERE id=?', [original.id]), /cannot be deleted/);
    });
    await t.test('direct narrative, identity, metadata and deletion writes are rejected but queue delivery metadata can change', async () => {
      for (const sql of ["UPDATE clinical_notes SET note_payload='rewrite' WHERE id=4", "UPDATE clinical_notes SET title='rewrite' WHERE id=4", 'UPDATE clinical_notes SET is_deleted=1 WHERE id=4', 'UPDATE clinical_notes SET client_id=99 WHERE id=4', 'UPDATE clinical_notes SET primary_diagnosis_id=99 WHERE id=4', 'UPDATE clinical_notes SET supervisor_cosigned_at=NULL WHERE id=4', "UPDATE clinical_notes SET metadata_json=JSON_SET(metadata_json,'$.clinicalValue','rewrite') WHERE id=4", 'DELETE FROM clinical_notes WHERE id=4']) await assert.rejects(pool.execute(sql), /immutable|cannot be deleted/);
      await pool.execute("UPDATE clinical_notes SET metadata_json=JSON_SET(metadata_json,'$.supervisorQueue',JSON_OBJECT('status','awaiting_supervisor'),'$.printUpload',JSON_OBJECT('storagePath','synthetic.pdf')) WHERE id=4");
    });
    let firstApproved;
    await t.test('billing proposes without signature; only the original author then responsible supervisor may sign', async () => {
      const revision = await proposal('billing', 12);
      assert.equal(revision.status, 'awaiting_author_signature');
      assert.equal(revision.signatures.length, 0);
      assert.equal(await service.hasPendingRevision({ noteId: 4, agencyId: 1 }, pool), true);
      let effective = await service.getEffectiveNote({ note: await note() }, pool);
      assert.equal(effective.note_payload, 'Original signed narrative');
      await assert.rejects(sign(revision, 12, 'author_sign'), { status: 403 });
      await assert.rejects(sign(revision, 9, 'supervisor_sign'), { status: 409 });
      await assert.rejects(service.signRevision({ noteId: 4, agencyId: 1, revisionId: revision.id, actorUserId: 5, action: 'author_sign', attested: true, expectedContentHash: 'wrong' }, pool), { status: 409 });
      const authorSigned = await sign(revision, 5, 'author_sign');
      assert.equal(authorSigned.status, 'awaiting_supervisor_signature');
      assert.equal(authorSigned.signatures.length, 1);
      firstApproved = await sign(revision, 9, 'supervisor_sign');
      assert.equal(firstApproved.status, 'approved');
      assert.equal(firstApproved.signatures.length, 2);
      assert.equal(await service.hasPendingRevision({ noteId: 4, agencyId: 1 }, pool), false);
      effective = await service.getEffectiveNote({ note: await note() }, pool);
      assert.equal(maybeDecryptNotePayload(effective.note_payload), 'Corrected clinical narrative');
      assert.equal(effective.clinical_version_id, revision.id);
      assert.equal(effective.metadata_json.supervisorCosign.contentHash, revision.contentHash);
      assert.equal((await note()).note_payload, 'Original signed narrative');
      assert.equal((await note()).supervisor_cosigned_by_user_id, 9);
    });
    await t.test('editing creates another immutable snapshot, stale drafts cannot be signed, and an author-signed draft can be replaced without losing signatures', async () => {
      const revision = await proposal('provider', 5);
      const edited = await service.editRevision({ noteId: 4, agencyId: 1, revisionId: revision.id, actorUserId: 5, expectedContentHash: revision.contentHash, expectedVersionNumber: revision.revisionNumber, notePayload: 'Revised draft' }, pool);
      assert.notEqual(edited.id, revision.id);
      assert.equal(edited.supersedesRevisionId, revision.id);
      await assert.rejects(sign(revision, 5, 'author_sign'), { status: 409 });
      await sign(edited, 5, 'author_sign');
      const replacement = await service.editRevision({ noteId: 4, agencyId: 1, revisionId: edited.id, actorUserId: 5, expectedContentHash: edited.contentHash, notePayload: 'Final corrected draft' }, pool);
      assert.equal(replacement.signatures.length, 0);
      assert.equal(replacement.supersedesRevisionId, edited.id);
      assert.equal((await service.getRevision({ noteId: 4, agencyId: 1, revisionId: edited.id }, pool)).signatures.length, 1);
      await sign(replacement, 5, 'author_sign'); await sign(replacement, 9, 'supervisor_sign');
      assert.equal((await service.getRevision({ noteId: 4, agencyId: 1, revisionId: firstApproved.id }, pool)).status, 'approved');
    });
    let supervisorApproved;
    await t.test('supervisor final submit signs once, approves immediately, removes cosign work and creates a durable author acknowledgement', async () => {
      await pool.execute("UPDATE clinical_notes SET metadata_json=JSON_SET(metadata_json,'$.serviceDetailAmendments',JSON_ARRAY(JSON_OBJECT('id',101,'approvedAt',NULL,'serviceDetails',JSON_OBJECT('durationMinutes',10))),'$.reviewRequests',JSON_ARRAY(JSON_OBJECT('id','old-service-request','source','service_correction','action','review_acknowledge','resolvedAt',NULL))) WHERE id=4");
      const revision = await proposal('supervisor', 9, { notePayload: 'Supervisor finalized narrative' });
      supervisorApproved = await sign(revision, 9, 'supervisor_sign');
      assert.equal(supervisorApproved.status, 'approved');
      assert.equal(supervisorApproved.signatures.length, 1);
      const state = await summary();
      assert.equal(state.pendingRevisionId, null);
      assert.equal(state.effectiveRevisionId, revision.id);
      const stored = await note();
      assert.equal(stored.metadata_json.supervisorQueue.status, 'signed');
      const request = stored.metadata_json.reviewRequests.find(r => r.revisionId === revision.id);
      assert.equal(request.assignedToUserId, 5); assert.equal(request.contentHash, revision.contentHash);
      assert.equal(request.signatureId, supervisorApproved.signatures[0].id);
      assert.equal(stored.metadata_json.serviceDetailAmendments[0].supersededByRevisionId,revision.id);
      assert.equal(stored.metadata_json.reviewRequests.find(r=>r.id==='old-service-request').resolvedByRevisionId,revision.id);
      await assert.rejects(sign(revision, 12, 'author_acknowledge'), { status: 403 });
      const [[audit]] = await pool.execute("SELECT COUNT(*) n FROM clinical_note_revision_audit WHERE revision_id=? AND event_type IN ('supervisor_sign','revision_approved') AND signature_id=?", [revision.id, request.signatureId]);
      assert.equal(Number(audit.n), 2);
    });
    await t.test('late acknowledgement of an older approved version cannot roll back the effective head', async () => {
      const next = await proposal('supervisor', 9, { notePayload: 'Newest supervisor narrative' });
      await sign(next, 9, 'supervisor_sign');
      const acknowledged = await sign(supervisorApproved, 5, 'author_acknowledge');
      assert.equal(acknowledged.status, 'approved');
      assert.equal((await summary()).effectiveRevisionId, next.id);
      assert.ok((await note()).metadata_json.reviewRequests.find(r => r.revisionId === supervisorApproved.id).acknowledgementSignatureId);
    });
    await t.test('independent signed addenda preserve prior approvals and freeze their own content', async () => {
      const before = await summary();
      const addition = await service.appendRevisionAddendum({ noteId: 4, agencyId: 1, actorUserId: 5, entryKind: 'addendum', body: 'Independent new clinical context', reason: 'New information', authorAttested: true }, pool);
      assert.equal((await summary()).effectiveRevisionId, before.effectiveRevisionId);
      assert.equal((await summary()).pendingRevisionId, null);
      assert.ok(addition.signatureId);
      const [[audit]] = await pool.execute("SELECT signature_id,revision_id,content_hash FROM clinical_note_revision_audit WHERE event_type='addendum_sign' AND signature_id=?", [addition.signatureId]);
      assert.equal(Number(audit.revision_id), before.effectiveRevisionId); assert.equal(audit.content_hash, addition.contentHash);
      const secondAddition = await service.appendRevisionAddendum({ noteId: 4, agencyId: 1, actorUserId: 9, entryKind: 'late_entry', body: 'Second independently signed entry', reason: 'Later observation', authorAttested: true }, pool);
      assert.notEqual(secondAddition.signatureId, addition.signatureId);
      await assert.rejects(pool.execute("UPDATE clinical_note_addenda SET body='rewrite' WHERE id=?", [addition.id]), /immutable/);
      await assert.rejects(pool.execute('DELETE FROM clinical_note_addenda WHERE id=?', [addition.id]), /cannot be deleted/);
      const effective = await service.getEffectiveNote({ note: await note() }, pool);
      assert.ok(effective.clinical_version_addenda.some(a => Number(a.id) === addition.id));
    });
    await t.test('one concurrent proposal wins the note lock and the other is rejected', async () => {
      const results = await Promise.allSettled([proposal('provider', 5), proposal('billing', 12)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 409).length, 1);
      const pending = (await summary()).pendingRevision;
      await sign(pending, 5, 'author_sign'); await sign(pending, 9, 'supervisor_sign');
    });
    await t.test('an independently added entry invalidates a stale approver manifest and each approval retains the manifest actually reviewed',async()=>{
      const revision=await proposal('provider',5),authorSigned=await sign(revision,5,'author_sign');
      const oldManifest=authorSigned.entryManifestHash,oldEntries=authorSigned.signatures[0].attestation.entryManifest;
      await service.appendRevisionAddendum({noteId:4,agencyId:1,actorUserId:5,entryKind:'addendum',body:'Independent entry added during supervisor review',reason:'Later observation',authorAttested:true},pool);
      await assert.rejects(sign(revision,9,'supervisor_sign'),{status:409});
      await assert.rejects(service.signRevision({noteId:4,agencyId:1,revisionId:revision.id,actorUserId:9,action:'supervisor_sign',attested:true,expectedContentHash:revision.contentHash,expectedEntryManifestHash:oldManifest},pool),{status:409});
      const refreshed=await service.getRevision({noteId:4,agencyId:1,revisionId:revision.id},pool);
      const approved=await service.signRevision({noteId:4,agencyId:1,revisionId:revision.id,actorUserId:9,action:'supervisor_sign',attested:true,expectedContentHash:revision.contentHash,expectedEntryManifestHash:refreshed.entryManifestHash},pool);
      assert.equal(approved.status,'approved');
      assert.deepEqual(approved.signatures.find(s=>s.action==='author_sign').attestation.entryManifest,oldEntries);
      assert.equal(approved.signatures.find(s=>s.action==='supervisor_sign').attestation.entryManifest.length,oldEntries.length+1);
    });
    await t.test('failure to persist the signed queue/ack rolls back the exact signature, approval and audit together', async () => {
      const revision = await proposal('supervisor', 9);
      const [[before]] = await pool.execute('SELECT COUNT(*) n FROM clinical_note_revision_audit WHERE revision_id=?', [revision.id]);
      await pool.query("CREATE TRIGGER reject_version_queue BEFORE UPDATE ON clinical_notes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic queue persistence failure'");
      try { await assert.rejects(sign(revision, 9, 'supervisor_sign'), /Synthetic queue persistence failure/); }
      finally { await pool.query('DROP TRIGGER reject_version_queue'); }
      const unchanged = await service.getRevision({ noteId: 4, agencyId: 1, revisionId: revision.id }, pool);
      assert.equal(unchanged.signatures.length, 0); assert.equal(unchanged.approval, null);
      const [[after]] = await pool.execute('SELECT COUNT(*) n FROM clinical_note_revision_audit WHERE revision_id=?', [revision.id]);
      assert.equal(Number(after.n), Number(before.n));
      await sign(revision, 9, 'supervisor_sign');
    });
    await t.test('initial live signing snapshots the exact locked note and evidence in the same transaction', async () => {
      await pool.execute("INSERT INTO clinical_notes(id,clinical_session_id,agency_id,client_id,title,note_payload,metadata_json,created_by_user_id,note_type,is_billable) VALUES(8,7,1,3,'New note','Live content',?,5,'PROGRESS',1)", [JSON.stringify({...metadata,attestation:{accurateAndComplete:true,signerLabel:'Synthetic author',ipAddress:'192.0.2.10',userAgent:'Synthetic signature QA'}})]);
      const db = await pool.getConnection();
      try {
        await db.beginTransaction();
        await db.execute('SELECT id FROM clinical_notes WHERE id=8 FOR UPDATE');
        await db.execute('UPDATE clinical_notes SET provider_signed_at=CURRENT_TIMESTAMP,provider_signed_by_user_id=5 WHERE id=8');
        const [[locked]] = await db.execute('SELECT * FROM clinical_notes WHERE id=8');
        const [[session]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=7');
        const revision = await service.ensureOriginalRevision({ db, note: locked, session, actorUserId: 5, signatureEvent: true, responsibleSupervisorUserId: 9, requiresSupervisorCosign: true });
        assert.equal(revision.content_hash, service.clinicalNoteSnapshotHash(locked, session));
        await db.commit();
      } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
      const state = await service.getRevisionSummary({ noteId: 8, agencyId: 1 }, pool);
      assert.equal(state.effectiveRevision.provenance.kind, 'live_signature');
      assert.equal(state.effectiveRevision.signatures[0].action, 'initial_author_sign');
      assert.equal(state.effectiveRevision.signatures[0].attestation.ipAddress, '192.0.2.10');
      const [[evidenceAudit]]=await pool.execute("SELECT event_json FROM clinical_note_revision_audit WHERE clinical_note_id=8 AND event_type='initial_author_sign'");
      const evidence=typeof evidenceAudit.event_json==='string'?JSON.parse(evidenceAudit.event_json):evidenceAudit.event_json;
      assert.equal(evidence.userAgent,'Synthetic signature QA');
      const [[count]] = await pool.execute('SELECT COUNT(*) n FROM clinical_note_revision_audit WHERE clinical_note_id=8');
      assert.equal(Number(count.n), 2);
    });
    await t.test('initial supervisor approval also rejects unseen independent entries and binds the refreshed exact manifest',async()=>{
      const before=await service.getRevisionSummary({noteId:8,agencyId:1},pool);
      await service.appendRevisionAddendum({noteId:8,agencyId:1,actorUserId:5,entryKind:'addendum',body:'New entry before original supervisor approval',reason:'New context',authorAttested:true},pool);
      const current=await service.getRevisionSummary({noteId:8,agencyId:1},pool);
      const cosign=async manifestHash=>{
        const db=await pool.getConnection();
        try {await db.beginTransaction();await db.execute('SELECT id FROM clinical_notes WHERE id=8 FOR UPDATE');
          await db.execute('UPDATE clinical_notes SET supervisor_cosigned_at=CURRENT_TIMESTAMP,supervisor_cosigned_by_user_id=9 WHERE id=8');
          const [[locked]]=await db.execute('SELECT * FROM clinical_notes WHERE id=8');
          await service.appendOriginalSignature({db,note:locked,actorUserId:9,expectedContentHash:current.effectiveRevision.contentHash,expectedEntryManifestHash:manifestHash});await db.commit();
        } catch(error){await db.rollback();throw error;}finally{db.release();}
      };
      await assert.rejects(cosign(before.entryManifestHash),{status:409});
      const [[unchanged]]=await pool.execute('SELECT supervisor_cosigned_at FROM clinical_notes WHERE id=8');assert.equal(unchanged.supervisor_cosigned_at,null);
      await cosign(current.entryManifestHash);
      const after=await service.getRevisionSummary({noteId:8,agencyId:1},pool);
      assert.equal(after.effectiveRevision.signatures.find(s=>s.action==='initial_author_sign').attestation.entryManifest.length,0);
      assert.equal(after.effectiveRevision.signatures.find(s=>s.action==='initial_supervisor_sign').attestation.entryManifest.length,1);
    });
    await t.test('MySQL JSON key ordering preserves exact locked signing tokens, and revised service context has matching UTC times', async () => {
      const [[stored]] = await pool.execute('SELECT * FROM clinical_notes WHERE id=8'), [[session]] = await pool.execute('SELECT * FROM clinical_sessions WHERE id=7');
      const locationSnapshot = { postalCode: '80000', state: 'CO', city: 'Synthetic', streetAddress: '1 Test Avenue', billingOfficeLocationId: 11, placeOfService: '11', name: 'Synthetic office' };
      const sessionWithLocation = { ...session, metadata_json: { locationSnapshot, locationLabel: 'Synthetic office' } };
      const tokenBefore = service.clinicalNoteSnapshotHash(stored, sessionWithLocation);
      await pool.execute('UPDATE clinical_sessions SET metadata_json=? WHERE id=7', [JSON.stringify(sessionWithLocation.metadata_json)]);
      const [[roundTrip]] = await pool.execute('SELECT * FROM clinical_sessions WHERE id=7');
      assert.equal(service.clinicalNoteSnapshotHash(stored, roundTrip), tokenBefore);
      await pool.query('CREATE TABLE agency_service_locations(id INT PRIMARY KEY,agency_id INT,is_active TINYINT,name VARCHAR(255),place_of_service VARCHAR(8),billing_office_location_id INT,street_address VARCHAR(255),city VARCHAR(100),state VARCHAR(8),postal_code VARCHAR(32))');
      await pool.execute("INSERT INTO agency_service_locations VALUES(10,1,1,'Synthetic office','11',11,'1 Test Avenue','Synthetic','CO','80000')");
      const { verifiedServiceLocation } = await import('../clinicalSupervisorReview.service.js');
      const details={serviceLocationId:10,locationLabel:'Synthetic office',placeOfService:'11',locationSnapshot:roundTrip.metadata_json.locationSnapshot};
      assert.equal((await verifiedServiceLocation(1,details,pool)).id,10);
      await pool.execute("UPDATE agency_service_locations SET street_address='2 Changed Avenue' WHERE id=10");
      await assert.rejects(verifiedServiceLocation(1,details,pool),{status:409});
      const revision = await proposal('provider', 5, { encounterContext: { dateOfService: '2026-11-04', sourceTimezone: 'America/Denver', startTime: '11:00', endTime: '12:00', durationMinutes: 60, locationSnapshot } });
      assert.equal(revision.snapshot.encounterContext.scheduledStartAt, '2026-11-04T18:00:00.000Z');
      assert.equal(revision.snapshot.encounterContext.scheduledEndAt, '2026-11-04T19:00:00.000Z');
      assert.deepEqual(revision.snapshot.metadataJson.structuredChart.locationSnapshot, locationSnapshot);
      await sign(revision, 5, 'author_sign'); await sign(revision, 9, 'supervisor_sign');
      assert.equal((await note()).metadata_json.dateOfService, '2026-11-03');
    });
    await t.test('assistant review reads current approved versions through SELECT-only adapters on actual MySQL', async () => {
      const { buildClinicalReviewPacket, readSourceRevision } = await import('../assistantReviewPackets.service.js');
      let sourceFailure;
      const clinicalReader = { execute: async (sql, args) => { assert.match(sql.trim(), /^SELECT\b/i);
        try { return await pool.execute(sql, args); } catch (error) { sourceFailure = { code: error.code, message: error.sqlMessage }; throw error; }
      } };
      const mainReader = { execute: async sql => {
        assert.match(sql.trim(), /^SELECT\b/i);
        return sql.includes('FROM clients c') ? [[{ id: 3, agency_id: 1, status: 'ACTIVE', full_name: 'Synthetic Client' }]] : [[]];
      } };
      const scope = { agencyId: 1, clientId: 3, subrole: 'clinical', privacyPolicy: { enabled: true, baaVerified: true,
        approved: true, sampleReviewPassed: true, revision: 'synthetic-v1', externalService: 'Synthetic vendor', baaReference: 'synthetic-baa', sampleReviewReference: 'synthetic-sample' } };
      const deps = { mainDb: mainReader, clinicalDb: clinicalReader, loadDocumentationPolicy: async () => ({ version: 'synthetic', supervisorUserId: 9 }),
        createPrivacyContext: () => ({ redact: async value => value }) };
      const packet = await buildClinicalReviewPacket(scope, deps);
      assert.equal(packet.status, 'ready', JSON.stringify(sourceFailure || { reasonCode: packet.reasonCode }));
      assert.ok(packet.packet.notes.length > 0);
      assert.equal(await readSourceRevision(scope, deps), packet.sourceRevision);
      assert.ok(packet.packet.notes.every(value => !Object.hasOwn(value, 'clinical_version_id')));
    });

    await t.test('signature, approval and audit records reject update and delete', async () => {
      for (const table of ['clinical_note_revision_signatures', 'clinical_note_revision_approvals', 'clinical_note_revision_audit']) {
        await assert.rejects(pool.execute(`UPDATE ${table} SET content_hash=? LIMIT 1`, ['0'.repeat(64)]), /immutable|append-only/);
        await assert.rejects(pool.execute(`DELETE FROM ${table} LIMIT 1`), /cannot be deleted/);
      }
    });
  } finally {
    if (pool) await pool.end();
    const { default: unusedApplicationPool } = await import('../../config/clinicalDatabase.js');
    await unusedApplicationPool.end();
    const { default: unusedMainPool } = await import('../../config/database.js');
    await unusedMainPool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.end();
  }
});
