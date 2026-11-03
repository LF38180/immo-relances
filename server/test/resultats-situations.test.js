// Situations à plusieurs, projet « mise en location », investissement locatif.
//
// Les colonnes historiques portent un CHECK figé : les nouvelles valeurs vont
// dans trois colonnes à côté, et les anciennes sont recopiées quand la valeur
// y est admise. Le test fige cette recopie et l'absence d'écrasement.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'situ-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('a@t.fr','x','Alex','Agent','conseiller','LE QUAI',1), ('m@t.fr','x','Marie','Manager','manager',NULL,1)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const req = async (methode, url, corps, email = 'a@t.fr') => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
    method: methode, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null); srv.close();
  return { statut: r.status, corps: j };
};
db.prepare(`INSERT INTO op_contacts (id_modelo, nom, prenom, conseiller, agence, script, courrier_etat, a_dispatcher, tel_portable, role)
  VALUES ('S-1','N','P','Alex Agent','LE QUAI',1,'ENVOYE',0,'0639980001','ACQUEREUR')`).run();
const lire = () => db.prepare('SELECT * FROM op_resultats WHERE id_modelo = ?').get('S-1');

(async () => {
  let r = await req('PUT', '/operation/contacts/S-1/resultat', { situations: 'PROPRIETAIRE,BAILLEUR', projet_type: 'MISE_EN_LOCATION', investissement_locatif: 1 });
  t('enregistré', () => eq(r.statut, 200, JSON.stringify(r.corps)));
  t('situations à plusieurs, ancienne colonne recopiée', () => {
    eq(lire().situations, 'PROPRIETAIRE,BAILLEUR'); eq(lire().statut_actuel, 'PROPRIETAIRE');
  });
  t('mise en location : projet_type porté, projet historique intact (null)', () => {
    eq(lire().projet_type, 'MISE_EN_LOCATION'); eq(lire().projet, null);
  });
  t('investissement locatif', () => eq(lire().investissement_locatif, 1));

  r = await req('PUT', '/operation/contacts/S-1/resultat', { projet_type: 'VENTE', projet_echeance: 6 });
  t('un projet admis par l\'ancienne colonne y est recopié', () => { eq(lire().projet, 'VENTE'); eq(lire().projet_type, 'VENTE'); });

  r = await req('PUT', '/operation/contacts/S-1/resultat', { situations: 'BAILLEUR' });
  t('bailleur seul : situations mise à jour, statut_actuel conservé', () => {
    eq(lire().situations, 'BAILLEUR'); eq(lire().statut_actuel, 'PROPRIETAIRE');
  });

  r = await req('PUT', '/operation/contacts/S-1/resultat', { situations: 'PIRATE,LOCATAIRE', projet_type: 'INCONNU' });
  t('valeurs hors liste ignorées', () => { eq(lire().situations, 'LOCATAIRE'); eq(lire().projet_type, null); });

  const l = await req('GET', '/operation/listing', null, 'm@t.fr');
  t('le listing expose les trois champs', () => {
    const x = l.corps.lignes.find(y => y.id_modelo === 'S-1');
    eq(x.situations, 'LOCATAIRE'); eq(x.investissement_locatif, 1); eq('projet_type' in x, true);
  });
  const acc = await req('GET', '/operation/mon-acces');
  t('la fiche compte comme à jour', () => eq(acc.corps.bilan.fiches_a_jour, 1));

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
