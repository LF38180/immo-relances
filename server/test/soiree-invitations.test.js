// Soirée du 3 décembre : tri des invitations, export par vagues, import « envoyé ».
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soiree-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif) VALUES
  ('adm@t.fr','x','Ada','Admin','admin',1), ('m@t.fr','x','Marie','Manager','manager',1),
  ('t@t.fr','x','Tom','Suivi','manager',1), ('a@t.fr','x','Alex','Agent','conseiller',1)`).run();
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
const fiche = (id, extra = {}) => {
  const c = { id_modelo: id, nom: 'Nom' + id, prenom: 'Pré', conseiller: 'Alex Agent', agence: 'LE QUAI',
    script: 1, courrier_etat: 'ENVOYE', a_dispatcher: 0, email: id.toLowerCase() + '@ex.fr', ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};
const appel = (id, issue, par = 'Alex Agent') =>
  db.prepare('INSERT INTO op_appels (id_modelo, conseiller, issue) VALUES (?,?,?)').run(id, par, issue);
const resultat = (id, soiree, extra = {}) => {
  const c = { id_modelo: id, soiree, ...extra }; const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_resultats (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};

fiche('OUI'); appel('OUI', 'REPONDEUR'); appel('OUI', 'JOINT', 'Marie Manager'); resultat('OUI', 1);
fiche('NON'); appel('NON', 'JOINT'); resultat('NON', 0);
fiche('JOINT-RIEN'); appel('JOINT-RIEN', 'JOINT');
fiche('REP'); appel('REP', 'REPONDEUR');
fiche('NEUF');
fiche('REFUS'); appel('REFUS', 'REFUS_FERME');
fiche('OPPO'); db.prepare("INSERT INTO op_journal_opposition (id_modelo) VALUES ('OPPO')").run();
fiche('DCD'); appel('DCD', 'DECEDE');
fiche('ERR'); appel('ERR', 'ERREUR_IDENTITE');
fiche('SORTIE', { a_verifier: 1, verifie: 'ECARTE' });
fiche('CONFIRMEE', { a_verifier: 1, verifie: 'CONFIRME' });
fiche('CEL', { conseiller: 'Céline EVRARD' }); appel('CEL', 'JOINT', 'Céline EVRARD'); resultat('CEL', 1);
fiche('STOP', { stop_mail: 1 });
fiche('SANSMAIL', { email: null });
fiche('INVALIDE', { email_valide: 0 });
fiche('MAJ', { email_valide: 0 }); appel('MAJ', 'REPONDEUR'); resultat('MAJ', 0, { email_maj: 'Nouveau@Ex.fr' });
fiche('COUPLE-A', { email: 'couple@ex.fr' });
fiche('COUPLE-B', { email: 'Couple@ex.fr ' }); appel('COUPLE-B', 'JOINT'); resultat('COUPLE-B', 1);

const par = (corps) => Object.fromEntries(corps.lignes.map(l => [l.id_modelo, l]));
const ligneCsv = (l, extra = {}) => ({ id_modelo: l.id_modelo, civilite: l.civilite, nom: l.nom, prenom: l.prenom,
  email: l.email, conseiller: l.conseiller, type: l.type, ...extra });

(async () => {
  console.log('\naccès');
  let r = await req('a@t.fr', 'GET', '/operation/soiree');
  t('conseiller : 403', () => eq(r.statut, 403));
  r = await req('t@t.fr', 'GET', '/operation/soiree');
  t('manager non désigné : 403', () => eq(r.statut, 403));
  const tom = db.prepare("SELECT id FROM users WHERE email='t@t.fr'").get().id;
  r = await req('m@t.fr', 'PUT', `/operation/soiree/acces/${tom}`, { acces: true });
  t('seul l’admin donne l’accès', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'PUT', `/operation/soiree/acces/${tom}`, { acces: true });
  t('l’admin désigne Tom', () => eq(r.statut, 200));
  r = await req('t@t.fr', 'GET', '/operation/soiree');
  t('Tom y accède', () => eq(r.statut, 200));
  r = await req('t@t.fr', 'GET', '/operation/soiree/mon-acces');
  t('mon-acces : oui pour Tom', () => eq(r.corps.acces, true));
  r = await req('a@t.fr', 'GET', '/operation/soiree/mon-acces');
  t('mon-acces : non pour un conseiller', () => eq(r.corps.acces, false));

  console.log('\ntri');
  r = await req('adm@t.fr', 'GET', '/operation/soiree');
  let L = par(r.corps), C = r.corps.compteurs;
  t('joint + oui : personnalisée', () => { eq(L.OUI.statut, 'A_INVITER'); eq(L.OUI.type, 'PERSONNALISEE'); });
  t('le conseiller cité est celui qui a joint', () => eq(L.OUI.conseiller, 'Marie Manager'));
  t('joint + non : exclu', () => { eq(L.NON.statut, 'EXCLU'); eq(L.NON.motif, 'A_DIT_NON'); });
  t('joint sans rien de saisi : compté en non', () => eq(L['JOINT-RIEN'].motif, 'A_DIT_NON'));
  t('répondeur : générique', () => { eq(L.REP.statut, 'A_INVITER'); eq(L.REP.type, 'GENERIQUE'); });
  t('jamais appelé : générique', () => eq(L.NEUF.type, 'GENERIQUE'));
  t('refus ferme : exclu', () => eq(L.REFUS.motif, 'OPPOSITION'));
  t('journal des oppositions : exclu', () => eq(L.OPPO.motif, 'OPPOSITION'));
  t('décédé : exclu', () => eq(L.DCD.motif, 'DECEDE'));
  t('erreur de personne : exclu', () => eq(L.ERR.motif, 'ERREUR_IDENTITE'));
  t('identité sortie : exclue', () => eq(L.SORTIE.motif, 'IDENTITE_NON_ETABLIE'));
  t('identité confirmée : invitée', () => eq(L.CONFIRMEE.statut, 'A_INVITER'));
  t('portefeuille de Céline : exclu, même avec un oui', () => { eq(L.CEL.statut, 'EXCLU'); eq(L.CEL.motif, 'PORTEFEUILLE_HORS_SOIREE'); eq(L.CEL.oui, true); });
  t('stop mail : liste à part', () => eq(L.STOP.statut, 'STOP_MAIL'));
  t('sans e-mail : liste à part', () => eq(L.SANSMAIL.statut, 'SANS_EMAIL'));
  t('e-mail invalide : liste à part', () => eq(L.INVALIDE.statut, 'SANS_EMAIL'));
  t('e-mail recueilli au téléphone : utilisé', () => { eq(L.MAJ.statut, 'A_INVITER'); eq(L.MAJ.email, 'nouveau@ex.fr'); });
  t('couple : une seule invitation, la personnalisée', () => {
    eq(L['COUPLE-B'].statut, 'A_INVITER'); eq(L['COUPLE-A'].statut, 'MEME_EMAIL'); eq(L['COUPLE-A'].meme_que, 'COUPLE-B'); });
  t('compteurs', () => { eq(C.a_inviter.personnalisee, 2); eq(C.a_inviter.generique, 4); eq(C.exclus.total, 8);
    eq(C.exclus.A_DIT_NON, 2); eq(C.stop_mail, 1); eq(C.sans_email, 2); eq(C.meme_email, 1); eq(C.total, 18); });

  console.log('\nimport « envoyé »');
  const perso = r.corps.lignes.filter(l => l.statut === 'A_INVITER' && l.type === 'PERSONNALISEE').map(l => ligneCsv(l));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: perso, simulation: true });
  t('simulation : annonce 2, n’écrit rien', () => { eq(r.corps.acceptees, 2); eq(r.corps.vague, 1);
    eq(db.prepare('SELECT COUNT(*) n FROM op_invitations').get().n, 0); });
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: perso, envoye_le: '2026-11-21', fichier: 'v1.csv' });
  t('vague 1 enregistrée', () => { eq(r.corps.acceptees, 2); eq(r.corps.vague, 1); eq(r.corps.envoye_le, '2026-11-21'); });
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps); C = r.corps.compteurs;
  t('les invités sortent de l’export', () => { eq(C.a_inviter.personnalisee, 0); eq(L.OUI.statut, 'INVITE'); eq(L.OUI.invitation.vague, 1); });
  t('le conjoint est couvert par la même adresse', () => { eq(L['COUPLE-A'].statut, 'INVITE'); eq(L['COUPLE-A'].invitation.via, 'COUPLE-B'); });
  t('compteur invités', () => { eq(C.invites.personnalisee, 3); eq(C.vagues.length, 1); eq(C.vagues[0].n, 2); });

  const gen = r.corps.lignes.filter(l => l.statut === 'A_INVITER').map(l => ligneCsv(l));
  t('4 génériques à exporter', () => eq(gen.length, 4));
  const fichier = [
    ...gen.slice(0, 2),
    { ...gen[2], envoye: 'non' },
    { ...gen[3], nom: 'AUTRE' },
    ligneCsv(L.OUI),
    { id_modelo: 'INCONNU', nom: 'X', prenom: 'Y' },
    gen[0],
  ];
  r = await req('t@t.fr', 'POST', '/operation/soiree/envoye', { lignes: fichier });
  t('vague 2 : 2 acceptées, 1 non envoyée, 4 rejetées', () => { eq(r.corps.vague, 2); eq(r.corps.acceptees, 2);
    eq(r.corps.non_envoyees, 1); eq(r.corps.rejetees.length, 4); });
  t('motifs de rejet lisibles', () => {
    const m = r.corps.rejetees.map(x => x.motif).join(' | ');
    for (const mot of ['nom ne correspond pas', 'déjà invitée (vague 1)', 'inconnu', 'double'])
      if (!m.includes(mot)) throw new Error('manque « ' + mot + ' » dans : ' + m);
  });
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps); C = r.corps.compteurs;
  t('la non envoyée et la rejetée restent à inviter', () => eq(C.a_inviter.generique, 2));

  console.log('\nbascule et exclusion après envoi');
  const g = gen[0].id_modelo;
  appel(g, 'JOINT'); db.prepare('INSERT OR REPLACE INTO op_resultats (id_modelo, soiree) VALUES (?, 1)').run(g);
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps);
  t('générique reçue puis oui : à confirmer, rien de plus à envoyer', () => {
    eq(L[g].statut, 'INVITE'); eq(L[g].a_confirmer, true); eq(r.corps.compteurs.a_confirmer, 1); eq(r.corps.compteurs.a_inviter.personnalisee, 0); });
  appel(gen[1].id_modelo, 'REFUS_FERME');
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps);
  t('refus après envoi : reste « invité », motif visible', () => { eq(L[gen[1].id_modelo].statut, 'INVITE'); eq(L[gen[1].id_modelo].motif, 'OPPOSITION'); });
  appel(gen[2].id_modelo, 'JOINT');
  r = await req('adm@t.fr', 'GET', '/operation/soiree');
  t('joint sans oui avant envoi : sort de la générique', () => eq(par(r.corps)[gen[2].id_modelo].statut, 'EXCLU'));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: [gen[2]] });
  t('envoi à une fiche exclue depuis : enregistré, signalé', () => { eq(r.corps.acceptees, 1); eq(r.corps.alertes.length, 1); });

  console.log('\nannulation d’une vague');
  r = await req('t@t.fr', 'POST', '/operation/soiree/vagues/1/annuler');
  t('réservée à l’admin', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/vagues/1/annuler');
  t('vague 1 annulée', () => eq(r.corps.lignes, 2));
  t('rien n’est supprimé', () => eq(db.prepare('SELECT COUNT(*) n FROM op_invitations WHERE vague = 1').get().n, 2));
  r = await req('adm@t.fr', 'GET', '/operation/soiree'); L = par(r.corps);
  t('les fiches reviennent dans l’export', () => { eq(L.OUI.statut, 'A_INVITER'); eq(L['COUPLE-A'].statut, 'MEME_EMAIL'); });
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: [ligneCsv(L.OUI)] });
  t('la vague suivante ne réutilise pas un numéro', () => eq(r.corps.vague, 4));
  r = await req('adm@t.fr', 'POST', '/operation/soiree/envoye', { lignes: [] });
  t('fichier vide refusé', () => eq(r.statut, 400));

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
