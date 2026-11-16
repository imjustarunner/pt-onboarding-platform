import GuestInvoices from '../services/guestInvoice.service.js';
import { positiveId } from '../services/familyBillingPolicy.service.js';

const handle = action => async (req,res,next) => {try {res.json(await action(req));}catch(error){next(error);}};
const actor = req => ({userId:positiveId(req.user.id),actorRole:req.user.role,agencyId:positiveId(req.body?.agencyId||req.query?.agencyId),allocationId:positiveId(req.params.id)});
const token = req => req.get('X-Guest-Invoice-Token');

export const createGuestInvoice = handle(req=>GuestInvoices.create({...req.body,...actor(req)}));
export const sendGuestInvoice = handle(req=>GuestInvoices.send({...req.body,...actor(req)}));
export const revokeGuestInvoice = handle(req=>GuestInvoices.revoke({...req.body,...actor(req)}));
export const previewExternalGuestInvoice = handle(req=>GuestInvoices.externalPreview({...req.body,...actor(req)}));
export const listExternalGuestInvoiceBalances = handle(req=>GuestInvoices.externalBalances({userId:positiveId(req.user.id),actorRole:req.user.role,agencyId:positiveId(req.query?.agencyId),clientId:positiveId(req.params.clientId)}));
export const guestInvoiceContext = handle(req=>GuestInvoices.context(token(req)));
export const prepareGuestInvoicePayment = handle(req=>GuestInvoices.intent(token(req),{expectedAmountCents:req.body?.expectedAmountCents,consentAccepted:req.body?.consentAccepted,ip:req.ip,userAgent:req.get('user-agent')}));
export const confirmGuestInvoicePayment = handle(req=>GuestInvoices.confirm(token(req)));
