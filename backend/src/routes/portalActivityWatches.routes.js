import express from 'express';
import pool from '../config/database.js';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { createPortalActivityWatch, verifyWatchScope, publicWatch } from '../services/portalActivityWatch.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

const router = express.Router();
router.use(authenticate,requireActiveStatus);
router.use((req,res,next) => ['super_admin','admin'].includes(req.user?.role) ? next() : res.status(403).json({error:{message:'Audit administrator access is required.'}}));
router.post('/',async (req,res,next) => {
  try {
    const watch = await createPortalActivityWatch(req.user,req.body || {});
    await logAuditEvent(req,{actionType:'portal_activity_watch_created',agencyId:watch.agency_id,metadata:{watchId:watch.id,targetUserId:watch.target_user_id,oneSession:true}});
    res.status(201).json(publicWatch(watch));
  } catch (error) { next(error); }
});
router.get('/:id',async (req,res,next) => {
  try {
    const [[watch]] = await pool.execute('SELECT * FROM portal_activity_watches WHERE id=? AND observer_user_id=?',[Number(req.params.id)||0,req.user.id]);
    if (!watch) return res.status(404).json({error:{message:'Watch not found.'}});
    await verifyWatchScope(watch);
    res.json(publicWatch(watch));
  } catch (error) { next(error); }
});
router.delete('/:id',async (req,res,next) => {
  const id = Number(req.params.id)||0;
  let connection;
  let acquired = false;
  try {
    connection = await pool.getConnection();
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[`portal_activity_watch:${id}`]);
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) return res.status(409).json({error:{message:'The watch is processing. Please retry.'}});
    const [[watch]] = await pool.execute('SELECT * FROM portal_activity_watches WHERE id=? AND observer_user_id=?',[id,req.user.id]);
    if (!watch) return res.status(404).json({error:{message:'Watch not found.'}});
    await pool.execute("UPDATE portal_activity_watches SET status='canceled' WHERE id=? AND status<>'completed'",[id]);
    await logAuditEvent(req,{actionType:'portal_activity_watch_canceled',agencyId:watch.agency_id,metadata:{watchId:id,targetUserId:watch.target_user_id}});
    res.json({ok:true});
  } catch (error) { next(error); }
  finally {
    try { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)',[`portal_activity_watch:${id}`]); }
    finally { connection?.release(); }
  }
});
export default router;
