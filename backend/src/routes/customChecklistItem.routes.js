import express from 'express';
import { body } from 'express-validator';
import {
  getAllChecklistItems,
  getChecklistItemById,
  getPlatformTemplates,
  getAgencyItems,
  getEnabledItemsForAgency,
  toggleItemForAgency,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  pushToAgency
} from '../controllers/customChecklistItem.controller.js';
import { authenticate, requireBackofficeAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateChecklistItem = [
  body('itemLabel')
    .notEmpty().withMessage('Item label is required')
    .trim()
    .isLength({ min: 1 }).withMessage('Item label cannot be empty'),
  body('itemKey').optional({ nullable: true, checkFalsy: true }).trim(),
  body('description').optional({ nullable: true, checkFalsy: true }).trim(),
  body('isPlatformTemplate').optional().isBoolean(),
  body('agencyId').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return Number.isInteger(Number(value)) && Number(value) >= 1;
  }).withMessage('Agency ID must be a positive integer or null'),
  body('parentItemId').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return Number.isInteger(Number(value)) && Number(value) >= 1;
  }).withMessage('Parent item ID must be a positive integer or null'),
  body('trainingFocusId').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return Number.isInteger(Number(value)) && Number(value) >= 1;
  }).withMessage('Training focus ID must be a positive integer or null'),
  body('moduleId').optional({ nullable: true }).custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return Number.isInteger(Number(value)) && Number(value) >= 1;
  }).withMessage('Module ID must be a positive integer or null'),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('autoAssign').optional().isBoolean()
];

router.get('/platform-templates', authenticate, getPlatformTemplates);
router.get('/agencies/:agencyId/items', authenticate, getAgencyItems);
router.get('/agencies/:agencyId/enabled', authenticate, getEnabledItemsForAgency);
router.get('/', authenticate, getAllChecklistItems);
router.get('/:id', authenticate, getChecklistItemById);
router.post('/', authenticate, requireBackofficeAdmin, validateChecklistItem, createChecklistItem);
router.put('/:id', authenticate, requireBackofficeAdmin, validateChecklistItem, updateChecklistItem);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteChecklistItem);
router.post('/:itemId/toggle-agency/:agencyId', authenticate, requireBackofficeAdmin, toggleItemForAgency);
router.post('/:id/push-to-agency', authenticate, requireSuperAdmin, pushToAgency);

export default router;

