import express from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  updateClientStatus,
  assignProvider,
  getClientHistory,
  getClientNotes,
  createClientNote
} from '../controllers/client.controller.js';

const router = express.Router();

// List clients (agency view)
router.get('/', getClients);

// Get client detail
router.get('/:id', getClientById);

// Create client
router.post('/', createClient);

// Update client
router.put('/:id', updateClient);

// Update client status
router.put('/:id/status', updateClientStatus);

// Assign provider
router.put('/:id/provider', assignProvider);

// Get status history
router.get('/:id/history', getClientHistory);

// Get notes
router.get('/:id/notes', getClientNotes);

// Create note
router.post('/:id/notes', createClientNote);

export default router;
