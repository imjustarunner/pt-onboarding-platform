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
  uploadBatchResources,
  uploadLibraryFile,
  suggestResourceMetadata,
  createBrandedDoc,
  renderBrandedDocPdf,
  listLetterheadsForLibrary,
  addLinkResource,
  updateResource,
  archiveResource,
  deleteResource,
  downloadResource,
  listFavorites,
  addFavorite,
  removeFavorite,
  getRecent,
  listResourceShares,
  setResourceShares,
  distributeResource,
  listMyCopies
} from '../controllers/library.controller.js';

const router = express.Router();

router.use(authenticate, requireCapability('canViewLibrary'));

router.get('/home', getHome);
router.get('/recent', getRecent);
router.get('/my-copies', listMyCopies);
router.get('/letterheads', listLetterheadsForLibrary);

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
router.post('/resources/branded', createBrandedDoc);
router.post(
  '/resources/suggest-metadata',
  (req, res, next) => {
    uploadLibraryFile.single('file')(req, res, () => next());
  },
  suggestResourceMetadata
);
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
router.post(
  '/resources/upload-batch',
  (req, res, next) => {
    uploadLibraryFile.array('files', 200)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: { message: err.message || 'Upload failed' } });
      }
      return next();
    });
  },
  uploadBatchResources
);
router.post('/resources/link', addLinkResource);
router.get('/resources/:id', getResource);
router.get('/resources/:id/download', downloadResource);
router.get('/resources/:id/pdf', renderBrandedDocPdf);
router.get('/resources/:id/shares', listResourceShares);
router.put('/resources/:id/shares', setResourceShares);
router.post('/resources/:id/distribute', distributeResource);
router.patch('/resources/:id', updateResource);
router.post('/resources/:id/archive', archiveResource);
router.delete('/resources/:id', requireCapability('canManageLibrary'), deleteResource);

export default router;
