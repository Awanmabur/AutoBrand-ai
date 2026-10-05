const env = require('../config/env');

function safeKey(key='') { return String(key).trim().replace(/[^a-z0-9-]/gi,'-').replace(/-+/g,'-').toLowerCase(); }
function cookieName(key) { const clean=safeKey(key); return env.nodeEnv === 'production' ? `__Host-autobrand-${clean}` : `autobrand-${clean}`; }
function legacyName(key) {
  const map={
    'google-oauth-state':'googleOAuthState','google-oauth-purpose':'googleOAuthPurpose','signup-selected-plan':'signupSelectedPlan','signup-next-path':'signupNextPath',
    'google-drive-oauth-state':'googleDriveOAuthState','google-drive-pkce':'googleDrivePkce'
  };
  return map[safeKey(key)] || '';
}
function options(maxAge) { return { httpOnly:true,sameSite:'lax',secure:env.nodeEnv==='production',path:'/',maxAge,priority:'high' }; }
function setTransientCookie(res,key,value,maxAge){ const name=cookieName(key); res.cookie(name,value,options(maxAge)); const legacy=legacyName(key); if(legacy&&legacy!==name) res.clearCookie(legacy,{path:'/',sameSite:'lax',secure:env.nodeEnv==='production'}); }
function getTransientCookie(req,key){ const name=cookieName(key),legacy=legacyName(key); return req.cookies?.[name] || (legacy?req.cookies?.[legacy]:'') || ''; }
function clearTransientCookie(res,key){ const opts={path:'/',sameSite:'lax',secure:env.nodeEnv==='production'}; res.clearCookie(cookieName(key),opts); const legacy=legacyName(key); if(legacy) res.clearCookie(legacy,opts); }
module.exports={cookieName,legacyName,setTransientCookie,getTransientCookie,clearTransientCookie};
