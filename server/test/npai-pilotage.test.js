// La synthèse des courriers revenus, et la liste des fiches enrichies.
//
// Deux besoins du 29 octobre : recouper le nombre de NPAI saisis avec la pile
// de plis, et retrouver les fiches dont un agent a mis les infos à jour.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npai-pil-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

const mk = (email, prenom, nom, role) => db.prepare(
  `INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES (?,'x',?,?,?,'LE QUAI',1)
   ON CONFLICT(email) DO UPDATE SET role = excluded.role, actif = 1`).run(email, prenom, nom, role);
mk('manager@lequai-immobilier.com', 'Marie', 'Manager', 'manager');
mk('agent@lequai-immobilier.com', 'Alex', 'Agent', 'conseiller');

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const jeton = (email) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
};
const req = async (methode, url, email, corps) => {
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton(email)}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null);
  srv.close();
  return { statut: r.status, corps: j };
};

const contact = (id, extra = {}) => {
  const c = { id_modelo: id, nom: 'N' + id, prenom: 'P', conseiller: 'Alex Agent',
    agence: 'LE QUAI', script: 1, courrier_etat: 'ENVOYE', a_dispatcher: 0, ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};

const MANAGER = 'manager@lequai-immobilier.com';

(async () => {
  // Deux NPAI chez Alex, un sans conseiller, un contact sain.
  contact('A-1'); contact('A-2'); contact('A-3', { conseiller: null, a_dispatcher: 1 });
  contact('A-4');
  for (const id of ['A-1', 'A-2', 'A-3']) {
    await req('POST', `/operation/contacts/${id}/npai`, MANAGER, { npai: true });
  }

  console.log('\nsynthèse du pilotage');
  const p = await req('GET', '/operation/pilotage', MANAGER);
  t('le pilotage répond', () => eq(p.statut, 200, JSON.stringify(p.corps)));
  t('le total des NPAI est juste', () => eq(p.corps.npai.total, 3));
  t('les NPAI sans conseiller sont comptés à part', () => eq(p.corps.npai.a_dispatcher, 1));

  t('la répartition par conseiller donne le portefeuille', () => {
    const alex = p.corps.npai.par_conseiller.find(c => c.conseiller === 'Alex Agent');
    vrai(alex, 'Alex absent de la répartition');
    eq(alex.npai, 2, 'npai d\'Alex');
    eq(alex.portefeuille, 3, 'portefeuille d\'Alex (A-1, A-2, A-4)');
  });

  t('la saisie du jour est regroupée par date', () => {
    const jours = p.corps.npai.par_jour;
    eq(jours.length, 1, 'un seul jour de saisie');
    eq(jours[0].n, 3, 'trois retours ce jour');
  });

  console.log('\nla liste des fiches NPAI');
  const l = await req('GET', '/operation/npai', MANAGER);
  t('la liste répond et compte juste', () => {
    eq(l.statut, 200);
    eq(l.corps.total, 3);
  });
  t('les fiches portent la date du retour', () => {
    vrai(l.corps.lignes.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.npai_le)),
      JSON.stringify(l.corps.lignes.map(x => x.npai_le)));
  });
  t('un contact sain n\'y est pas', () => {
    vrai(!l.corps.lignes.some(x => x.id_modelo === 'A-4'));
  });
  t('un conseiller ne voit pas cette liste', async () => {});
  const l2 = await req('GET', '/operation/npai', 'agent@lequai-immobilier.com');
  t('la liste est réservée au pilotage', () => eq(l2.statut, 403, JSON.stringify(l2.corps)));

  console.log('\nadresse récupérée au téléphone');
  db.prepare(`UPDATE op_resultats SET adresse_maj = '12 rue Neuve', commune_maj = 'Crolles'
    WHERE id_modelo = 'A-1'`).run();
  const l3 = await req('GET', '/operation/npai', MANAGER);
  t('le rattrapage des adresses est compté', () => eq(l3.corps.adresse_recuperee, 1));

  console.log('\nle listing porte ce que les agents ont recueilli');
  db.prepare(`INSERT INTO op_resultats (id_modelo, statut_actuel, projet, recommandation_nom,
    recommandation_tel, fiche_confirmee)
    VALUES ('A-4', 'LOCATAIRE', 'VENTE', 'Paul Voisin', '0612345678', 1)
    ON CONFLICT(id_modelo) DO UPDATE SET statut_actuel = excluded.statut_actuel`).run();

  const li = await req('GET', '/operation/listing', MANAGER);
  t('le listing répond', () => eq(li.statut, 200, JSON.stringify(li.corps)?.slice(0, 200)));

  t('le listing expose npai', () => {
    const a1 = li.corps.lignes.find(x => x.id_modelo === 'A-1');
    eq(a1.npai, 1);
  });

  t('le listing expose les champs recueillis', () => {
    const a4 = li.corps.lignes.find(x => x.id_modelo === 'A-4');
    eq(a4.statut_actuel, 'LOCATAIRE');
    eq(a4.projet, 'VENTE');
    eq(a4.recommandation_tel, '0612345678');
    eq(a4.fiche_confirmee, 1);
    vrai(a4.fiche_maj_le, 'date de mise à jour absente');
  });

  t('le listing expose la nouvelle adresse en entier', () => {
    const a1 = li.corps.lignes.find(x => x.id_modelo === 'A-1');
    eq(a1.adresse_maj, '12 rue Neuve');
    eq(a1.commune_maj, 'Crolles');
  });

  console.log('\nle titre du script dit que le courrier est revenu');
  const S = require('../src/utils/opScripts.js');
  t('script 1 NPAI : « courrier revenu »', () => {
    const e = S.enTete({ script: 1, npai: 1, nom: 'X', prenom: 'Y' });
    vrai(/revenu/.test(e.titre), e.titre);
    vrai(!/reçu/.test(e.titre), `le titre dit encore « reçu » : ${e.titre}`);
  });
  t('script 3 NPAI garde « dossier repris »', () => {
    const e = S.enTete({ script: 3, npai: 1, nom: 'X', prenom: 'Y' });
    vrai(/Dossier repris/.test(e.titre), e.titre);
    vrai(/revenu/.test(e.titre), e.titre);
  });
  t('le PDF ne change pas : on ne bascule pas de script', () => {
    eq(S.enTete({ script: 1, npai: 1 }).pdf, S.enTete({ script: 1 }).pdf);
  });
  t('le numéro de script ne change pas non plus', () => {
    eq(S.enTete({ script: 3, npai: 1 }).script, 3);
  });
  t('sans NPAI le titre est inchangé', () => {
    eq(S.enTete({ script: 1 }).titre, 'Son client · courrier reçu');
  });
  t('l\'en-tête porte le drapeau npai pour l\'écran d\'appel', () => {
    eq(S.enTete({ script: 1, npai: 1 }).npai, 1);
    eq(S.enTete({ script: 1 }).npai, 0);
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
