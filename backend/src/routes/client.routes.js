import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  updateClientStatus,
  assignProvider,
  getClientHistory,
  getClientNotes,
  createClientNote,
  getClientReferralPacket
} from '../controllers/client.controller.js';

const router = express.Router();

// List clients (agency view)
router.get('/', authenticate, getClients);

// Get client detail
router.get('/:id', authenticate, getClientById);

// Referral packet URL (PHI warning should be shown client-side before opening)
router.get('/:id/referral-packet', authenticate, getClientReferralPacket);

// Create client
router.post('/', authenticate, createClient);

// Update client
router.put('/:id', authenticate, updateClient);

// Update client status
router.put('/:id/status', authenticate, updateClientStatus);

// Assign provider
router.put('/:id/provider', authenticate, assignProvider);

// Get status history
router.get('/:id/history', authenticate, getClientHistory);

// Get notes
router.get('/:id/notes', authenticate, getClientNotes);

// Create note
router.post('/:id/notes', authenticate, createClientNote);

export default router;
