import { reconcileSupervisorQueue } from '../services/clinicalSupervisorReview.service.js';
import { parseObject } from '../services/supervisedBillingPolicy.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { listPendingRevisionWork } from '../services/clinicalNoteVersion.service.js';
import { cosignClinicalNote } from './medicalBilling.controller.js';
/**
 * Notes to sign: supervisor sign-off for supervisee clinical notes.
 * Clinical org agencies only. See docs/CLINICAL_NOTES_SUPERVISOR_SIGNOFF_SPEC.md
 */
import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import User from '../models/User.model.js';
import { latestNarrivaStatus } from '../services/narrivaReview.service.js';

/**
 * GET /api/me/notes-to-sign
 * List notes awaiting current user's supervisor sign-off.
 * Returns empty until signoff flow is implemented (Phase 2).
 */
export const listNotesToSign = async (req, res, next) => {
  try {
    const userId = req.user.id;
    await reconcileSupervisorQueue(userId,req.auricwellPreview?.agencyId || null);
    const agencies = await User.getAgencies(userId);
    const agencyIds=(agencies || []).filter(a=>a.is_active!==0 && !a.is_archived && (!req.auricwellPreview || Number(a.id)===Number(req.auricwellPreview.agencyId))).map(a=>Number(a.id));
    const revisionWork=(await listPendingRevisionWork({agencyIds,actorUserId:userId})).filter(item=>item.nextAction==='supervisor_sign');

    const [[pending]] = await pool.execute("SELECT id FROM clinical_note_signoffs WHERE supervisor_user_id=? AND status='awaiting_supervisor' LIMIT 1", [userId]);
    const isSupervisor = !!pending || revisionWork.length>0 || await SupervisorAssignment.hasSupervisees(userId);
    if (!isSupervisor) {
      return res.json({ notes: [], count: 0, isSupervisor: false });
    }

    let [rows] = await pool.execute(
      `SELECT cns.id,cns.clinical_note_id,cns.provider_user_id,cns.supervisor_user_id,cns.status,cns.created_at,cns.provider_signed_at,cns.agency_id,
        u.first_name AS provider_first_name,u.last_name AS provider_last_name
       FROM clinical_note_signoffs cns JOIN users u ON u.id=cns.provider_user_id
       JOIN user_agencies ua ON ua.user_id=cns.supervisor_user_id AND ua.agency_id=cns.agency_id AND ua.is_active=1
       WHERE cns.supervisor_user_id=? AND cns.status='awaiting_supervisor'
       ${req.auricwellPreview ? 'AND cns.agency_id=?' : ''}
       ORDER BY cns.provider_signed_at DESC,cns.created_at DESC ${req.notesCountOnly || req.notesIncludeAll===true ? '' : 'LIMIT 50'}`,
      req.auricwellPreview ? [userId,req.auricwellPreview.agencyId] : [userId]
    );
    if (rows.length) {
      const [notes] = await clinicalPool.execute(`SELECT n.id,n.agency_id,n.client_id,n.title,n.provider_signed_at,n.supervisor_cosigned_at,n.supervisor_cosigned_by_user_id,n.metadata_json,h.original_revision_id,h.effective_revision_id,h.pending_revision_id,JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.serviceCode')) AS service_code FROM clinical_notes n LEFT JOIN clinical_note_revision_heads h ON h.clinical_note_id=n.id AND h.agency_id=n.agency_id WHERE n.id IN (${rows.map(()=>'?').join(',')}) AND n.is_deleted=0`,rows.map(r=>r.clinical_note_id));
      const ids=[...new Set(notes.map(n=>n.client_id))];
      const [clients]=ids.length && !req.notesCountOnly ? await pool.execute(`SELECT id,agency_id,initials,full_name FROM clients WHERE id IN (${ids.map(()=>'?').join(',')})`,ids) : [[]];
      for (const row of rows) {
        const note=notes.find(n=>Number(n.id)===Number(row.clinical_note_id)&&Number(n.agency_id)===Number(row.agency_id));
        if (note) {
          const client=clients.find(c=>Number(c.id)===Number(note.client_id));
          Object.assign(row,{title:note.title,service_code:note.service_code,client_id:note.client_id,client_name:client?.full_name || client?.initials || null,client_code:client?.initials || null,date_of_service:parseObject(note.metadata_json).dateOfService || null});
        }
      }
      rows = rows.filter(row => {
        const note = notes.find(n => Number(n.id) === Number(row.clinical_note_id) && Number(n.agency_id) === Number(row.agency_id));
        return note && !note.pending_revision_id && !(note.effective_revision_id && Number(note.effective_revision_id)!==Number(note.original_revision_id)) && !(note.supervisor_cosigned_at && Number(note.supervisor_cosigned_by_user_id)===Number(userId)) && !(parseObject(note.metadata_json).reviewRequests || []).some(r => r.action === 'changes_needed' && !r.resolvedAt);
      });
    }
    if (revisionWork.length) {
      const clientIds=[...new Set(revisionWork.map(item=>item.clientId))],providerIds=[...new Set(revisionWork.map(item=>item.providerUserId))];
      const [[clients],[providers]]=req.notesCountOnly ? [[],[]] : await Promise.all([
        pool.execute(`SELECT id,agency_id,initials,full_name FROM clients WHERE id IN (${clientIds.map(()=>'?').join(',')})`,clientIds),
        pool.execute(`SELECT id,first_name,last_name FROM users WHERE id IN (${providerIds.map(()=>'?').join(',')})`,providerIds)
      ]);
      for (const item of revisionWork) {
        const client=(clients || []).find(c=>Number(c.id)===item.clientId && Number(c.agency_id)===item.agencyId),provider=(providers || []).find(p=>Number(p.id)===item.providerUserId);
        rows.push({id:`revision_${item.revisionId}`,clinical_note_id:item.clinicalNoteId,agency_id:item.agencyId,provider_user_id:item.providerUserId,supervisor_user_id:item.supervisorUserId,status:'awaiting_supervisor',created_at:item.createdAt,provider_signed_at:(item.signatures || []).find(s=>s.action==='author_sign')?.signedAt || item.createdAt,
          title:item.title,service_code:item.serviceCode,client_id:item.clientId,client_name:client?.full_name || client?.initials || null,client_code:client?.initials || null,provider_first_name:provider?.first_name || null,provider_last_name:provider?.last_name || null,date_of_service:item.dateOfService,
          clinical_revision_id:item.revisionId,revision_number:item.revisionNumber,revision_status:item.status,revision_action:item.nextAction});
      }
    }
    if (!req.notesCountOnly) {
      if(req.notesIncludeAll!==true)rows=rows.slice(0,50);
      for(const row of rows) {
        row.narriva={status:'pending',quickSignEligible:false,reviewId:null};
        if(row.clinical_revision_id)continue;
        try {
          const review=await latestNarrivaStatus(req.user,row.agency_id,row.clinical_note_id);
          if(review)row.narriva={status:review.status,quickSignEligible:review.quickSignEligible,reviewId:review.id};
        } catch { row.narriva.status='unavailable'; }
      }
    }

    res.json({
      notes: rows || [],
      count: (rows || []).length,
      isSupervisor: true
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/me/notes-to-sign/count
 * Count for Momentum List badge.
 */
export const getNotesToSignCount = async (req, res, next) => {
  return listNotesToSign({...req,notesCountOnly:true},{json:data=>res.json({count:data.count,isSupervisor:data.isSupervisor}),status:code=>res.status(code)},next);
};

/**
 * POST /api/me/notes-to-sign/:id/sign
 * Supervisor signs off on a note.
 */
export const signNote = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const signoffId = parseInt(req.params.id, 10);
    if (!signoffId) return res.status(400).json({ error: { message: 'Signoff ID required' } });

    const [[row]] = await pool.execute(
      `SELECT id, clinical_note_id, supervisor_user_id, status
       FROM clinical_note_signoffs
       WHERE id = ?`,
      [signoffId]
    ).catch(() => [[]]);

    const signoff = row || null;
    if (!signoff) return res.status(404).json({ error: { message: 'Sign-off record not found' } });
    if (Number(signoff.supervisor_user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'You are not the assigned supervisor for this note' } });
    }
    if (String(signoff.status) !== 'awaiting_supervisor') {
      return res.status(400).json({ error: { message: 'Note is not awaiting your sign-off' } });
    }

    return await cosignClinicalNote({ ...req, params: { noteId: signoff.clinical_note_id } }, res, next);

  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/me/clinical-notes-eligible?agencyId=
 * Returns whether the current user should see the clinical notes list (completing, signing, cosigning).
 * Only true for users in agencies with clinical org who are assigned to programs/clinical/learning with clients and notes.
 * Others get only the payroll unpaid-notes notification (single task item in running list).
 */
export const getClinicalNotesEligible = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.json({ eligible: false });

    const agencies = await User.getAgencies(userId);
    if (!(agencies || []).some(a => Number(a.id) === agencyId) && req.user.role !== 'super_admin') return res.json({ eligible: false });
    const [[pending]] = await pool.execute("SELECT id FROM clinical_note_signoffs WHERE supervisor_user_id=? AND agency_id=? AND status='awaiting_supervisor' LIMIT 1", [userId,agencyId]);
    if (pending) return res.json({ eligible: true });
    if ((await listPendingRevisionWork({agencyIds:[agencyId],actorUserId:userId})).length) return res.json({eligible:true});
    const hasClinicalOrg = await OrganizationAffiliation.agencyHasClinicalOrg(agencyId);
    if (!hasClinicalOrg) return res.json({ eligible: false });

    const [rows] = await pool.execute(
      `SELECT 1 FROM clients c
       LEFT JOIN client_provider_assignments cpa ON cpa.client_id = c.id AND cpa.is_active = TRUE
       WHERE c.agency_id = ?
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
         AND (c.provider_id = ? OR cpa.provider_user_id = ?)
       LIMIT 1`,
      [agencyId, userId, userId]
    ).catch(() => [[]]);

    const hasClients = rows && rows.length > 0;
    if (hasClients) return res.json({ eligible: true });

    const hasSuperviseesWithClients = await SupervisorAssignment.hasSupervisees(userId);
    if (!hasSuperviseesWithClients) return res.json({ eligible: false });

    const [supRows] = await pool.execute(
      `SELECT DISTINCT sa.supervisee_id FROM supervisor_assignments sa
       WHERE sa.supervisor_id = ? AND sa.agency_id = ? AND sa.is_active = TRUE`,
      [userId, agencyId]
    ).catch(() => [[]]);

    for (const r of supRows || []) {
      const sid = Number(r?.supervisee_id);
      if (!sid) continue;
      const [cRows] = await pool.execute(
        `SELECT 1 FROM clients c
         LEFT JOIN client_provider_assignments cpa ON cpa.client_id = c.id AND cpa.is_active = TRUE
         WHERE c.agency_id = ? AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
           AND (c.provider_id = ? OR cpa.provider_user_id = ?)
         LIMIT 1`,
        [agencyId, sid, sid]
      ).catch(() => [[]]);
      if (cRows && cRows.length > 0) return res.json({ eligible: true });
    }

    return res.json({ eligible: false });
  } catch (err) {
    next(err);
  }
};
