// Report vers Modelo : l'export « à reporter », son commentaire, le retour.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'modelo-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('adm@t.fr','x','Ada','Admin','admin',NULL,1), ('a@t.fr','x','Lilas','FERKOUS','conseiller','LE QUAI',1)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const req = async (email, methode, url, corps) => {
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
const fiche = (id, nom, extra = {}) => {
  const c = { id_modelo: id, nom, prenom: 'Paul', conseiller: 'Lilas FERKOUS', agence: 'LE QUAI', script: 1, courrier_etat: 'ENVOYE',
    a_dispatcher: 0, tel_portable: '0639980001', email: 'paul@ex.fr', adresse: '1 rue A', code_postal: '38000', commune: 'Grenoble', role: 'ACQUEREUR', ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};
fiche('M-1', 'DURAND'); fiche('M-2', 'MARTIN'); fiche('M-3', 'REFUS'); fiche('M-4', 'VIDE');

(async () => {
  // M-1 : répondeur hier, puis joint aujourd'hui avec résultat.
  db.prepare("INSERT INTO op_appels (id_modelo, conseiller, issue, horodatage) VALUES ('M-1','Lilas FERKOUS','REPONDEUR', datetime('now','-1 day'))").run();
  let r = await req('a@t.fr', 'POST', '/operation/contacts/M-1/appel', { issue: 'JOINT', notes: 'Très content', resultat: {
    situations: 'PROPRIETAIRE,BAILLEUR', projet_type: 'VENTE', projet_echeance: 6, actualisation: 'ACCEPTEE', date_rdv: '2026-11-07',
    soiree: 1, adresse_maj: '5 rue B', code_postal_maj: '38100', commune_maj: 'Grenoble', email_maj: 'nouveau@ex.fr',
    recommandation_nom: 'Sophie LEROY', recommandation_tel: '0600000000', recommandation_motif: 'vend sa maison', investissement_locatif: 1, tel_portable_maj: '0611111111' } });
  eq(r.statut, 201);
  // M-2 : seulement un répondeur → pas de note.
  db.prepare("INSERT INTO op_appels (id_modelo, conseiller, issue, horodatage) VALUES ('M-2','Lilas FERKOUS','REPONDEUR', datetime('now'))").run();
  // M-3 : refus ferme.
  r = await req('a@t.fr', 'POST', '/operation/contacts/M-3/appel', { issue: 'REFUS_FERME' });

  // M-4 : une ligne de résultat vide, sans appel (essai d'avant l'opération).
  db.prepare("INSERT INTO op_resultats (id_modelo) VALUES ('M-4')").run();
  let e = await req('adm@t.fr', 'GET', '/operation/modelo/a-reporter');
  t('deux fiches à reporter, pas le répondeur seul ni la fiche vide', () => {
    eq(e.statut, 200); eq(e.corps.fiches.map(f => f.id_modelo).sort().join(','), 'M-1,M-3');
  });
  const m1 = e.corps.fiches.find(f => f.id_modelo === 'M-1');
  t('commentaire au format convenu', () => {
    vrai(m1.commentaire.startsWith('[OPÉ ANCIENS CLIENTS 2026] ['), m1.commentaire);
    vrai(m1.commentaire.includes('— Lilas FERKOUS] Joint.'), m1.commentaire);
    for (const s of ['Propriétaire et bailleur.', 'investissement locatif', 'Projet : vente d\'ici 6 mois.', 'Actualisation de la valeur acceptée, RDV le 07/11.',
      'Soirée du 3 décembre : oui.', 'Nouvelle adresse : 5 rue B, 38100, Grenoble.', 'Nouvel e-mail : nouveau@ex.fr.', 'Recommandation : Sophie LEROY', 'Note : « Très content »', 'Tentatives : '])
      vrai(m1.commentaire.includes(s), 'manque : ' + s + ' dans ' + m1.commentaire);
    vrai(/Tentatives : \d\d\/\d\d répondeur\./.test(m1.commentaire), m1.commentaire);
  });
  t('champs avant / après', () => {
    eq(m1.email_avant, 'paul@ex.fr'); eq(m1.email_apres, 'nouveau@ex.fr');
    eq(m1.tel_port_avant, '0639980001'); eq(m1.tel_port_apres, '0611111111'); eq(m1.tel_fixe_apres, ''); vrai(m1.commentaire.includes('Nouveau portable : 0611111111.'));
    eq(m1.adresse_avant, '1 rue A'); eq(m1.adresse_apres, '5 rue B'); eq(m1.cp_apres, '38100'); eq(m1.commune_apres, '');
    eq(m1.stop_tel, 0); eq(m1.stop_mail, 0); eq(m1.agent, 'Lilas FERKOUS'); vrai(/^\d\d-\d\d-\d{4}$/.test(m1.date_note), m1.date_note);
    vrai(m1.a_proposer_a_loick.includes('Recommandation'));
  });
  t('refus ferme : stop tel et stop mail à 1, note de refus', () => {
    const m3 = e.corps.fiches.find(f => f.id_modelo === 'M-3');
    eq(m3.stop_tel, 1); eq(m3.stop_mail, 1); vrai(m3.commentaire.includes('Refus de démarchage'));
  });
  t('fichier des recommandations', () => {
    eq(e.corps.recommandations.length, 1); eq(e.corps.recommandations[0].nom, 'Sophie LEROY'); eq(e.corps.recommandations[0].id_modelo, 'M-1');
  });

  r = await req('adm@t.fr', 'POST', '/operation/modelo/retour', { lignes: [
    { id_modelo: 'M-1', statut: 'reporté', champs_modifies: 'email,adresse', horodatage: '2026-11-04 11:00:00', jusqu_a: m1.jusqu_a },
    { id_modelo: 'M-3', statut: 'échec', motif_echec: 'identité' },
    { id_modelo: 'X-9', statut: 'reporté' },
  ] });
  t('retour : marquage, échec tracé, inconnue signalée', () => {
    eq(r.statut, 200); eq(r.corps.reportees, 1); eq(r.corps.echecs, 1); eq(r.corps.inconnues.length, 1);
    vrai(db.prepare("SELECT modelo_reporte_le FROM op_contacts WHERE id_modelo='M-1'").get().modelo_reporte_le);
    eq(db.prepare("SELECT COUNT(*) n FROM op_modelo_reports").get().n, 2);
  });
  e = await req('adm@t.fr', 'GET', '/operation/modelo/a-reporter');
  t('M-1 reportée sort de l\'export, M-3 en échec y reste', () => eq(e.corps.fiches.map(f => f.id_modelo).join(','), 'M-3'));

  await new Promise(res => setTimeout(res, 1100));
  r = await req('a@t.fr', 'POST', '/operation/contacts/M-1/appel', { issue: 'A_RAPPELER', rappel_le: '2026-11-10T15:00' });
  e = await req('adm@t.fr', 'GET', '/operation/modelo/a-reporter');
  t('un nouvel appel après le report remet la fiche dans l\'export, sans les anciennes tentatives', () => {
    const f = e.corps.fiches.find(x => x.id_modelo === 'M-1');
    vrai(f, 'M-1 absente'); vrai(f.commentaire.includes('à rappeler le 10/11 à 15h00'), f.commentaire); vrai(!f.commentaire.includes('Tentatives'), f.commentaire);
  });
  const c = await req('a@t.fr', 'GET', '/operation/modelo/a-reporter');
  t('réservé à l\'admin', () => eq(c.statut, 403));

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
