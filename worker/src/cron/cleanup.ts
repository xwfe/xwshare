import { Env } from '../types/env';

export async function cleanupExpiredParcels(env: Env) {
  const now = new Date().toISOString();
  
  const { results } = await env.DB.prepare(
    `SELECT id, file_key, type FROM parcels WHERE expires_at < ? AND status != 'DELETED'`
  ).bind(now).all();
  
  if (!results || results.length === 0) return;
  
  for (const row of results) {
    const parcel = row as { id: string, file_key: string | null, type: string };
    
    if (parcel.type === 'file' && parcel.file_key) {
      await env.BUCKET.delete(parcel.file_key);
    }
    
    await env.DB.prepare(`UPDATE parcels SET status = 'DELETED', content = NULL, file_key = NULL WHERE id = ?`).bind(parcel.id).run();
  }
}
