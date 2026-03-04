// api/auth.js
// Étape 1 : GET /auth/login  → redirige vers Google
// Étape 2 : GET /auth/callback → reçoit le code, affiche le refresh_token

const { getOAuthClient } = require('../lib/google');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send'
];

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  // ── /auth/login ──────────────────────────────────────────
  if (path.endsWith('/login')) {
    const oauth2Client = getOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES
    });
    return res.redirect(authUrl);
  }

  // ── /auth/callback ───────────────────────────────────────
  if (path.endsWith('/callback')) {
    const code = url.searchParams.get('code');
    if (!code) {
      return res.status(400).send('Code manquant');
    }

    try {
      const oauth2Client = getOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);

      // Affiche le refresh_token à copier dans les variables Vercel
      return res.status(200).send(`
        <html><body style="font-family:monospace;padding:40px;background:#111;color:#01F66B">
          <h2 style="color:#fff">✅ Authentification réussie !</h2>
          <p style="color:#aaa">Copiez ce refresh_token dans les variables d'environnement Vercel :</p>
          <p><strong>GOOGLE_REFRESH_TOKEN</strong></p>
          <code style="background:#222;padding:16px;display:block;word-break:break-all;border-radius:8px;font-size:13px">
            ${tokens.refresh_token || '⚠️ Pas de refresh_token — relancez /auth/login'}
          </code>
          <p style="color:#aaa;margin-top:24px">Vous pouvez fermer cette page.</p>
        </body></html>
      `);
    } catch (err) {
      return res.status(500).send('Erreur OAuth : ' + err.message);
    }
  }

  return res.status(404).send('Route inconnue');
};
