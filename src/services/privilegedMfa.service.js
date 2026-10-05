const crypto = require('crypto');
const env = require('../config/env');
const PrivilegedLoginChallenge = require('../models/PrivilegedLoginChallenge');
const { sendEmail, isEmailConfigured } = require('./emailService');

const PRIVILEGED_ROLES = new Set(['super_admin','platform_admin','billing_admin','ai_manager','integration_manager','content_moderator','support_agent','analyst']);
function hmac(value) { return crypto.createHmac('sha256', env.privilegedMfaChallengeSecret).update(String(value || '')).digest('base64url'); }
function safeEqual(a,b){ const x=Buffer.from(String(a||'')); const y=Buffer.from(String(b||'')); return x.length>0 && x.length===y.length && crypto.timingSafeEqual(x,y); }
function requiresPrivilegedMfa(user){ return Boolean(env.privilegedMfaEnabled && user && (PRIVILEGED_ROLES.has(String(user.role||'')) || user.adminRole)); }
function fingerprint(value){ return crypto.createHash('sha256').update(String(value||'')).digest('base64url'); }

async function createPrivilegedMfaChallenge({ user, req, nextPath }) {
  if (!isEmailConfigured()) { const e=new Error('Privileged MFA email delivery is unavailable.'); e.status=503; throw e; }
  await PrivilegedLoginChallenge.updateMany({ user:user._id, consumedAt:null }, { $set:{ consumedAt:new Date() } }).catch(()=>{});
  const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
  const browserNonce=crypto.randomBytes(32).toString('base64url');
  const challenge=new PrivilegedLoginChallenge({
    user:user._id,
    codeHash:'pending',
    browserNonceHash:hmac(browserNonce),
    nextPath:String(nextPath||'/dashboard').slice(0,1000),
    expiresAt:new Date(Date.now()+env.privilegedMfaExpiresMinutes*60*1000),
    requestedIpHash:fingerprint(req.ip),
    requestedUserAgentHash:fingerprint(req.get('user-agent'))
  });
  challenge.codeHash=hmac(`${challenge._id}:${code}`);
  await challenge.save();
  const delivery=await sendEmail({
    to:user.email,
    subject:'AutoBrand AI privileged sign-in code',
    text:`Your AutoBrand AI privileged sign-in code is ${code}. It expires in ${env.privilegedMfaExpiresMinutes} minutes. If you did not sign in, reset your password and revoke active sessions.`,
    html:`<p>Your AutoBrand AI privileged sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in ${env.privilegedMfaExpiresMinutes} minutes. If you did not sign in, reset your password and revoke active sessions.</p>`
  });
  if (!delivery.delivered) { await PrivilegedLoginChallenge.deleteOne({_id:challenge._id}); const e=new Error('Privileged MFA code could not be delivered.'); e.status=503; throw e; }
  return { challengeId:String(challenge._id), browserNonce, expiresAt:challenge.expiresAt };
}

async function verifyPrivilegedMfaChallenge({ challengeId, browserNonce, code }) {
  const challenge=await PrivilegedLoginChallenge.findById(challengeId).select('+codeHash +browserNonceHash');
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) { const e=new Error('This verification challenge has expired. Sign in again.'); e.status=401; throw e; }
  if (challenge.attempts >= challenge.maxAttempts) { challenge.consumedAt=new Date(); await challenge.save(); const e=new Error('Too many verification attempts. Sign in again.'); e.status=429; throw e; }
  if (!safeEqual(challenge.browserNonceHash,hmac(browserNonce))) { challenge.consumedAt=new Date(); await challenge.save(); const e=new Error('Verification challenge does not belong to this browser.'); e.status=403; throw e; }
  challenge.attempts += 1;
  const valid=safeEqual(challenge.codeHash,hmac(`${challenge._id}:${String(code||'').trim()}`));
  if (!valid) { if (challenge.attempts >= challenge.maxAttempts) challenge.consumedAt=new Date(); await challenge.save(); const e=new Error(challenge.consumedAt?'Too many verification attempts. Sign in again.':'Invalid verification code.'); e.status=challenge.consumedAt?429:422; throw e; }
  challenge.consumedAt=new Date(); await challenge.save();
  return challenge;
}
module.exports={ PRIVILEGED_ROLES, requiresPrivilegedMfa, createPrivilegedMfaChallenge, verifyPrivilegedMfaChallenge };
