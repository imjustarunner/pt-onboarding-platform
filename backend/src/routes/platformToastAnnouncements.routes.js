import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { listToasts, saveToast, deleteToast } from '../services/toastAnnouncements.service.js';

const router = express.Router();
router.use(authenticate, requireSuperAdmin);
const run = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/', run(async (_req, res) => res.json(await listToasts({}))));
router.post('/', run(async (req, res) => res.status(201).json(await saveToast({ userId: req.user.id, input: req.body }))));
router.put('/:id', run(async (req, res) => res.json(await saveToast({ userId: req.user.id, id: req.params.id, input: req.body }))));
router.delete('/:id', run(async (req, res) => res.json(await deleteToast({ id: req.params.id }))));
export default router;
