import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getCatalog,
  streamTrack,
  listPlatformPlaylists,
  createPlatformPlaylist,
  updatePlatformPlaylist,
  deletePlatformPlaylist,
  addPlatformPlaylistTrack,
  removePlatformPlaylistTrack
} from '../controllers/focusMusic.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/catalog', getCatalog);
router.get('/stream/:slug', streamTrack);

router.get('/platform-playlists', listPlatformPlaylists);
router.post('/platform-playlists', createPlatformPlaylist);
router.put('/platform-playlists/:id', updatePlatformPlaylist);
router.delete('/platform-playlists/:id', deletePlatformPlaylist);
router.post('/platform-playlists/:id/tracks', addPlatformPlaylistTrack);
router.delete('/platform-playlists/:id/tracks/:trackId', removePlatformPlaylistTrack);

export default router;
