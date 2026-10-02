import { fileTicketAttachment } from '../services/ticketAttachmentFiling.service.js';

export async function addTicketAttachmentToClient(req, res, next) {
  try {
    const result = await fileTicketAttachment({
      ticketId: Number(req.params.id), attachmentId: Number(req.params.attachmentId),
      clientId: Number(req.body?.clientId), user: req.user
    });
    res.status(result.alreadyAdded ? 200 : 201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
}
