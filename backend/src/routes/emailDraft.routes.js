import express from 'express';
import { createEmailDraft, getEmailDraft, listEmailDrafts, saveEmailDraft, deleteEmailDraft, sendEmailDraft } from '../services/emailDraft.service.js';
const router = express.Router();
const actor = (req) => req.quickView ? { id:req.quickView.userId, role:'provider', scopedAgencyId:req.quickView.agencyId } : req.user;
const handler = (fn) => async(req,res,next) => {
  try { res.set('Cache-Control','private, no-store'); await fn(req,res); }
  catch(e) { if(e.status) return res.status(e.status).json({error:{message:e.message}}); next(e); }
};
router.get('/',handler(async(req,res) => res.json({drafts:await listEmailDrafts(actor(req),req.quickView?.agencyId || Number(req.query.agencyId))})));
router.post('/',handler(async(req,res) => res.status(201).json({draft:await createEmailDraft(actor(req),{...req.body,agencyId:req.quickView?.agencyId || req.body.agencyId})})));
router.get('/:draftId',handler(async(req,res) => res.json({draft:await getEmailDraft(actor(req),req.params.draftId)})));
router.put('/:draftId',handler(async(req,res) => res.json(await saveEmailDraft(actor(req),req.params.draftId,req.body))));
router.delete('/:draftId',handler(async(req,res) => {await deleteEmailDraft(actor(req),req.params.draftId);res.json({ok:true});}));
router.post('/:draftId/send',handler(async(req,res) => res.json(await sendEmailDraft(actor(req),req.params.draftId,req.body.version))));
export default router;
