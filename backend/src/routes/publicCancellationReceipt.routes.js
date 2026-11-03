import express from 'express';
import { cancellationEmailReceipts } from '../services/cancellationEmailReceipt.service.js';
import { escapeNoticeHtml as e } from '../services/scheduleNoticeMessage.service.js';

export function cancellationReceiptRouter(receipts = cancellationEmailReceipts) {
  const router = express.Router();
  router.use(express.urlencoded({ extended:false, limit:'2kb' }));
  router.use((req,res,next) => { res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex, nofollow', 'X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }); next(); });
  const page = content => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cancellation notice receipt</title></head><body style="margin:0;background:#f4f6f9;color:#26364a"><main style="font:16px/1.6 Arial;max-width:560px;margin:32px auto;padding:24px;background:white;border-radius:12px">${content}</main></body></html>`;
  const error = (res,err) => res.status(err.status || 500).type('html').send(page(`<h1>Cancellation notice receipt</h1><p>${e(err.status ? err.message : 'We could not record receipt. Please try again or reply to your care team.')}</p>`));
  router.get('/:token', async(req,res) => {
    try {
      const state = await receipts.inspect(req.params.token);
      res.type('html').send(page(state.confirmed ? '<h1>Receipt confirmed</h1><p>Thank you. Your care team can see that receipt of this cancellation notice has been confirmed.</p>' :
        `<h1>Confirm receipt</h1><p>Please confirm you received the cancellation notice in your email. This tells your care team that another contact attempt is unnecessary.</p><form method="post" action="${e(req.baseUrl+'/'+req.params.token)}"><button type="submit" name="confirm" value="yes" style="font:700 16px Arial;background:#16457c;color:white;padding:14px 24px;border:0;border-radius:8px">I received this</button></form><p>Opening this page alone does not confirm receipt. No sign-in is needed.</p>`));
    } catch(err) { error(res,err); }
  });
  router.post('/:token', async(req,res) => {
    try {
      if (req.body?.confirm !== 'yes') throw Object.assign(new Error('Use the “I received this” button to confirm.'), { status:400 });
      const origin = req.get('origin');
      if (origin && origin !== `https://${req.get('host')}`) throw Object.assign(new Error('Open the link from your email and try again.'), { status:403 });
      await receipts.confirm(req.params.token);
      res.redirect(303,`${req.baseUrl}/${req.params.token}`);
    } catch(err) { error(res,err); }
  });
  return router;
}
export default cancellationReceiptRouter();
