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
// Migration rôle 'conseiller' + colonne agence (opération anciens clients).
// Même procédure FK-safe que ci-dessus : CHECK non modifiable en place, et
// op_appels.user_id référence users -> DROP TABLE échouerait FK actives.
//
// 'conseiller' plutôt que de réutiliser 'agent' : un conseiller de l'opération
// ne doit pas hériter des écrans de relance classique, et inversement.
// La colonne agence restreint un manager à son agence (Saint-Égrève) ; vide =
// voit tout, ce qui laisse le comportement actuel inchangé pour l'existant.
{
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (sql && /CHECK\(role IN/.test(sql.sql) && !/'conseiller'/.test(sql.sql)) {
    db.pragma('foreign_keys = OFF');
    const swap = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS users_new');
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL, prenom TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'agent'
            CHECK(role IN ('agent','manager','admin','courtage','conseiller')),
          actif INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login TEXT,
          agence TEXT
        );
        INSERT INTO users_new (id,nom,prenom,email,password,role,actif,must_change_password,created_at,last_login)
          SELECT id,nom,prenom,email,password,role,actif,must_change_password,created_at,last_login FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    swap();
    db.pragma('foreign_keys = ON');
  }
}
// Ceinture : la colonne agence si le table-swap ci-dessus a déjà eu lieu.
{
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('agence')) db.exec("ALTER TABLE users ADD COLUMN agence TEXT");
}

// Ceinture : colonne must_change_password si base créée avant cette version.
const uCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!uCols.includes('must_change_password')) db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");

// Migration : ajoute le statut 'faux_numero' au CHECK de courtage_fiches.
// SQLite ne modifie pas un CHECK en place -> table-swap. courtage_actions et
// courtage_demandes referencent courtage_fiches : FK OFF + transaction + DROP IF EXISTS.
function migrerStatutsCourtage() {
  const t = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='courtage_fiches'").get();
  if (!t || /'faux_numero'/.test(t.sql)) return;
  const colonnes = db.prepare('PRAGMA table_info(courtage_fiches)').all().map((c) => c.name).join(',');
  const nouveau = t.sql
    .replace(/CREATE TABLE\s+courtage_fiches/i, 'CREATE TABLE courtage_fiches_new')
    .replace("'gagne','perdu','injoignable','ne_plus_contacter'", "'gagne','perdu','injoignable','ne_plus_contacter','faux_numero'");
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS courtage_fiches_new');
    db.exec(nouveau);
    db.exec(`INSERT INTO courtage_fiches_new (${colonnes}) SELECT ${colonnes} FROM courtage_fiches`);
    db.exec('DROP TABLE courtage_fiches');
    db.exec('ALTER TABLE courtage_fiches_new RENAME TO courtage_fiches');
    db.exec('CREATE INDEX IF NOT EXISTS idx_courtage_fiches_relance ON courtage_fiches(prochaine_relance)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_courtage_fiches_tel ON courtage_fiches(telephone_norm)');
  })();
  db.pragma('foreign_keys = ON');
}

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
       'gagne','perdu','injoignable','ne_plus_contacter','faux_numero')),
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

// Applique la migration du CHECK statut sur les bases creees avant 'faux_numero'.
migrerStatutsCourtage();

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

// Comptes de démarrage, créés seulement s'ils manquent.
//
// Chaque compte est vérifié séparément : le bloc précédent n'en testait qu'un
// et en insérait trois, si bien qu'un admin renommé faisait échouer le
// démarrage sur une contrainte d'unicité — serveur mort, base intacte mais
// application inaccessible.
const COMPTES_DEPART = [
  { nom: 'Admin', prenom: 'Le Quai', email: 'admin@lequai-immobilier.com', mdp: 'admin123', role: 'admin' },
  { nom: 'Dupont', prenom: 'Marie', email: 'agent@lequai-immobilier.com', mdp: 'agent123', role: 'agent' },
  { nom: 'Martin', prenom: 'Pierre', email: 'manager@lequai-immobilier.com', mdp: 'manager123', role: 'manager' },
];
{
  const existe = db.prepare('SELECT id FROM users WHERE email = ?');
  const creer = db.prepare('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)');
  // Un seul compte suffit à considérer la base initialisée : sans cela, un
  // compte de démonstration supprimé volontairement reviendrait à chaque
  // redémarrage.
  const dejaInitialisee = db.prepare('SELECT COUNT(*) n FROM users').get().n > 0;
  if (!dejaInitialisee) {
    for (const c of COMPTES_DEPART) {
      if (!existe.get(c.email)) creer.run(c.nom, c.prenom, c.email, bcrypt.hashSync(c.mdp, 10), c.role);
    }
  }
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


// ---------------------------------------------------------------------------
// Opération anciens clients — module cloisonné (tables op_*).
//
// Même principe que l'espace courtage : rien de ce qui suit ne touche aux
// contacts, relances ou fiches courtage. Les contacts viennent d'un import
// Modelo et vivent uniquement ici.
//
// L'identifiant Modelo est la clé partout : c'est lui qui permettra de
// réinjecter les adresses recueillies et les oppositions dans Modelo. Le perdre
// rendrait l'opération sans lendemain.
db.exec(`
  CREATE TABLE IF NOT EXISTS op_contacts (
    id_modelo TEXT PRIMARY KEY,

    -- Attribution. a_dispatcher = 1 : la fiche n'est dans la file de personne.
    a_dispatcher INTEGER NOT NULL DEFAULT 0,
    conseiller TEXT,
    suggestion_conseiller TEXT,
    suggestion_base TEXT,
    situation TEXT,

    -- Script : calculé à l'import, jamais recalculé (il dépend du conseiller
    -- précédent, donnée Modelo que l'application n'a pas).
    conseiller_precedent TEXT,
    prenom_a_dire TEXT,
    dossier_repris INTEGER NOT NULL DEFAULT 0,
    script INTEGER NOT NULL CHECK(script BETWEEN 1 AND 4),

    courrier_etat TEXT NOT NULL DEFAULT 'A_APPELER'
      CHECK(courrier_etat IN ('ENVOYE','NON_IMPRIME','A_APPELER','A_TRANCHER')),
    courrier_motif TEXT,

    role TEXT NOT NULL DEFAULT 'INCONNU'
      CHECK(role IN ('ACQUEREUR','VENDEUR','INCONNU')),
    civilite TEXT, nom TEXT NOT NULL, prenom TEXT,
    adresse TEXT, complement TEXT, code_postal TEXT, commune TEXT,
    adresse_fiable INTEGER NOT NULL DEFAULT 1,
    tel_portable TEXT, tel_fixe TEXT,
    email TEXT, email_valide INTEGER NOT NULL DEFAULT 1,

    -- Bloquants : vérifiés côté serveur, pas seulement à l'écran.
    stop_telephone INTEGER NOT NULL DEFAULT 0,
    stop_mail INTEGER NOT NULL DEFAULT 0,

    bien_concerne TEXT,
    partie_au_registre TEXT,
    agence TEXT, secteur TEXT,
    objectif_principal TEXT NOT NULL DEFAULT 'ACTUALISATION'
      CHECK(objectif_principal IN ('ADRESSE','ACTUALISATION')),
    fiche_a_corriger INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_op_contacts_conseiller ON op_contacts(conseiller);
  CREATE INDEX IF NOT EXISTS idx_op_contacts_dispatch   ON op_contacts(a_dispatcher);
  CREATE INDEX IF NOT EXISTS idx_op_contacts_agence     ON op_contacts(agence);

  -- Une ligne par tentative d'appel, y compris les sonneries dans le vide :
  -- c'est cette table qui fait foi pour le plafond légal de 4 appels par mois.
  CREATE TABLE IF NOT EXISTS op_appels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_modelo TEXT NOT NULL REFERENCES op_contacts(id_modelo) ON DELETE CASCADE,
    conseiller TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    horodatage TEXT NOT NULL DEFAULT (datetime('now')),
    issue TEXT NOT NULL CHECK(issue IN (
      'JOINT','REPONDEUR','PAS_DE_REPONSE','FAUX_NUMERO','A_RAPPELER',
      -- SUIVI_ANCIEN_CONSEILLER n'est plus proposée à l'écran (retirée le
      -- 20 octobre) mais reste acceptée : la retirer du CHECK imposerait de
      -- reconstruire la table en production pour interdire une valeur que
      -- plus rien n'envoie.
      'REFUS_FERME','ERREUR_IDENTITE','SUIVI_ANCIEN_CONSEILLER','DECEDE')),
    rappel_le TEXT,
    duree_sec INTEGER,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_op_appels_contact ON op_appels(id_modelo, horodatage DESC);
  CREATE INDEX IF NOT EXISTS idx_op_appels_date    ON op_appels(horodatage);

  -- Ce qu'on a recueilli. Une ligne par contact, créée au premier appel abouti
  -- puis complétée : un client peut en dire plus au deuxième appel.
  CREATE TABLE IF NOT EXISTS op_resultats (
    id_modelo TEXT PRIMARY KEY REFERENCES op_contacts(id_modelo) ON DELETE CASCADE,

    adresse_maj TEXT, complement_maj TEXT, code_postal_maj TEXT, commune_maj TEXT,
    courrier_renvoye INTEGER NOT NULL DEFAULT 0,
    date_renvoi TEXT,

    toujours_proprietaire INTEGER,
    revendu_quand TEXT, revendu_par_qui TEXT,
    statut_actuel TEXT CHECK(statut_actuel IN ('PROPRIETAIRE','LOCATAIRE','HEBERGE')),

    projet TEXT CHECK(projet IN ('VENTE','ACHAT','INVESTISSEMENT','AUCUN')),
    projet_echeance INTEGER,

    actualisation TEXT CHECK(actualisation IN ('ACCEPTEE','REFUSEE','A_REPROPOSER')),
    date_rdv TEXT,
    soiree INTEGER NOT NULL DEFAULT 0,
    panneau INTEGER NOT NULL DEFAULT 0,

    recommandation_nom TEXT,
    recommandation_mode TEXT CHECK(recommandation_mode IN ('JE_LAPPELLE','IL_FAIT_LE_LIEN')),

    -- Consentement recueilli pendant l'appel : c'est lui qui rend l'opération
    -- défendable (loi du 30 juin 2025).
    consentement_tel INTEGER,
    date_consentement TEXT,

    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Journal des oppositions : append-only, conservation trois ans, consultable
  -- par la personne qui le demande (décret du 23 juillet 2026). Aucune route
  -- de suppression ni de modification n'existe sur cette table.
  CREATE TABLE IF NOT EXISTS op_journal_opposition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_modelo TEXT NOT NULL,
    horodatage TEXT NOT NULL DEFAULT (datetime('now')),
    canal TEXT NOT NULL DEFAULT 'TELEPHONE' CHECK(canal IN ('TELEPHONE','MAIL')),
    origine TEXT NOT NULL DEFAULT 'APPEL',
    agent TEXT,
    nom TEXT, prenom TEXT, telephone TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_op_opposition_contact ON op_journal_opposition(id_modelo);

  -- Exclus de l'opération : chargés en liste noire, jamais en file d'appel.
  CREATE TABLE IF NOT EXISTS op_exclus (
    id_modelo TEXT PRIMARY KEY,
    nom TEXT, prenom TEXT, motif TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS op_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    fichier TEXT,
    simulation INTEGER NOT NULL DEFAULT 0,
    lignes_lues INTEGER NOT NULL DEFAULT 0,
    creees INTEGER NOT NULL DEFAULT 0,
    majs INTEGER NOT NULL DEFAULT 0,
    ignorees INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Trace des appels passés hors du cadre légal (hors plage, au-delà du plafond,
// ou vers une personne opposée au démarchage). Les règles avertissent sans
// bloquer — décision du 20 octobre, les conseillers en répondent. Mais un
// avertissement ignoré sans trace ne protège personne : horodaté, il montre
// que l'agence informait.
{
  const cols = db.prepare("PRAGMA table_info(op_appels)").all().map(c => c.name);
  if (!cols.includes('hors_cadre')) db.exec("ALTER TABLE op_appels ADD COLUMN hors_cadre TEXT");
}

// L'adresse mail recueillie au téléphone, quand celle de la fiche était celle
// d'un conseiller. On ne remplace pas l'originale : elle sert à retrouver la
// bonne dans Modelo, et l'écart se voit à l'export.
{
  const cols = db.prepare("PRAGMA table_info(op_resultats)").all().map(c => c.name);
  if (!cols.includes('email_maj')) db.exec("ALTER TABLE op_resultats ADD COLUMN email_maj TEXT");
}

// « Rien n'a changé » est une information, pas une absence d'information.
//
// Sans ce champ, un agent qui vérifie l'adresse et la trouve bonne ne touche à
// rien : la fiche n'est pas comptée comme à jour, et au prochain appel
// personne ne saura qu'elle a déjà été vérifiée. On enregistre donc la
// confirmation, avec sa date.
{
  const cols = db.prepare("PRAGMA table_info(op_resultats)").all().map(c => c.name);
  if (!cols.includes('fiche_confirmee')) db.exec("ALTER TABLE op_resultats ADD COLUMN fiche_confirmee INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes('confirmee_le')) db.exec("ALTER TABLE op_resultats ADD COLUMN confirmee_le TEXT");
}

// Le drapeau vient désormais du fichier Modelo : `a_verifier` remplace la
// déduction sur courrier_etat. Et `objectif_principal` est abandonné — il
// portait l'opposition adresse / actualisation, qui n'a plus de sens depuis que
// les quatre objectifs sont au même rang.
{
  const cols = db.prepare("PRAGMA table_info(op_contacts)").all().map(c => c.name);
  if (!cols.includes('a_verifier')) db.exec("ALTER TABLE op_contacts ADD COLUMN a_verifier INTEGER NOT NULL DEFAULT 0");
}

// Liste noire : 191 personnes écartées de l'opération, avec leur motif. Elles
// ne doivent jamais entrer dans une file d'appel, et si l'une réapparaît dans
// un import Modelo, le motif explique pourquoi elle avait été sortie.
{
  const cols = db.prepare("PRAGMA table_info(op_exclus)").all().map(c => c.name);
  if (!cols.includes('conseiller')) db.exec("ALTER TABLE op_exclus ADD COLUMN conseiller TEXT");
}

// Les 46 fiches dont l'identité n'est pas établie : appariées sur un seul mot
// du nom, ou sans correspondance au registre des ventes. Les appeler sans
// vérifier, c'est risquer de raconter à un inconnu qu'un tiers a vendu un bien.
// Elles sortent de la file tant que `verifie` est nul.
{
  const cols = db.prepare("PRAGMA table_info(op_contacts)").all().map(c => c.name);
  if (!cols.includes('verifie')) db.exec("ALTER TABLE op_contacts ADD COLUMN verifie TEXT");
  if (!cols.includes('verifie_par')) db.exec("ALTER TABLE op_contacts ADD COLUMN verifie_par TEXT");
}

// op_resultats porte une ligne par CONTACT. C'est juste pour l'état courant
// d'une fiche — l'adresse d'une personne n'a qu'une valeur — mais ça perd le
// détail de qui a recueilli quoi, et à quel appel.
//
// Conséquence constatée : corriger le résultat d'un appel dans le
// récapitulatif écrasait ce qui avait été saisi lors d'un autre appel du même
// contact. Sur 149 fiches à deux ou trois tentatives, c'est systématique.
//
// On garde op_resultats comme état courant (c'est ce que lisent le pilotage et
// l'écran d'appel) et on ajoute l'attribution : quel appel a produit cette
// ligne. Le récapitulatif ne propose alors de corriger que le dernier appel
// ayant recueilli quelque chose.
{
  const cols = db.prepare("PRAGMA table_info(op_resultats)").all().map(c => c.name);
  if (!cols.includes('appel_id')) db.exec("ALTER TABLE op_resultats ADD COLUMN appel_id INTEGER");
  if (!cols.includes('saisi_par')) db.exec("ALTER TABLE op_resultats ADD COLUMN saisi_par TEXT");
}

// Journal des modifications d'un résultat : qui a changé quoi, et quand.
// Sans lui, une correction écrase sans laisser de trace — et le client peut
// demander à lire sa fiche.
db.exec(`
  CREATE TABLE IF NOT EXISTS op_resultats_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_modelo TEXT NOT NULL,
    appel_id INTEGER,
    auteur TEXT,
    horodatage TEXT NOT NULL DEFAULT (datetime('now')),
    champs TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_op_res_journal ON op_resultats_journal(id_modelo, horodatage DESC);
`);

// Le bien, découpé pour être prononçable. « JP-4793 T5 et plus, 18 Avenue de
// l'Europe 38120 Saint egreve » ne se dit pas au téléphone ; « l'appartement
// du 18 Avenue de l'Europe, à Saint-Égrève » si. Renseigné sur 1 084 fiches.
{
  const cols = db.prepare("PRAGMA table_info(op_contacts)").all().map(c => c.name);
  if (!cols.includes('bien_type')) db.exec("ALTER TABLE op_contacts ADD COLUMN bien_type TEXT");
  if (!cols.includes('bien_voie')) db.exec("ALTER TABLE op_contacts ADD COLUMN bien_voie TEXT");
  if (!cols.includes('bien_commune')) db.exec("ALTER TABLE op_contacts ADD COLUMN bien_commune TEXT");
}

// NPAI : le courrier est revenu « n'habite pas à l'adresse indiquée ». Les plis
// sont partis la semaine du 16 octobre ; les retours arriveront pendant
// l'opération. Loïck les saisit au fil de l'eau, ce qui bascule la fiche en
// objectif adresse.
{
  const cols = db.prepare("PRAGMA table_info(op_resultats)").all().map(c => c.name);
  if (!cols.includes('npai')) db.exec("ALTER TABLE op_resultats ADD COLUMN npai INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes('npai_le')) db.exec("ALTER TABLE op_resultats ADD COLUMN npai_le TEXT");
}

// Le NPAI est aussi porté par op_contacts, et pour la même raison
// qu'adresse_fiable : l'écran d'appel doit l'annoncer, et les quatre requêtes
// qui alimentent la file, la recherche et la fiche lisent op_contacts sans
// jointure. La trace datée reste dans op_resultats ; ici, c'est le drapeau qui
// suit la fiche partout. Les retours déjà saisis sont recopiés : sans ce
// rattrapage, les quarante premiers NPAI garderaient un contexte d'appel faux.
{
  const cols = db.prepare("PRAGMA table_info(op_contacts)").all().map(c => c.name);
  if (!cols.includes('npai')) {
    db.exec("ALTER TABLE op_contacts ADD COLUMN npai INTEGER NOT NULL DEFAULT 0");
    db.exec(`UPDATE op_contacts SET npai = 1 WHERE id_modelo IN (
      SELECT id_modelo FROM op_resultats WHERE npai = 1)`);
  }
}

// Recommandation : un nom seul ne se rappelle pas. Sans numéro ni motif, la
// personne signalée reste dans la fiche et personne ne la contacte.
{
  const cols = db.prepare("PRAGMA table_info(op_resultats)").all().map(c => c.name);
  if (!cols.includes('recommandation_tel')) db.exec("ALTER TABLE op_resultats ADD COLUMN recommandation_tel TEXT");
  if (!cols.includes('recommandation_email')) db.exec("ALTER TABLE op_resultats ADD COLUMN recommandation_email TEXT");
  if (!cols.includes('recommandation_motif')) db.exec("ALTER TABLE op_resultats ADD COLUMN recommandation_motif TEXT");
}

// Point d'attention sur une fiche : une phrase affichée en évidence dans la
// liste de dispatch et sur l'écran d'appel. Sert aux cas qui demandent un
// arbitrage humain plutôt qu'une règle — les 23 fiches rattachées à Cindy
// Bertrand, qui ne fait pas de transaction, et que Loïck reprend à son nom.
{
  const cols = db.prepare("PRAGMA table_info(op_contacts)").all().map(c => c.name);
  if (!cols.includes('point_attention')) db.exec("ALTER TABLE op_contacts ADD COLUMN point_attention TEXT");
}

module.exports = { db, recalculerScore, DB_PATH };
