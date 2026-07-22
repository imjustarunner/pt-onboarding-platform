import express from 'express';
import { body } from 'express-validator';
import {
  listLibraryItems,
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem
} from '../controllers/trainingContentLibrary.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, requireBackofficeAdmin, listLibraryItems);
router.post('/', authenticate, requireBackofficeAdmin, [
  body('title').trim().notEmpty(),
  body('contentType').trim().notEmpty(),
  body('contentData').isObject()
], createLibraryItem);
router.put('/:id', authenticate, requireBackofficeAdmin, updateLibraryItem);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteLibraryItem);

export default router;
