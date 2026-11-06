import pool from '../config/database.js';
import StorageService from './storage.service.js';
// Random storage identifiers only. Never retain an audio body or participant identity here.
export async function queueClinicalAudioCleanup(bucketName, objectKey) {
  if (!bucketName || !/^clinical_audio\/[a-f0-9]+$/.test(objectKey || '')) throw new Error('Invalid temporary clinical audio key.');
  await pool.execute('INSERT IGNORE INTO clinical_audio_cleanup_jobs (bucket_name,object_key,available_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))', [bucketName,objectKey]);
}
export async function finishClinicalAudioCleanup(bucketName,objectKey) {
  await pool.execute('DELETE FROM clinical_audio_cleanup_jobs WHERE bucket_name=? AND object_key=?',[bucketName,objectKey]);
}
export async function readyClinicalAudioCleanup(bucketName,objectKey) {
  await pool.execute('UPDATE clinical_audio_cleanup_jobs SET available_at=UTC_TIMESTAMP() WHERE bucket_name=? AND object_key=?',[bucketName,objectKey]);
}
export async function retryClinicalAudioCleanup() {
  const [rows] = await pool.execute('SELECT id,bucket_name,object_key FROM clinical_audio_cleanup_jobs WHERE available_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 50');
  if (!rows.length) return {remaining:0};
  const storage=await StorageService.getGCSStorage();
  for (const row of rows) {
    try { await storage.bucket(row.bucket_name).file(row.object_key).delete({ignoreNotFound:true});await pool.execute('DELETE FROM clinical_audio_cleanup_jobs WHERE id=?',[row.id]); }
    catch { await pool.execute('UPDATE clinical_audio_cleanup_jobs SET attempts=attempts+1,last_attempt_at=UTC_TIMESTAMP() WHERE id=?',[row.id]); }
  }
  return {processed:rows.length};
}
