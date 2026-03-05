// api/auth.js
const { getOAuthClient } = require('../lib/google');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send'
];

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://jaac.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pathname = req.url.split('?')[0];

  // ── /api/auth?action=login ──────────────────────────────
  if (pathname.includes('login') || req.query.action === 'login') {
    const oauth2Client = getOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES
    });
    return res.redirect(authUrl);
  }

  // ── /api/auth?action=callback ───────────────────────────
  const code = req.query.code;
  if (code) {
    try {
      const oauth2Client = getOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      return res.status(200).send(`
        <html><body style="font-family:monospace;padding:40px;background:#111;color:#01F66B">
          <h2 style="color:#fff">✅ Authentification réussie !</h2>
          <p style="color:#aaa">Copiez ce refresh_token dans les variables Vercel :</p>
          <p><strong>GOOGLE_REFRESH_TOKEN</strong></p>
          <code style="background:#222;padding:16px;display:block;word-break:break-all;border-radius:8px;font-size:13px">
            ${tokens.refresh_token || '⚠️ Pas de refresh_token — relancez /api/auth?action=login'}
          </code>
        </body></html>
      `);
    } catch (err) {
      return res.status(500).send('Erreur OAuth : ' + err.message);
    }
  }

  return res.status(400).send('Paramètre manquant : ?action=login ou ?code=...');
};
