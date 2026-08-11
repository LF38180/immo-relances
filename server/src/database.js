const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'immo.db');

require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('agent', 'manager', 'admin', 'courtage')),
    actif INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT,
    telephone TEXT,
    telephone2 TEXT,
    email TEXT,
    adresse TEXT,
    code_postal TEXT,
    ville TEXT,
    categorie TEXT NOT NULL DEFAULT 'autre' CHECK(categorie IN ('ancien_client','prospect_chaud','prospect_froid','acquereur','vendeur','autre')),
    tags TEXT DEFAULT '[]',
    notes TEXT,
    score_priorite INTEGER NOT NULL DEFAULT 50,
    prochain_contact TEXT,
    statut TEXT NOT NULL DEFAULT 'a_contacter' CHECK(statut IN ('a_contacter','tente_sans_reponse','rappel_planifie','rdv_obtenu','pas_interesse','a_recontacter','inactif')),
    date_dernier_contact TEXT,
    nombre_tentatives INTEGER NOT NULL DEFAULT 0,
    potentiel INTEGER NOT NULL DEFAULT 3 CHECK(potentiel BETWEEN 1 AND 5),
    source_import TEXT,
    assigned_to INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS relances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES users(id),
    statut TEXT NOT NULL CHECK(statut IN ('tente_sans_reponse','contacte','rdv_obtenu','pas_interesse','rappel_planifie','message_laisse')),
    notes TEXT,
    duree_appel INTEGER,
    prochain_contact TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categorie TEXT NOT NULL,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    ordre INTEGER NOT NULL DEFAULT 0,
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parametres (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_contacts_statut ON contacts(statut);
  CREATE INDEX IF NOT EXISTS idx_contacts_categorie ON contacts(categorie);
  CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(score_priorite DESC);
  CREATE INDEX IF NOT EXISTS idx_contacts_prochain ON contacts(prochain_contact);
  CREATE INDEX IF NOT EXISTS idx_relances_contact ON relances(contact_id);
  CREATE INDEX IF NOT EXISTS idx_relances_agent ON relances(agent_id);
  CREATE INDEX IF NOT EXISTS idx_relances_date ON relances(created_at);
`);

// Migration idempotente : colonnes ajoutées après coup
const contactCols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name);
if (!contactCols.includes('date_estimation')) db.exec("ALTER TABLE contacts ADD COLUMN date_estimation TEXT");
if (!contactCols.includes('photo_url')) db.exec("ALTER TABLE contacts ADD COLUMN photo_url TEXT");
if (!contactCols.includes('suivi_par_origine')) db.exec("ALTER TABLE contacts ADD COLUMN suivi_par_origine TEXT");
if (!contactCols.includes('civilite')) db.exec("ALTER TABLE contacts ADD COLUMN civilite TEXT");
const relanceCols = db.prepare("PRAGMA table_info(relances)").all().map(c => c.name);
if (!relanceCols.includes('type')) db.exec("ALTER TABLE relances ADD COLUMN type TEXT NOT NULL DEFAULT 'appel'");
if (!relanceCols.includes('issue')) db.exec("ALTER TABLE relances ADD COLUMN issue TEXT");
// Dernière connexion (horodatage UTC du dernier login réussi), affiché côté admin.
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('last_login')) db.exec("ALTER TABLE users ADD COLUMN last_login TEXT");

// Migration rôle 'courtage' : SQLite ne modifie pas un CHECK en place -> table-swap.
// FK-safe : relances.agent_id et contacts.assigned_to référencent users ; si les FK
// sont actives (cas prod), DROP TABLE users échoue et laisse users_new résiduelle
// -> crash en boucle. Procédure sûre : FK OFF avant, transaction, DROP IF EXISTS d'abord.
// NB : l'ALTER last_login ci-dessus DOIT s'exécuter AVANT ce bloc (le SELECT lit last_login).
{
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (sql && /CHECK\(role IN/.test(sql.sql) && !/'courtage'/.test(sql.sql)) {
    db.pragma('foreign_keys = OFF');
    const swap = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS users_new');
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL, prenom TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('agent','manager','admin','courtage')),
          actif INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login TEXT
        );
        INSERT INTO users_new (id,nom,prenom,email,password,role,actif,created_at,last_login)
          SELECT id,nom,prenom,email,password,role,actif,created_at,last_login FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    swap();
    db.pragma('foreign_keys = ON');
  }
}
// Ceinture : colonne must_change_password si base créée avant cette version.
const uCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!uCols.includes('must_change_password')) db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");

// Tables courtage (espace cloisonné Marine) — aucune interaction avec contacts/relances.
db.exec(`
  CREATE TABLE IF NOT EXISTS courtage_fiches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL, prenom TEXT,
    telephone TEXT, telephone_norm TEXT,
    mail TEXT, mail_norm TEXT,
    date_contact TEXT,
    montant_projet TEXT,
    reference_bien TEXT,
    source TEXT DEFAULT 'CI Facile',
    attribution_cr TEXT, capacite_emprunt TEXT,
    categorie TEXT NOT NULL DEFAULT 'manuel',
    priorite INTEGER NOT NULL DEFAULT 1,
    statut TEXT NOT NULL DEFAULT 'en_relance' CHECK(statut IN
      ('a_qualifier','en_relance','simulation_faite','dossier_en_cours',
       'gagne','perdu','injoignable','ne_plus_contacter')),
    prochaine_relance TEXT,
    tentatives_sans_reponse INTEGER NOT NULL DEFAULT 0,
    mail_propose_le TEXT,
    commentaire TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_courtage_fiches_relance ON courtage_fiches(prochaine_relance);
  CREATE INDEX IF NOT EXISTS idx_courtage_fiches_tel ON courtage_fiches(telephone_norm);
  CREATE TABLE IF NOT EXISTS courtage_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiche_id INTEGER NOT NULL REFERENCES courtage_fiches(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('creation','relance','pas_de_reponse','trop_tot','mail_propose','statut')),
    commentaire TEXT, prochaine_relance TEXT,
    statut_avant TEXT, statut_apres TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_courtage_actions_fiche ON courtage_actions(fiche_id);
  CREATE TABLE IF NOT EXISTS courtage_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telephone_norm TEXT, mail_norm TEXT, motif TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS courtage_demandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiche_id INTEGER NOT NULL REFERENCES courtage_fiches(id) ON DELETE CASCADE,
    reference_bien TEXT, date_demande TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Import du cahier des messages (courtage V2) — journal ligne a ligne (idempotence)
// et bilan par import.
db.exec(`
  CREATE TABLE IF NOT EXISTS courtage_import_lignes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT UNIQUE NOT NULL, onglet TEXT, ligne INTEGER,
    fiche_id INTEGER REFERENCES courtage_fiches(id) ON DELETE SET NULL,
    resultat TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_courtage_import_hash ON courtage_import_lignes(hash);
  CREATE TABLE IF NOT EXISTS courtage_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, fichier TEXT,
    simulation INTEGER NOT NULL DEFAULT 0,
    lignes_lues INTEGER, creees INTEGER, doublons INTEGER, exclues INTEGER,
    blacklistees INTEGER, ignorees INTEGER, deja_importees INTEGER,
    detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Colonnes d'origine sur les fiches (idempotent : bases creees avant la V2).
const fCols = db.prepare('PRAGMA table_info(courtage_fiches)').all().map((c) => c.name);
if (!fCols.includes('source_onglet')) db.exec('ALTER TABLE courtage_fiches ADD COLUMN source_onglet TEXT');
if (!fCols.includes('source_ligne')) db.exec('ALTER TABLE courtage_fiches ADD COLUMN source_ligne INTEGER');
if (!fCols.includes('suivi_lead')) db.exec('ALTER TABLE courtage_fiches ADD COLUMN suivi_lead TEXT');

// Seed default admin
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@lequai-immobilier.com');
if (!existingAdmin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)`).run('Admin', 'Le Quai', 'admin@lequai-immobilier.com', hash, 'admin');

  const agentHash = bcrypt.hashSync('agent123', 10);
  db.prepare(`INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)`).run('Dupont', 'Marie', 'agent@lequai-immobilier.com', agentHash, 'agent');

  const managerHash = bcrypt.hashSync('manager123', 10);
  db.prepare(`INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)`).run('Martin', 'Pierre', 'manager@lequai-immobilier.com', managerHash, 'manager');
}

// Default parametres
const defaultParams = [
  ['delai_sans_reponse_jours', '3'],
  ['relance_sans_projet_jours', '180'],
  ['score_ancien_client', '80'],
  ['score_prospect_chaud', '70'],
  ['score_prospect_froid', '40'],
  ['score_acquereur', '65'],
  ['score_vendeur', '75'],
  ['score_autre', '30'],
  ['delai_recontact_jours', '90'],
];
const insertParam = db.prepare('INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)');
defaultParams.forEach(([k, v]) => insertParam.run(k, v));

// Paramètres courtage (modifiables via l'admin, sans redéploiement).
[['courtage_delai_relance_jours', '7'],
 ['courtage_tentatives_max', '2'],
 ['courtage_tel_marine', ''],
 ['courtage_mail_objet', 'Votre projet immobilier — étude de financement'],
 ['courtage_mail_corps',
`Bonjour [Prénom],

Vous avez récemment contacté notre agence au sujet d'un bien [BIEN] et manifesté un intérêt pour une étude de financement. Je me tiens à votre disposition pour en parler et vous proposer une simulation personnalisée, gratuite et sans engagement.

Vous pouvez me joindre au [TEL_MARINE] ou répondre directement à ce message.

Bien cordialement,
Marine Rosain — Conseillère en financement
Le Quai de l'Immobilier`],
 ['courtage_exclusion_agents', 'POITEVIN Lyes,BARRETO Nolan'],
 // Import V2 : latence par categorie (jours) et heuristique de classement OUI Gabby.
 ['courtage_latence_oui_agent', '0'],
 ['courtage_latence_oui_gabby', '3'],
 ['courtage_latence_a_qualifier', '7'],
 ['courtage_heuristique_gabby', 'PS_OUI'],
].forEach(([c, v]) => insertParam.run(c, v));

// Seed Marine (rôle courtage) — idempotent.
const marine = db.prepare('SELECT id FROM users WHERE email = ?').get('marine.rosain@lequai-immobilier.com');
if (!marine) {
  db.prepare('INSERT INTO users (nom, prenom, email, password, role, must_change_password) VALUES (?,?,?,?,?,1)')
    .run('Rosain', 'Marine', 'marine.rosain@lequai-immobilier.com', bcrypt.hashSync('MarineLeQuai', 10), 'courtage');
}
// TEMPORAIRE : Loïck teste le compte Marine avec le mot de passe convenu — on désactive
// le changement obligatoire. AVANT de remettre les accès à Marine : supprimer cette ligne
// et repasser must_change_password à 1 (le mécanisme de gate reste en place et testé).
db.prepare("UPDATE users SET must_change_password = 0 WHERE email = 'marine.rosain@lequai-immobilier.com'").run();

// Default scripts
const existingScripts = db.prepare('SELECT COUNT(*) as cnt FROM scripts').get();
if (existingScripts.cnt === 0) {
  const scripts = [
    ['ancien_client', 'Réactivation ancien client', `Bonjour, je suis [Prénom] de l'agence [Nom agence]. Je me permets de vous appeler car vous avez déjà travaillé avec nous par le passé et je souhaitais prendre de vos nouvelles.

Avez-vous toujours votre projet immobilier ? Avez-vous un bien à vendre ou cherchez-vous à acquérir quelque chose ?

[Écouter et rebondir]

Je serais ravi(e) de vous rencontrer pour faire le point sur le marché dans votre secteur. Êtes-vous disponible cette semaine ou la semaine prochaine ?`, 1],
    ['prospect_chaud', 'Prospect chaud - Suivi', `Bonjour [Prénom], c'est [Votre prénom] de [Agence]. Je vous avais rencontré / vous m'aviez contacté récemment concernant votre projet immobilier.

Je voulais savoir où vous en étiez ? Avez-vous avancé dans votre réflexion ?

[Si acheteur] : Avez-vous eu l'occasion de visiter des biens ? Votre budget est-il confirmé ?
[Si vendeur] : Avez-vous pris une décision concernant la mise en vente ?

Je peux vous proposer un rendez-vous cette semaine pour...`, 1],
    ['prospect_froid', 'Prospect froid - Réactivation', `Bonjour, je suis [Prénom] de l'agence [Nom agence]. Vous nous avez contactés il y a quelque temps concernant un projet immobilier.

Je me permets de vous rappeler car le marché a évolué et j'ai peut-être des opportunités qui pourraient vous intéresser.

Votre projet est-il toujours d'actualité ?`, 1],
    ['acquereur', 'Acquéreur - Suivi recherche', `Bonjour [Prénom], c'est [Votre prénom] de [Agence]. J'ai pensé à vous car nous venons d'avoir une nouvelle entrée qui correspond à vos critères de recherche.

[Décrire brièvement le bien]

Seriez-vous disponible pour une visite rapidement ? Ces biens partent vite en ce moment.`, 1],
    ['vendeur', 'Vendeur - Estimation gratuite', `Bonjour, je suis [Prénom] de l'agence [Nom agence]. Je vous contacte car nous sommes très actifs dans votre secteur en ce moment et j'aimerais vous proposer une estimation gratuite et sans engagement de votre bien.

Le marché est favorable pour les vendeurs actuellement. Seriez-vous intéressé(e) par une évaluation ?`, 1],
  ];
  const insertScript = db.prepare('INSERT INTO scripts (categorie, titre, contenu, ordre) VALUES (?, ?, ?, ?)');
  scripts.forEach(s => insertScript.run(...s));
}

// Score recalculation function
function recalculerScore(contactId) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return;

  const params = {};
  db.prepare('SELECT cle, valeur FROM parametres').all().forEach(r => params[r.cle] = r.valeur);

  let score = parseInt(params[`score_${contact.categorie}`] || 50);

  // Ancienneté dernier contact
  if (contact.date_dernier_contact) {
    const jours = Math.floor((Date.now() - new Date(contact.date_dernier_contact).getTime()) / 86400000);
    if (jours > 365) score += 20;
    else if (jours > 180) score += 10;
    else if (jours < 30) score -= 15;
  } else {
    score += 25; // jamais contacté = priorité haute
  }

  // Potentiel
  score += (contact.potentiel - 3) * 10;

  // Tentatives sans réponse
  if (contact.nombre_tentatives > 5) score -= 20;
  else if (contact.nombre_tentatives > 3) score -= 10;

  score = Math.max(0, Math.min(100, score));
  db.prepare('UPDATE contacts SET score_priorite = ? WHERE id = ?').run(score, contactId);
}

module.exports = { db, recalculerScore, DB_PATH };
