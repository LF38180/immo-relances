const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Compression gzip des réponses (listes de contacts, etc.) — gain net sur mobile/4G.
app.use(compression());
app.use(cors({ origin: isProd ? false : 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/relances', require('./routes/relanceRoutes'));
app.use('/api/scripts', require('./routes/scriptRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// En production : servir le build React
if (isProd) {
  // Depuis la racine du projet : client/dist
  const clientBuild = path.join(process.cwd(), 'client', 'dist');
  app.use(express.static(clientBuild, {
    setHeaders: (res, filePath) => {
      // Assets hashés (nom unique par build) = cache permanent. index.html = jamais caché (pointe les bons hash).
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (_, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  // Sauvegarde DB quotidienne vers GitHub (si token configuré)
  if (isProd) {
    try { require('./backup').demarrerPlanificateur(); } catch (e) { console.error('[backup] init: ' + e.message); }
  }
});
