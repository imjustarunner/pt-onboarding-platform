import multer from 'multer';
import {
  SHARE_IMAGE_SPEC,
  getSharePreviewState,
  resolveSharePreviewRedirect,
  saveSharePreviewImage,
  clearSharePreviewImage
} from '../services/publicSharePreview.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SHARE_IMAGE_SPEC.maxBytes },
  fileFilter: (req, file, cb) => {
    if (SHARE_IMAGE_SPEC.formats.includes(String(file.mimetype || '').toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Use a PNG, JPG, or WebP file.'));
    }
  }
});

export const sharePreviewUpload = upload.single('image');

export async function getPublicSharePreviewImage(req, res) {
  try {
    const location = await resolveSharePreviewRedirect(req);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.redirect(302, location);
  } catch (e) {
    return res.status(e.status || 400).json({ error: { message: e.message || 'Unable to load link image' } });
  }
}

export async function getPublicSharePreviewState(req, res) {
  try {
    const data = await getSharePreviewState({
      host: req.query.host || req.get('x-forwarded-host') || req.get('host'),
      agencySlug: req.params.agencySlug,
      page: req.query.page,
      pathname: req.query.path
    });
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(e.status || 400).json({ error: { message: e.message || 'Unable to load link image' } });
  }
}

export async function postPublicSharePreviewImage(req, res) {
  try {
    const data = await saveSharePreviewImage({
      agencySlug: req.params.agencySlug,
      page: req.body?.page || req.query.page,
      pathname: req.body?.path || req.query.path,
      file: req.file,
      user: req.user,
      host: req.get('x-forwarded-host') || req.get('host')
    });
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(e.status || 400).json({ error: { message: e.message || 'Unable to save link image' } });
  }
}

export async function deletePublicSharePreviewImage(req, res) {
  try {
    const data = await clearSharePreviewImage({
      agencySlug: req.params.agencySlug,
      page: req.query.page || req.body?.page,
      pathname: req.query.path || req.body?.path,
      user: req.user,
      host: req.get('x-forwarded-host') || req.get('host')
    });
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(e.status || 400).json({ error: { message: e.message || 'Unable to remove link image' } });
  }
}
