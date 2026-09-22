import { getFocusMusicCatalog, resolveFocusMusicFile } from '../services/focusMusic.service.js';
import { isFocusMusicEnabledForAgency } from './focusMusic.controller.js';
import { familyError } from '../services/familyPolicy.js';

async function requireMusic(req) {
  // These routes run after requireFamilySession. Never accept a tenant supplied in headers/query.
  if (!req.family?.agencyId) throw familyError('Sign in to your family display.', 401);
  if (!await isFocusMusicEnabledForAgency(req.family.agencyId)) throw familyError('Focus Music is not enabled for your organization.', 403);
}
export async function familyFocusMusicCatalog(req, res) {
  await requireMusic(req);
  const tracks = await getFocusMusicCatalog();
  res.json({tracks:tracks.map(t=>({id:t.id,title:t.title,artist:t.artist || '',genre:t.genre || [],durationSec:t.durationSec,streamUrl:`/api/family/focus-music/stream/${encodeURIComponent(t.id)}`}))});
}
export async function familyFocusMusicStream(req, res, next) {
  await requireMusic(req);
  const file = await resolveFocusMusicFile(req.params.slug);
  if (!file) throw familyError('Track not found.',404);
  // sendFile supplies byte-range responses for seeking, including Safari on a mounted iPad.
  res.type('audio/mpeg').sendFile(file.fullPath,{cacheControl:false},error=>{if(error)next(error);});
}
