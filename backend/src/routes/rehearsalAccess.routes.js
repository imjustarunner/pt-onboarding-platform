import express from 'express';
import {requireRehearsalAccess} from '../services/rehearsalAccess.service.js';
import {rehearsalBootstrap,rehearsalI9} from '../controllers/itscoRehearsal.controller.js';
import {packetPreviewOptions,packetPreviewReference,packetPreviewContract,packetPreviewJobFile} from '../controllers/hirePacketPreview.controller.js';
const router=express.Router();
// This router is mounted before staff-authenticated catch-all /api routers.
// The signed capability grants read-only rehearsal access, never staff identity.
router.use(requireRehearsalAccess);
router.get('/bootstrap',rehearsalBootstrap);
router.get('/i9',rehearsalI9);
router.get('/options',packetPreviewOptions);
router.get('/reference',packetPreviewReference);
router.get('/job-file',packetPreviewJobFile);
router.post('/contract',packetPreviewContract);
router.use((req,res)=>res.status(404).json({error:{message:'This action is not available in the rehearsal.'}}));
export default router;
