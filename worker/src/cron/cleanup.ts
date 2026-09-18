import { Env } from '../types/env';
import { errorMessage, logEvent } from '../utils/log';

export async function cleanupExpiredParcels(env: Env) {
  const now = new Date().toISOString();
  
  const { results } = await env.DB.prepare(
    `SELECT id, file_key, type FROM parcels WHERE expires_at < ? AND status != 'DELETED'`
  ).bind(now).all();
  
  if (!results || results.length === 0) return;

  let deleted = 0;
  let deletedFiles = 0;
  
  for (const row of results) {
    const parcel = row as { id: string, file_key: string | null, type: string };
    
    try {
      if (parcel.type === 'file' && parcel.file_key) {
        await env.BUCKET.delete(parcel.file_key);
        deletedFiles++;
      }

      await env.DB.prepare(`UPDATE parcels SET status = 'DELETED', content = NULL, file_key = NULL WHERE id = ?`).bind(parcel.id).run();
      deleted++;
    } catch (error) {
      logEvent('error', 'cleanup.expired.failed', {
        parcelId: parcel.id,
        type: parcel.type,
        error: errorMessage(error)
      });
      throw error;
    }
  }

  logEvent('info', 'cleanup.expired.completed', {
    deleted,
    deletedFiles
  });
}
