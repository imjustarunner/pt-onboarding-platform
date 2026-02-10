import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listOffices,
  listArchivedOffices,
  createOffice,
  getOffice,
  updateOffice,
  archiveOffice,
  restoreOffice,
  deleteOffice,
  addOfficeAgency,
  removeOfficeAgency,
  listRoomTypes,
  createRoomType,
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  testGoogleSync,
  searchModules,
  listOfficeQuestionnaires,
  upsertOfficeQuestionnaire,
  removeOfficeQuestionnaire
} from '../controllers/officeSettings.controller.js';

const router = express.Router();

router.use(authenticate);

// Offices
router.get('/', listOffices);
router.get('/archived', listArchivedOffices);
router.post('/', createOffice);
router.get('/:officeId', getOffice);
router.put('/:officeId', updateOffice);
router.post('/:officeId/archive', archiveOffice);
router.post('/:officeId/restore', restoreOffice);
router.delete('/:officeId', deleteOffice);

// Office agencies
router.post('/:officeId/agencies', addOfficeAgency);
router.delete('/:officeId/agencies/:agencyId', removeOfficeAgency);

// Room types
router.get('/:officeId/room-types', listRoomTypes);
router.post('/:officeId/room-types', createRoomType);

// Rooms
router.get('/:officeId/rooms', listRooms);
router.post('/:officeId/rooms', createRoom);
router.put('/:officeId/rooms/:roomId', updateRoom);
router.delete('/:officeId/rooms/:roomId', deleteRoom);
router.post('/:officeId/test-google-sync', testGoogleSync);

// Questionnaire modules (shared modules)
router.get('/questionnaire-modules/search', searchModules);
router.get('/:officeId/questionnaires', listOfficeQuestionnaires);
router.post('/:officeId/questionnaires', upsertOfficeQuestionnaire);
router.delete('/:officeId/questionnaires/:moduleId', removeOfficeQuestionnaire);

export default router;

