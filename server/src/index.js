// Fuseau horaire, AVANT tout require : la règle des plages légales
// (10h-13h, 14h-20h) et l'échéance des rappels lisent l'heure locale du
// serveur. Railway tourne en UTC : sans cette ligne, en novembre, chaque
// appel de 10h à 11h était tracé « hors plage » à tort, et ceux de 13h à 14h
// et de 20h à 21h ne l'étaient pas — des traces légales fausses toute la
// journée. Forcé sans condition : l'application sert une agence en Isère, et
// une variable TZ=UTC posée par l'hébergeur ne doit pas pouvoir l'emporter.
process.env.TZ = 'Europe/Paris';

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Compression gzip des réponses (listes de contacts, etc.) — gain net sur mobile/4G.
app.use(compression());
app.use(cors({ origin: isProd ? false : ['http://localhost:5173', 'http://localhost:5180'], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/relances', require('./routes/relanceRoutes'));
app.use('/api/scripts', require('./routes/scriptRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/courtage', require('./routes/courtageRoutes'));
app.use('/api/operation', require('./routes/opRoutes'));

// Public, sans donnée métier ni chemin : de quoi vérifier après un
// déploiement que le fuseau est bon et que la base a survécu (sa taille
// chuterait à quelques centaines de Ko si elle avait été recréée vide).
app.get('/api/health', (_, res) => {
  const { DB_PATH } = require('./database');
  let base = null;
  try { const st = require('fs').statSync(DB_PATH); base = { octets: st.size, modifiee_le: st.mtime.toISOString() }; }
  catch { base = { octets: null }; }
  const maintenant = new Date();

  // Des compteurs, jamais des noms ni des données clients : de quoi laisser
  // un contrôle automatique (ou un simple coup d'œil) repérer une mauvaise
  // surprise avant les agents — un manager qui ne verrait rien, un conseiller
  // sans fiche, une sauvegarde qui ne tourne plus.
  let controles = null;
  try {
    const { db } = require('./database');
    const S = require('./sauvegarde');
    const sauvegardes = S.lister();
    controles = {
      fuseau_ok: Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Paris',
      sauvegarde: { nombre: sauvegardes.length, derniere_le: sauvegardes[0]?.le || null },
      conseillers_sans_fiche: db.prepare(`SELECT COUNT(*) n FROM users u
        WHERE u.actif = 1 AND u.role = 'conseiller'
          AND NOT EXISTS (SELECT 1 FROM op_contacts c
            WHERE sans_casse(c.conseiller) = sans_casse(u.prenom || ' ' || u.nom) AND c.a_dispatcher = 0)`).get().n,
      managers_sans_fiche: db.prepare(`SELECT COUNT(*) n FROM users u
        WHERE u.actif = 1 AND u.role = 'manager' AND u.agence IS NOT NULL AND TRIM(u.agence) <> ''
          AND NOT EXISTS (SELECT 1 FROM op_contacts c WHERE sans_casse(c.agence) = sans_casse(u.agence))`).get().n,
      fiches_sans_compte: db.prepare(`SELECT COUNT(*) n FROM op_contacts c
        WHERE c.a_dispatcher = 0 AND c.conseiller IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.actif = 1
            AND sans_casse(u.prenom || ' ' || u.nom) = sans_casse(c.conseiller))`).get().n,
      sans_numero: db.prepare(`SELECT COUNT(*) n FROM op_contacts
        WHERE a_dispatcher = 0 AND NULLIF(TRIM(COALESCE(tel_portable,'')),'') IS NULL
          AND NULLIF(TRIM(COALESCE(tel_fixe,'')),'') IS NULL`).get().n,
      a_repartir: db.prepare('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher = 1').get().n,
      npai: db.prepare('SELECT COUNT(*) n FROM op_contacts WHERE npai = 1').get().n,
      appels_aujourdhui: db.prepare(`SELECT COUNT(*) n FROM op_appels
        WHERE date(horodatage, 'localtime') = date('now', 'localtime')`).get().n,
    };
  } catch (e) { controles = { erreur: String(e.message || e) }; }

  res.json({
    status: 'ok',
    time: maintenant.toISOString(),
    fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
    heure_locale: maintenant.toLocaleString('fr-FR'),
    base,
    controles,
  });
});

// Filet : une erreur imprévue sur une route d'API doit rester du JSON.
//
// Sans ce gestionnaire, Express renvoie une page HTML d'erreur : le client lit
// `err.response.data.error`, n'y trouve rien, et affiche un message générique.
// L'agent ne sait pas ce qui s'est passé, et personne n'en garde la trace.
//
// Placé après les routes d'API et avant le service des fichiers statiques :
// une route inconnue reste traitée par le catch-all React.
app.use('/api', (err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} —`, err);
  if (res.headersSent) return;
  // Le détail n'est montré qu'en développement : un message d'erreur SQLite
  // révèle la structure de la base.
  res.status(err.status || 500).json({
    error: isProd ? "Une erreur est survenue. Réessayez, et prévenez Loïck si cela recommence."
                  : String(err.message || err),
  });
});

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
  // Un fichier versionné qui n'existe plus (ancien déploiement) reçoit un 404
  // franc, pas la page d'accueil : servie en 200 sous l'URL d'un script, elle
  // était mise en cache par le service worker à la place du script, et un
  // onglet resté ouvert sur l'ancienne version ne s'en remettait plus.
  app.get('/assets/*', (_, res) => res.status(404).end());
  app.get('*', (_, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  // Sauvegarde périodique de la base, à côté d'elle. Démarrée après l'écoute
  // pour ne pas retarder le premier service.
  require('./sauvegarde').planifier();
});
