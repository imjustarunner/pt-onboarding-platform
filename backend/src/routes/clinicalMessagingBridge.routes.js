import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { accountSecurityState } from '../services/accountSecurity.service.js';
import { pool } from '../services/auricwell/repository.js';
import { fail } from '../services/auricwell/policy.js';
import { staffIdentity } from '../services/auricwell/sharedProviders.js';
import * as messaging from '../services/auricwell/clientMessaging.js';

// Existing Communications Hub authentication, with explicit linked product
// membership and verified MFA. No role impersonation or automatic patient access.
const router = express.Router();
router.use(authenticate);
router.use(async (req,res,next) => {
  res.set('Cache-Control','no-store');
  try {
    if (process.env.AURICWELL_ENABLED !== 'true') throw fail(503,'Client texting is unavailable.');
    if (req.user.demoMode || req.user.switchedFromUserId || !(await accountSecurityState(req)).verified) throw fail(403,'Verify your sign-in in Account security before opening client texts.');
    const [[account]] = await pool.execute("SELECT id FROM auricwell_accounts WHERE canonical_user_id=? AND status='active'",[req.user.id]);
    if (!account) throw fail(403,'Connect your staff account to the AuricWell practice first.');
    req.clinicalSmsAccountId=account.id;next();
  } catch(e) { next(e); }
});
router.get('/practices',async(req,res,next)=>{
  try {
    const [rows]=await pool.execute(`SELECT p.id,p.name,p.slug FROM auricwell_practices p JOIN auricwell_memberships m ON m.practice_id=p.id
      WHERE m.account_id=? AND m.actor_type='staff' AND m.status='active' AND p.status='active' AND p.product='auricwell_ehr'`,[req.clinicalSmsAccountId]);
    res.json(rows);
  }catch(e){next(e);}
});
router.use('/practices/:id',async(req,res,next)=>{
  try {
    const ctx=await messaging.linkedStaffMessagingContext(req.params.id,req.clinicalSmsAccountId);
    const identity=await staffIdentity(ctx,ctx.accountId,pool);
    if (!identity?.active || identity.userId!==Number(req.user.id)) throw fail(403,'Your shared staff identity is not active in this agency.');
    req.clinicalSmsContext=ctx;next();
  }catch(e){next(e);}
});
const run=fn=>async(req,res,next)=>{try{res.json(await fn(req));}catch(e){next(e);}};
router.get('/practices/:id/sms/threads',run(req=>messaging.smsInbox(req.clinicalSmsContext,req.query.patientId||null)));
router.get('/practices/:id/sms/threads/:threadId',run(req=>messaging.smsConversation(req.clinicalSmsContext,req.params.threadId)));
router.post('/practices/:id/sms/threads/:threadId/replies',run(req=>messaging.replySms(req.clinicalSmsContext,req.params.threadId,req.body)));
router.post('/practices/:id/sms/threads/:threadId/resolve',run(req=>messaging.closeSmsThread(req.clinicalSmsContext,req.params.threadId)));
router.put('/practices/:id/sms/threads/:threadId/assignment',run(req=>messaging.assignSmsThread(req.clinicalSmsContext,req.params.threadId,req.body.accountId)));
export default router;
