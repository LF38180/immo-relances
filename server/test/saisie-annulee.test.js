// Annuler un choix Oui/Non ne doit pas faire perdre tout l'appel.
//
// Quatre colonnes de op_resultats sont NOT NULL DEFAULT 0 : soiree, panneau,
// courrier_renvoye, fiche_confirmee. À l'écran, re-cliquer un bouton déjà
// choisi le désélectionne et envoie null — c'est le seul geste offert pour
// annuler un oui. SQLite refusait alors TOUTE l'écriture, et l'agent perdait
// l'adresse, le projet et la recommandation recueillis au téléphone, avec pour
// seul message « Enregistrement impossible ».
//
// Scénario réel : le client dit oui à la soirée, puis se ravise.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'annul-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

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
  console.log('\nle client se ravise sur la soirée');
  contact('A-1');
  const r = await req('POST', '/operation/contacts/A-1/appel', {
    issue: 'JOINT',
    resultat: {
      adresse_maj: '8 rue des Lilas', commune_maj: 'Crolles',
      projet: 'VENTE', recommandation_nom: 'Paul Voisin',
      soiree: null,          // re-cliqué pour annuler
      panneau: null,
    },
  });
  t('l\'appel est accepté', () => eq(r.statut, 201, JSON.stringify(r.corps)));
  t('l\'adresse recueillie est conservée', () => {
    eq(db.prepare("SELECT adresse_maj FROM op_resultats WHERE id_modelo='A-1'").get()?.adresse_maj,
      '8 rue des Lilas');
  });
  t('le projet est conservé', () => {
    eq(db.prepare("SELECT projet FROM op_resultats WHERE id_modelo='A-1'").get().projet, 'VENTE');
  });
  t('la recommandation est conservée', () => {
    eq(db.prepare("SELECT recommandation_nom FROM op_resultats WHERE id_modelo='A-1'").get()
      .recommandation_nom, 'Paul Voisin');
  });
  t('annuler la soirée vaut « non », pas « inconnu »', () => {
    eq(db.prepare("SELECT soiree FROM op_resultats WHERE id_modelo='A-1'").get().soiree, 0);
  });
  t('idem pour le panneau', () => {
    eq(db.prepare("SELECT panneau FROM op_resultats WHERE id_modelo='A-1'").get().panneau, 0);
  });

  console.log('\nles quatre colonnes NOT NULL, une par une');
  for (const champ of ['soiree', 'panneau', 'courrier_renvoye', 'fiche_confirmee']) {
    const id = 'B-' + champ;
    contact(id);
    const rr = await req('POST', `/operation/contacts/${id}/appel`, {
      issue: 'JOINT', resultat: { adresse_maj: 'x', [champ]: null },
    });
    t(`${champ} à null ne casse rien`, () => {
      eq(rr.statut, 201, JSON.stringify(rr.corps));
      eq(db.prepare(`SELECT ${champ} AS v FROM op_resultats WHERE id_modelo=?`).get(id).v, 0);
      eq(db.prepare("SELECT adresse_maj FROM op_resultats WHERE id_modelo=?").get(id).adresse_maj, 'x');
    });
  }

  console.log('\ncorriger depuis le récapitulatif');
  // L'écran de correction envoie null sur soiree/panneau quand ils n'ont
  // jamais été renseignés : c'est le cas de la majorité des appels.
  contact('C-1');
  await req('POST', '/operation/contacts/C-1/appel', { issue: 'JOINT' });
  const rc = await req('PUT', '/operation/contacts/C-1/resultat', {
    adresse_maj: '3 place du Marché', soiree: null, panneau: null,
  });
  t('la correction aboutit', () => eq(rc.statut, 200, JSON.stringify(rc.corps)));
  t('l\'adresse corrigée est enregistrée', () => {
    eq(db.prepare("SELECT adresse_maj FROM op_resultats WHERE id_modelo='C-1'").get().adresse_maj,
      '3 place du Marché');
  });

  console.log('\nun oui reste un oui');
  contact('D-1');
  await req('POST', '/operation/contacts/D-1/appel', {
    issue: 'JOINT', resultat: { soiree: 1, panneau: 1, fiche_confirmee: 1 },
  });
  t('les vrais oui ne sont pas écrasés', () => {
    const r2 = db.prepare("SELECT soiree,panneau,fiche_confirmee FROM op_resultats WHERE id_modelo='D-1'").get();
    eq(r2.soiree, 1); eq(r2.panneau, 1); eq(r2.fiche_confirmee, 1);
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
