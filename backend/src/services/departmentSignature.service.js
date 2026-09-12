import crypto from 'node:crypto';
import puppeteer from 'puppeteer';
import pool from '../config/database.js';
import Storage from './storage.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pending=new Map();
export async function ensureDepartmentSignature(identity){
  if(!identity?.agency_id||identity.signature_image_url||identity.signature_image_path)return identity;
  if(pending.has(identity.id))return pending.get(identity.id);
  const work=(async()=>{
    const [rows]=await pool.execute('SELECT name,logo_path,logo_url FROM agencies WHERE id=?',[identity.agency_id]);if(!rows.length)return identity;
    const agency=rows[0];let logo='';
    const stored=String(agency.logo_path||agency.logo_url||'').replace(/^\/?uploads\//,'');
    // Only public branding objects in our storage, never arbitrary network URLs.
    if(/^(logos|icons|public-marketing)\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp)$/i.test(stored)&&!stored.includes('..')){try{const bytes=await Storage.readObjectBuffer(`uploads/${stored}`);if(bytes.length<5*1024*1024)logo=`data:image/${/\.png$/i.test(stored)?'png':/\.webp$/i.test(stored)?'webp':'jpeg'};base64,${bytes.toString('base64')}`;}catch{ /* Organization name remains readable when an asset is unavailable. */ }}
    const browser=await puppeteer.launch({headless:'new',...(process.env.PUPPETEER_EXECUTABLE_PATH?{executablePath:process.env.PUPPETEER_EXECUTABLE_PATH}:{}),args:process.env.PUPPETEER_NO_SANDBOX==='true'?['--no-sandbox']:[]});
    try{
      const page=await browser.newPage();await page.setViewport({width:720,height:180,deviceScaleFactor:2});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')?r.continue():r.abort());
      await page.setContent(`<html><body style="margin:0;background:#fff;font-family:Arial,sans-serif"><div style="padding:24px;display:flex;align-items:center;gap:24px;height:132px">${logo?`<img src="${logo}" style="width:110px;height:110px;object-fit:contain" alt="">`:''}<div style="border-left:3px solid #17486b;padding-left:24px"><strong style="font-size:22px;color:#17364c">${escape(identity.display_name||agency.name)}</strong><p style="font-size:17px;color:#425466">${escape(identity.from_email)}</p><span style="font-size:15px;color:#425466">${escape(agency.name)}</span></div></div></body></html>`,{waitUntil:'load'});
      const png=await page.screenshot({type:'png'}),hash=crypto.createHash('sha256').update(png).digest('hex').slice(0,20);
      const saved=await Storage.saveLogo(png,`department-${identity.agency_id}-${identity.id}-${hash}.png`,'image/png');
      const path=typeof saved==='string'?saved:saved.path||saved.relativePath||saved.url;
      if(!path)throw new Error('Signature storage did not return a path');
      return await EmailSenderIdentity.update(identity.id,{signatureImagePath:path,signatureImageUrl:publicUploadsUrlFromStoredPath(path),signatureAltText:identity.display_name||agency.name});
    }finally{await browser.close();}
  })();pending.set(identity.id,work);try{return await work;}finally{pending.delete(identity.id);}
}
