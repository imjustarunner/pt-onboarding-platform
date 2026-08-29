import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  getHome,
  listCategories,
  updateCategory,
  listFolders,
  createFolder,
  updateFolder,
  listFolderShares,
  setFolderShares,
  listTags,
  createTag,
  listResources,
  getResource,
  uploadResource,
  uploadLibraryFile,
  addLinkResource,
  updateResource,
  archiveResource,
  deleteResource,
  downloadResource,
  listFavorites,
  addFavorite,
  removeFavorite,
  getRecent
} from '../controllers/library.controller.js';

const router = express.Router();

router.use(authenticate, requireCapability('canViewLibrary'));

router.get('/home', getHome);
router.get('/recent', getRecent);

router.get('/categories', listCategories);
router.patch('/categories/:id', requireCapability('canManageLibrary'), updateCategory);

router.get('/folders', listFolders);
router.post('/folders', createFolder);
router.patch('/folders/:id', updateFolder);
router.get('/folders/:id/shares', listFolderShares);
router.put('/folders/:id/shares', setFolderShares);

router.get('/tags', listTags);
router.post('/tags', requireCapability('canManageLibrary'), createTag);

router.get('/favorites', listFavorites);
router.post('/favorites/:resourceId', addFavorite);
router.delete('/favorites/:resourceId', removeFavorite);

router.get('/resources', listResources);
router.get('/resources/:id', getResource);
router.get('/resources/:id/download', downloadResource);
router.post(
  '/resources/upload',
  (req, res, next) => {
    uploadLibraryFile.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: { message: err.message || 'Upload failed' } });
      }
      return next();
    });
  },
  uploadResource
);
router.post('/resources/link', addLinkResource);
router.patch('/resources/:id', updateResource);
router.post('/resources/:id/archive', archiveResource);
router.delete('/resources/:id', requireCapability('canManageLibrary'), deleteResource);

export default router;
