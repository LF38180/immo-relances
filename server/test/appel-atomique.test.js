// L'appel et la saisie s'écrivent ensemble, ou pas du tout.
//
// Avant, l'écran envoyait deux requêtes : POST /appel puis PUT /resultat. Une
// coupure réseau entre les deux — une seconde en mobilité suffit — laissait
// l'appel enregistré et la saisie perdue, avec un message d'erreur qui faisait
// croire à l'agent que rien n'était passé. Il recommençait, et créait un
// deuxième appel sur la même fiche.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atom-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif)
  VALUES ('a@lequai-immobilier.com','x','Alex','Agent','conseiller','LE QUAI',1)
  ON CONFLICT(email) DO UPDATE SET actif=1`).run();

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const req = async (methode, url, corps) => {
  const u = db.prepare("SELECT * FROM users WHERE email='a@lequai-immobilier.com'").get();
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null);
  srv.close();
  return { statut: r.status, corps: j };
};

const contact = (id) => db.prepare(`INSERT INTO op_contacts
  (id_modelo,nom,prenom,conseiller,agence,script,courrier_etat,a_dispatcher)
  VALUES (?,?,'P','Alex Agent','LE QUAI',1,'ENVOYE',0)`).run(id, 'N' + id);

(async () => {
  console.log('\nl\'appel et la saisie partent ensemble');
  contact('X-1');
  const r = await req('POST', '/operation/contacts/X-1/appel', {
    issue: 'JOINT', duree_sec: 300,
    resultat: { adresse_maj: '8 rue des Lilas', commune_maj: 'Crolles',
      actualisation: 'ACCEPTEE', soiree: 1 },
  });
  t('la requête aboutit', () => eq(r.statut, 201, JSON.stringify(r.corps)));
  t('l\'appel est enregistré', () => {
    eq(db.prepare("SELECT COUNT(*) n FROM op_appels WHERE id_modelo='X-1'").get().n, 1);
  });
  t('la saisie est enregistrée dans la même requête', () => {
    const res = db.prepare("SELECT * FROM op_resultats WHERE id_modelo='X-1'").get();
    vrai(res, 'aucun résultat écrit');
    eq(res.adresse_maj, '8 rue des Lilas');
    eq(res.actualisation, 'ACCEPTEE');
    eq(res.soiree, 1);
  });
  t('la saisie est rattachée au bon appel', () => {
    const a = db.prepare("SELECT id FROM op_appels WHERE id_modelo='X-1'").get();
    const res = db.prepare("SELECT appel_id FROM op_resultats WHERE id_modelo='X-1'").get();
    eq(res.appel_id, a.id);
  });
  t('le serveur dit ce qu\'il a écrit', () => {
    vrai(Array.isArray(r.corps.champs_enregistres), JSON.stringify(r.corps.champs_enregistres));
    vrai(r.corps.champs_enregistres.includes('adresse_maj'));
  });
  t('le journal garde une trace', () => {
    const n = db.prepare("SELECT COUNT(*) n FROM op_resultats_journal WHERE id_modelo='X-1'").get().n;
    vrai(n >= 1, 'rien au journal');
  });

  console.log('\nrien ne se perd si la saisie est invalide');
  contact('X-2');
  const r2 = await req('POST', '/operation/contacts/X-2/appel', {
    issue: 'JOINT',
    // Valeur refusée par la contrainte CHECK : la transaction entière doit
    // être annulée, sinon l'appel resterait sans sa saisie.
    resultat: { statut_actuel: 'VALEUR_INVALIDE' },
  });
  t('la requête échoue proprement', () => vrai(r2.statut >= 400, `statut ${r2.statut}`));
  t('aucun appel orphelin n\'est resté', () => {
    eq(db.prepare("SELECT COUNT(*) n FROM op_appels WHERE id_modelo='X-2'").get().n, 0,
      'un appel a été écrit alors que la saisie a échoué');
  });

  console.log('\nun appel sans saisie reste possible');
  contact('X-3');
  const r3 = await req('POST', '/operation/contacts/X-3/appel', { issue: 'PAS_DE_REPONSE' });
  t('l\'appel seul passe', () => eq(r3.statut, 201, JSON.stringify(r3.corps)));
  t('aucun résultat vide n\'est créé', () => {
    eq(db.prepare("SELECT COUNT(*) n FROM op_resultats WHERE id_modelo='X-3'").get().n, 0);
  });
  t('champs_enregistres vaut null', () => eq(r3.corps.champs_enregistres, null));

  console.log('\nla correction depuis le récapitulatif marche toujours');
  const r4 = await req('PUT', '/operation/contacts/X-1/resultat', { soiree: 0 });
  t('la route de correction répond', () => eq(r4.statut, 200, JSON.stringify(r4.corps)));
  t('la correction est appliquée', () => {
    eq(db.prepare("SELECT soiree FROM op_resultats WHERE id_modelo='X-1'").get().soiree, 0);
  });
  t('l\'adresse saisie plus tôt n\'est pas écrasée', () => {
    eq(db.prepare("SELECT adresse_maj FROM op_resultats WHERE id_modelo='X-1'").get().adresse_maj,
      '8 rue des Lilas');
  });
  t('la correction est journalisée', () => {
    const n = db.prepare("SELECT COUNT(*) n FROM op_resultats_journal WHERE id_modelo='X-1'").get().n;
    vrai(n >= 2, `journal: ${n} entrées`);
  });

  console.log('\nun rappel sans créneau reste refusé');
  contact('X-4');
  const r5 = await req('POST', '/operation/contacts/X-4/appel', { issue: 'A_RAPPELER' });
  t('refusé', () => eq(r5.statut, 400));
  t('aucun appel écrit', () => {
    eq(db.prepare("SELECT COUNT(*) n FROM op_appels WHERE id_modelo='X-4'").get().n, 0);
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
