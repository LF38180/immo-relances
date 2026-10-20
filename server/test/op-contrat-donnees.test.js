// Contrat de données du 20 octobre 2026.
//
// Chaque chiffre du contrat devient ici une assertion. Si l'un d'eux ne tombe
// pas juste après import, c'est qu'une règle n'a pas été appliquée — et ce
// test le dit avant que quinze conseillers ne s'en aperçoivent au téléphone.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = path.join(os.tmpdir(), 'op-contrat-test-' + Date.now() + '.db');
process.env.DB_PATH = tmp;

const { db } = require('../src/database');
const I = require('../src/utils/opImport');

console.log('op-contrat-donnees.test.js');
const t = (n, fn) => { try { fn(); console.log('  OK  ' + n) } catch (e) { console.error('  FAIL ' + n + ' : ' + e.message); process.exitCode = 1 } };

// Le fichier de référence vit dans le dépôt : un test qui lit le dossier
// Téléchargements casse dès que le fichier y est remplacé — ce qui est arrivé.
const CSV = require('path').join(__dirname, 'donnees', 'anciens-clients.csv');
if (!fs.existsSync(CSV)) {
  console.log('  -- fichier source absent, contrat non vérifié');
  process.exit(0);
}
I.importer(fs.readFileSync(CSV, 'utf8'), { motDePasseProvisoire: 'Provisoire2026' });

const n = (sql, ...a) => db.prepare(sql).get(...a).n;

// --- §9 : les quatre contrôles d'après import ------------------------------
t('1088 lignes importées', () => assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts'), 1088));

t('729 + 52 + 261 + 46 = 1088 sur courrier_etat', () => {
  const att = { ENVOYE: 729, NON_IMPRIME: 52, A_APPELER: 261, A_TRANCHER: 46 };
  let somme = 0;
  for (const [etat, v] of Object.entries(att)) {
    const r = n('SELECT COUNT(*) n FROM op_contacts WHERE courrier_etat=?', etat);
    assert.strictEqual(r, v, `${etat} : ${r} au lieu de ${v}`);
    somme += r;
  }
  assert.strictEqual(somme, 1088);
});

t('513 + 234 + 216 + 125 = 1088 sur script', () => {
  const att = { 1: 513, 2: 234, 3: 216, 4: 125 };
  let somme = 0;
  for (const [s, v] of Object.entries(att)) {
    const r = n('SELECT COUNT(*) n FROM op_contacts WHERE script=?', Number(s));
    assert.strictEqual(r, v, `script ${s} : ${r} au lieu de ${v}`);
    somme += r;
  }
  assert.strictEqual(somme, 1088);
});

t('725 attribués + 363 à dispatcher = 1088', () => {
  const att = n('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher=0');
  const dis = n('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher=1');
  assert.strictEqual(att, 725); assert.strictEqual(dis, 363);
  assert.strictEqual(att + dis, 1088);
});

// --- §1 : le portefeuille de chaque conseiller -----------------------------
t('les 15 portefeuilles sont exacts', () => {
  const att = {
    'Tara ZOPPAS': 149, 'Lynda GUDINCI': 115, 'Jérôme PAGLIARO': 83,
    'Gilles BORGHIN': 63, 'Jérémy TINE': 62, 'Jérémy BERTRAND': 51,
    'Hervé MARTIN': 41, 'Yasmina MAHDJOUB': 38, 'Virginie DURAND': 36,
    'Marine ROSAIN': 31, 'Nathalie ALBIN': 25, 'Alexandre DUDOUET': 20,
    'Chrystelle BAJULAZ': 9, 'Nolan BARRETO': 1, 'Lilas FERKOUS': 1,
  };
  let somme = 0;
  for (const [nom, v] of Object.entries(att)) {
    const r = n('SELECT COUNT(*) n FROM op_contacts WHERE conseiller=?', nom);
    assert.strictEqual(r, v, `${nom} : ${r} au lieu de ${v}`);
    somme += r;
  }
  assert.strictEqual(somme, 725, 'la somme des portefeuilles doit faire 725');
});

t('les orphelins ont conseiller vide ET a_dispatcher=1', () => {
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher=1 AND conseiller IS NOT NULL'), 0,
    'un orphelin a un conseiller renseigné');
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher=0 AND conseiller IS NULL'), 0,
    'une fiche attribuée est sans conseiller');
});

t('Cindy Bertrand n est attributaire de rien', () => {
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE conseiller LIKE '%Cindy%'"), 0);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE suggestion_base='ANOMALIE_CINDY'"), 23);
});

t('les 23 fiches Cindy se répartissent en 7 et 16', () => {
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE suggestion_base='ANOMALIE_CINDY' AND situation LIKE '%fiche au nom de%'"), 7);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE suggestion_base='ANOMALIE_CINDY' AND situation NOT LIKE '%fiche au nom de%'"), 16);
});

t('Saint-Égrève : 267 contacts, 6 conseillers, aucun orphelin', () => {
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE agence LIKE '%ÉGRÈVE%'"), 267);
  const c = db.prepare("SELECT DISTINCT conseiller FROM op_contacts WHERE agence LIKE '%ÉGRÈVE%' AND conseiller IS NOT NULL").all().map(x => x.conseiller).sort();
  assert.deepStrictEqual(c, ['Alexandre DUDOUET', 'Gilles BORGHIN', 'Hervé MARTIN', 'Jérôme PAGLIARO', 'Nathalie ALBIN', 'Virginie DURAND']);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE agence LIKE '%ÉGRÈVE%' AND a_dispatcher=1"), 0);
});

// --- §3 : le script --------------------------------------------------------
t('dossier_repris = 341 = scripts 3 et 4', () => {
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE dossier_repris=1'), 341);
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE script IN (3,4)'), 341);
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE dossier_repris=1 AND script NOT IN (3,4)'), 0,
    'un dossier repris n a pas le script 3 ou 4');
});

t('prenom_a_dire renseigné sur les 341 fiches des scripts 3 et 4', () => {
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE prenom_a_dire IS NOT NULL'), 341);
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE script IN (3,4) AND prenom_a_dire IS NULL'), 0,
    'un script 3 ou 4 est sans prénom à dire : l ouverture sonnerait faux');
});

// --- §4 : les quatre objectifs ---------------------------------------------
t('46 fiches à vérifier avant d appel', () => {
  // Identité non établie : appariées sur un seul mot du nom, ou sans
  // correspondance au registre des 663 ventes.
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE a_verifier=1'), 46);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE a_verifier=1 AND courrier_etat<>'A_TRANCHER'"), 0,
    'une fiche à vérifier qui ne soit pas « à trancher »');
});

t('307 fiches sans adresse fiable', () => {
  // L'information demeure — c'est elle qui affiche « sa fiche porte l'adresse
  // du bien qu'il a vendu » — mais ce n'est plus un objectif à part.
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE adresse_fiable=0'), 307);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE adresse_fiable=0 AND courrier_etat='A_APPELER'"), 261);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE adresse_fiable=0 AND courrier_etat='A_TRANCHER'"), 46);
});

// --- §6 : les blocages -----------------------------------------------------
t('11 stop téléphone, 38 stop mail', () => {
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE stop_telephone=1'), 11);
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE stop_mail=1'), 38);
});

// --- §2 : les fiches corrigeables ------------------------------------------
t('22 fiches à corriger, toutes en NON_IMPRIME', () => {
  assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE fiche_a_corriger=1'), 22);
  assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE fiche_a_corriger=1 AND courrier_etat<>'NON_IMPRIME'"), 0);
});

// --- §1 : les accès --------------------------------------------------------
t('16 accès : 15 conseillers plus Loïck', () => {
  const avecContacts = db.prepare('SELECT COUNT(DISTINCT conseiller) n FROM op_contacts WHERE conseiller IS NOT NULL').get().n;
  assert.strictEqual(avecContacts, 15, 'conseillers ayant des contacts : ' + avecContacts);
  const sansCompte = db.prepare(`
    SELECT DISTINCT conseiller FROM op_contacts WHERE conseiller IS NOT NULL
      AND LOWER(TRIM(conseiller)) NOT IN (SELECT LOWER(TRIM(prenom || ' ' || nom)) FROM users)`).all();
  assert.strictEqual(sansCompte.length, 0, 'sans compte : ' + JSON.stringify(sansCompte));
});

db.close();
for (const s of ['', '-wal', '-shm']) fs.rmSync(tmp + s, { force: true });
