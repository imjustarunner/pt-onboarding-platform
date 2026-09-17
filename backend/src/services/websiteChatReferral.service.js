import {createHash} from 'node:crypto';
import pool from '../config/database.js';
export async function resolveChatReferral(slug,token,{clicked=false,db=pool}={}) {
 if(!/^[a-f0-9]{64}$/.test(String(token||'')))return null;
 const tokenHash=createHash('sha256').update(token).digest('hex');
 const [rows]=await db.execute(`SELECT r.session_id AS sessionId,r.author_user_id AS authorUserId,r.category FROM public_website_chat_referrals r JOIN public_website_chat_sessions s ON s.id=r.session_id WHERE r.token_hash=? AND s.site_slug=? AND r.created_at>UTC_TIMESTAMP()-INTERVAL 30 DAY`,[tokenHash,slug]);
 if(!rows[0])return null;
 if(clicked)await db.execute('UPDATE public_website_chat_referrals SET clicked_at=COALESCE(clicked_at,UTC_TIMESTAMP()) WHERE token_hash=?',[tokenHash]);
 return {...rows[0],tokenHash};
}
