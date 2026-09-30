import express from 'express';
import pool from '../config/database.js';
import { acknowledgeArrival, tokenHash, escapeHtml } from '../services/officeArrivalNotifications.service.js';
const router=express.Router();
const page=(body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Office · Arrival notification</title><style>body{font:18px system-ui;background:#f7f8f0;color:#24443d;max-width:520px;margin:10vh auto;padding:24px}main{background:white;border-radius:24px;padding:32px}button{display:block;width:100%;font:inherit;padding:16px;margin:18px 0;border:0;border-radius:12px;background:#24443d;color:white;cursor:pointer}p{line-height:1.6}</style><main>${body}</main></html>`;
router.all('/:token',async(req,res,next)=>{
  if(!['GET','POST'].includes(req.method))return res.sendStatus(405);
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
  try {
    const token=String(req.params.token||'');
    if(!/^[a-f0-9]{64}$/.test(token))return res.status(404).send(page('<h1>Link unavailable</h1>'));
    const [[row]]=await pool.execute('SELECT notification_id,user_id FROM office_arrival_deliveries WHERE action_token_hash=? AND action_expires_at>UTC_TIMESTAMP()',[tokenHash(token)]);
    if(!row)return res.status(410).send(page('<h1>This link has expired</h1><p>You can manage arrival notifications in the app.</p>'));
    if(req.method==='POST') {
      const action=req.body?.action;
      if(!['acknowledge','in_app_only'].includes(action))return res.sendStatus(400);
      await acknowledgeArrival(row.notification_id,row.user_id,action==='in_app_only');
      return res.send(page(`<h1>${action==='in_app_only'?'Check-ins stay in the app':'Arrival dismissed'}</h1><p>${action==='in_app_only'?'Future client check-in emails are turned off. Your in-app arrivals remain available. Other email preferences are unchanged.':'This arrival is acknowledged. You can return to the app.'}</p>`));
    }
    // Merely opening an email link (including link scanners) changes nothing.
    res.send(page(`<h1>Office arrival notifications</h1><p>Dismiss this arrival, or turn off future check-in emails and keep arrivals in the app.</p><form method="post" action="${escapeHtml(req.baseUrl)}/${token}"><button name="action" value="acknowledge">Dismiss this arrival</button><button name="action" value="in_app_only">Keep check-ins in-app only</button></form>`));
  }catch(error){next(error);}
});
export default router;
