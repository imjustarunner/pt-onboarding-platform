import config from '../config/config.js';
import {verifyRecaptchaV3} from './captcha.service.js';
import {plotlineFailure} from './plotlineSelfService.service.js';

export function plotlineCaptchaConfig(){
 return {siteKey:process.env.PLOTLINE_RECAPTCHA_SITE_KEY||config.recaptcha?.siteKey||'',useEnterprise:!!config.recaptcha?.enterpriseApiKey};
}
export async function protectPlotlineSignup(req,{verify=verifyRecaptchaV3,settings=plotlineCaptchaConfig()}={}) {
 // Existing account authentication already used the app's security flow. It
 // does not remove email, company, IP or platform capacity limits.
 if(req.user?.id)return;
 if(req.body?.website)throw plotlineFailure(400,'SIGNUP_REVIEW_REQUIRED','We couldn’t confirm this request. Please request help from Plotline.');
 if(!settings.siteKey)throw plotlineFailure(503,'SIGNUP_PROTECTION_UNAVAILABLE','Company signup is temporarily unavailable. Please request a walkthrough.');
 const result=await verify({token:req.body?.captchaToken,remoteip:req.ip,expectedAction:'plotline_signup',userAgent:req.get('user-agent'),siteKeyOverride:settings.siteKey});
 if(!result.ok || result.action!=='plotline_signup' || !Number.isFinite(result.score) || result.score<0.5)throw plotlineFailure(400,'SIGNUP_VERIFICATION_REQUIRED','We couldn’t confirm this request. Please try again or request a walkthrough.');
}
