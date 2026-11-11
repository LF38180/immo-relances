// Fichiers (blocs), corbeille, garde-fous et suivi sur période libre — 11/11/2026.
// Points sensibles :
//  - pour une agente déjà en place (Chrystelle), RIEN ne change : même file, mêmes fiches ;
//  - un second fichier est étanche : ni lecture, ni écriture, ni fusion à l'import ;
//  - plus aucune suppression ne détruit une fiche ni son historique d'appels ;
//  - les rôles « courtage » et « conseiller » n'entrent plus dans le cœur ;
//  - un agent ne voit que sa propre activité, sur la durée qu'il veut.
const { spawn } = require('child_process');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB = '/tmp/immo-blocs-' + process.pid + '.db';
const PORT = 3071;
const B = 'http://localhost:' + PORT;
const env = { ...process.env, DB_PATH: DB, JWT_SECRET: 'dev', PORT: String(PORT) };
let srv;

async function login(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).token;
}
async function req(method, path, token, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const texte = await r.text();
  let json = null; try { json = JSON.parse(texte); } catch { /* csv */ }
  return { status: r.status, body: json, texte };
}
function test(n, ok, detail) {
  if (ok) console.log('  OK  ' + n);
  else { console.error('  FAIL ' + n + (detail !== undefined ? ' : ' + JSON.stringify(detail) : '')); process.exitCode = 1 }
}
async function demarrer() {
  srv = spawn('node', ['server/src/index.js'], { env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/health'); if (r.ok) return } catch { /* pas encore pret */ }
    await new Promise(r => setTimeout(r, 250));
  }
}
const base = (ecriture) => new Database(DB, ecriture ? {} : { readonly: true });
const compter = (sql, ...a) => { const d = base(); const n = d.prepare(sql).get(...a).c; d.close(); return n };

(async () => {
  try {
    await demarrer();
    console.log('blocs-corbeille-suivi.test.js (HTTP)');
    const admin = await login('admin@lequai-immobilier.com', 'admin123');
    const agent = await login('agent@lequai-immobilier.com', 'agent123');     // l'agente déjà en place
    const manager = await login('manager@lequai-immobilier.com', 'manager123');

    // --- L'existant : tout est dans le fichier 1, l'agente en place y a accès ---
    for (const n of ['Alpha', 'Bravo', 'Charlie']) await req('POST', '/api/contacts', agent, { nom: n, telephone: '06 00 00 00 0' + n.length, categorie: 'vendeur' });
    const file0 = (await req('GET', '/api/contacts/file-relances', agent)).body;
    test('l agente en place : sa file contient ses fiches, comme avant', file0.total === 3, file0.total);
    test('fiches créées sans préciser de fichier : fichier 1', compter('SELECT COUNT(*) c FROM contacts WHERE bloc_id = 1') === 3);
    const blocsAgent = (await req('GET', '/api/contacts/blocs', agent)).body;
    test('elle n a qu un fichier : aucun sélecteur à afficher', blocsAgent.length === 1 && blocsAgent[0].id === 1, blocsAgent);

    // --- Rôles hors du cœur ---
    const d = base(true);
    for (const [email, role] of [['conseil@test.fr', 'conseiller'], ['courtage@test.fr', 'courtage'], ['nouvelle@test.fr', 'agent'], ['acq@test.fr', 'agent']]) {
      d.prepare('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)').run('Test', role + email[0], email, bcrypt.hashSync('secret123', 10), role);
    }
    const idAcq = d.prepare("SELECT id FROM users WHERE email = 'acq@test.fr'").get().id;
    d.close();
    const conseiller = await login('conseil@test.fr', 'secret123');
    const courtage = await login('courtage@test.fr', 'secret123');
    const nouvelle = await login('nouvelle@test.fr', 'secret123');
    const acq = await login('acq@test.fr', 'secret123');
    const id1 = file0.contacts[0].id;
    for (const [nom, jeton] of [['conseiller', conseiller], ['courtage', courtage]]) {
      const codes = [
        (await req('GET', '/api/contacts', jeton)).status, (await req('GET', '/api/contacts/export/csv', jeton)).status,
        (await req('PUT', '/api/contacts/' + id1, jeton, { nom: 'Pirate' })).status, (await req('DELETE', '/api/contacts/' + id1, jeton)).status,
        (await req('GET', '/api/relances/stats', jeton)).status, (await req('POST', '/api/relances', jeton, { contact_id: id1, issue: 'sans_reponse' })).status,
      ];
      test(`rôle ${nom} : aucune route du cœur (lecture, export, modification, suppression, stats, appel)`, codes.every(c => c === 403), codes);
    }
    test('la fiche visée est intacte', compter("SELECT COUNT(*) c FROM contacts WHERE id = ? AND nom != 'Pirate' AND supprime_le IS NULL", id1) === 1);

    // --- Un agent créé APRÈS n'a aucun fichier d'office ---
    test('nouvel agent : file vide, aucun fichier', (await req('GET', '/api/contacts/file-relances', nouvelle)).body.total === 0
      && (await req('GET', '/api/contacts/blocs', nouvelle)).body.length === 0);
    test('nouvel agent : ne peut ni créer ni importer tant qu aucun fichier ne lui est ouvert',
      (await req('POST', '/api/contacts', nouvelle, { nom: 'X' })).status === 403 && (await req('POST', '/api/contacts/import', nouvelle, { contacts: [{ nom: 'X' }] })).status === 403);
    test('nouvel agent : ne peut pas ouvrir une fiche du fichier 1', (await req('GET', '/api/contacts/' + id1, nouvelle)).status === 404
      && (await req('POST', '/api/relances', nouvelle, { contact_id: id1, issue: 'sans_reponse' })).status === 404);

    // --- Un second fichier, étanche ---
    test('créer un fichier : admin seulement', (await req('POST', '/api/admin/blocs', manager, { libelle: 'Fichier Acquéreurs' })).status === 403);
    const cree = await req('POST', '/api/admin/blocs', admin, { libelle: 'Fichier Acquéreurs', delai_sans_reponse_jours: 2,
      champs: [{ cle: 'budget', libelle: 'Budget', type: 'nombre' }, { cle: 'secteur', libelle: 'Secteur' }] });
    const bloc2 = cree.body.id;
    test('fichier Acquéreurs créé', cree.status === 201 && bloc2 > 1, cree.body);
    test('pas deux fichiers du même nom', (await req('POST', '/api/admin/blocs', admin, { libelle: 'fichier acquéreurs' })).status === 409);
    test('ouvrir le fichier à Madame Acquéreurs', (await req('PUT', '/api/admin/blocs/' + bloc2, admin, { acces: [idAcq] })).status === 200);
    test('le fichier historique ne se désactive pas', (await req('PUT', '/api/admin/blocs/1', admin, { actif: false })).status === 400);

    const imp = await req('POST', '/api/contacts/import', acq, { contacts: [
      { nom: 'Alpha', telephone: '06 00 00 00 05', notes: 'cherche T3' },      // même téléphone qu'une fiche du fichier 1
      { nom: 'Delta', telephone: '06 11 11 11 11' }] });
    test('import dans SON fichier : deux fiches créées, aucune fusion avec le fichier Estimés',
      imp.status === 200 && imp.body.importes === 2 && imp.body.fusionnes === 0 && imp.body.bloc_id === bloc2, imp.body);
    test('la fiche Alpha du fichier 1 n a pas été touchée', compter("SELECT COUNT(*) c FROM contacts WHERE bloc_id = 1 AND nom = 'Alpha' AND (notes IS NULL OR notes = '')") === 1);
    const fileAcq = (await req('GET', '/api/contacts/file-relances', acq)).body;
    test('sa file : ses 2 fiches seulement', fileAcq.total === 2 && fileAcq.contacts.every(c => c.bloc_id === bloc2), fileAcq.total);
    const file1 = (await req('GET', '/api/contacts/file-relances', agent)).body;
    test('la file de l agente en place n a pas bougé : mêmes fiches, même ordre',
      JSON.stringify(file1.contacts.map(c => c.id)) === JSON.stringify(file0.contacts.map(c => c.id)));
    test('elle ne voit pas le fichier Acquéreurs', (await req('GET', '/api/contacts?bloc_id=' + bloc2, agent)).status === 403
      && (await req('GET', '/api/contacts/' + fileAcq.contacts[0].id, agent)).status === 404);
    test('fiche avec ses champs propres (budget, secteur)', (await req('POST', '/api/contacts', acq, { nom: 'Echo', extra: { budget: 320000, secteur: 'Meylan' } })).status === 201
      && JSON.parse(base().prepare("SELECT extra FROM contacts WHERE nom = 'Echo'").get().extra).budget === 320000);

    // Qui voit plusieurs fichiers doit dire lequel : on ne range rien au hasard.
    const sansChoix = await req('POST', '/api/contacts/import', admin, { contacts: [{ nom: 'Foxtrot', telephone: '06 22 22 22 22' }] });
    test('admin, deux fichiers, aucun choisi : import et création refusés', sansChoix.status === 400
      && (await req('POST', '/api/contacts', admin, { nom: 'Foxtrot' })).status === 400 && compter("SELECT COUNT(*) c FROM contacts WHERE nom = 'Foxtrot'") === 0, sansChoix.body);
    const avecChoix = await req('POST', '/api/contacts/import', admin, { bloc_id: bloc2, contacts: [{ nom: 'Foxtrot', telephone: '06 22 22 22 22', extra: { budget: 250000 } }] });
    test('avec le fichier nommé : rangé au bon endroit, champs propres compris', avecChoix.body.importes === 1
      && compter("SELECT COUNT(*) c FROM contacts WHERE nom = 'Foxtrot' AND bloc_id = ? AND extra LIKE '%250000%'", bloc2) === 1);
    test('scripts : fermés aux rôles hors du cœur', (await req('GET', '/api/scripts', conseiller)).status === 403 && (await req('GET', '/api/scripts', agent)).status === 200);

    // Délai propre au fichier : 2 jours au lieu du réglage général (3).
    const dans = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    await req('POST', '/api/relances', acq, { contact_id: fileAcq.contacts[0].id, issue: 'sans_reponse' });
    await req('POST', '/api/relances', agent, { contact_id: file0.contacts[1].id, issue: 'sans_reponse' });
    const lect = base();
    test('« pas de réponse » : rappel à J+2 dans le fichier Acquéreurs, J+3 dans le fichier Estimés',
      lect.prepare('SELECT prochain_contact p FROM contacts WHERE id = ?').get(fileAcq.contacts[0].id).p === dans(2)
      && lect.prepare('SELECT prochain_contact p FROM contacts WHERE id = ?').get(file0.contacts[1].id).p === dans(3));
    test('l appel garde le fichier dans lequel il a été passé', lect.prepare('SELECT bloc_id b FROM relances WHERE contact_id = ?').get(fileAcq.contacts[0].id).b === bloc2);
    lect.close();

    // --- Double envoi (réseau faible) ---
    const a1 = await req('POST', '/api/relances', agent, { contact_id: file0.contacts[2].id, issue: 'sans_reponse' });
    const a2 = await req('POST', '/api/relances', agent, { contact_id: file0.contacts[2].id, issue: 'sans_reponse' });
    test('même résultat renvoyé dans la minute : un seul appel, une seule tentative', a1.status === 201 && a2.status === 200 && a2.body.id === a1.body.id
      && compter('SELECT COUNT(*) c FROM relances WHERE contact_id = ?', file0.contacts[2].id) === 1
      && compter('SELECT nombre_tentatives c FROM contacts WHERE id = ?', file0.contacts[2].id) === 1, a2.body);
    const a3 = await req('POST', '/api/relances', agent, { contact_id: file0.contacts[2].id, issue: 'rappel', date_rappel: dans(10) });
    test('un résultat différent juste après est bien un autre appel', a3.status === 201 && a3.body.id !== a1.body.id);

    const r1 = await req('POST', '/api/relances', agent, { contact_id: file0.contacts[2].id, issue: 'rappel', date_rappel: dans(12) });
    test('le même résultat avec une AUTRE date de rappel, corrigée aussitôt, est bien pris', r1.status === 201 && r1.body.id !== a3.body.id
      && base().prepare('SELECT prochain_contact p FROM contacts WHERE id = ?').get(file0.contacts[2].id).p === dans(12));

    // --- Fiche partielle (ouverte depuis « Mes rappels ») : elle ne vide rien ---
    await req('PUT', '/api/contacts/' + file0.contacts[1].id, agent, { ...(await req('GET', '/api/contacts/' + file0.contacts[1].id, agent)).body, tags: '["vip"]', date_estimation: '2026-03-01' });
    const partielle = await req('PUT', '/api/contacts/' + file0.contacts[1].id, agent, { id: file0.contacts[1].id, nom: 'Bravo', prenom: 'Zoé', tags: '[]', date_estimation: null, assigned_to: null, statut: 'a_contacter', prochain_contact: null });
    const apresP = (await req('GET', '/api/contacts/' + file0.contacts[1].id, agent)).body;
    test('fiche incomplète enregistrée : le prénom est pris, mots-clés, date d estimation, statut et rappel sont gardés',
      partielle.status === 200 && apresP.prenom === 'Zoé' && apresP.tags === '["vip"]' && apresP.date_estimation === '2026-03-01'
      && apresP.statut === 'tente_sans_reponse' && apresP.prochain_contact === dans(3), { tags: apresP.tags, d: apresP.date_estimation, s: apresP.statut });

    // --- Fiche périmée : le rappel planifié n'est pas écrasé ---
    const idRappel = file0.contacts[2].id;
    const ancienne = (await req('GET', '/api/contacts/' + id1, agent)).body;
    await req('POST', '/api/relances', agent, { contact_id: id1, issue: 'rappel', date_rappel: dans(20) });
    const sauve = await req('PUT', '/api/contacts/' + id1, agent, { ...ancienne, email: 'alpha@test.fr' });
    const apres = (await req('GET', '/api/contacts/' + id1, agent)).body;
    test('fiche enregistrée avec une version périmée : coordonnées prises, rappel planifié conservé',
      sauve.status === 200 && apres.email === 'alpha@test.fr' && apres.statut === 'rappel_planifie' && apres.prochain_contact === dans(20), { statut: apres.statut, p: apres.prochain_contact });
    const fraiche = (await req('GET', '/api/contacts/' + id1, agent)).body;
    test('avec une fiche à jour, le statut se modifie normalement', (await req('PUT', '/api/contacts/' + id1, agent, { ...fraiche, statut: 'a_recontacter' })).status === 200
      && (await req('GET', '/api/contacts/' + id1, agent)).body.statut === 'a_recontacter');
    test('ce changement à la main est tracé', compter("SELECT COUNT(*) c FROM contact_evenements WHERE contact_id = ? AND type = 'statut' AND apres = 'a_recontacter'", id1) === 1);

    // --- Corbeille : plus rien n'est détruit ---
    const relancesAvant = compter('SELECT COUNT(*) c FROM relances WHERE contact_id = ?', idRappel);
    test('supprimer une fiche : 200', (await req('DELETE', '/api/contacts/' + idRappel, agent)).status === 200);
    test('elle disparaît de la liste, de la file et des rappels', !(await req('GET', '/api/contacts', agent)).body.contacts.some(c => c.id === idRappel)
      && !(await req('GET', '/api/contacts/file-relances', agent)).body.contacts.some(c => c.id === idRappel)
      && (await req('GET', '/api/contacts/' + idRappel, agent)).status === 404
      && !JSON.stringify((await req('GET', '/api/relances/mes-rappels', agent)).body).includes('"id":' + idRappel + ','));
    test('mais elle est toujours en base, avec tout son historique d appels', compter('SELECT COUNT(*) c FROM contacts WHERE id = ? AND supprime_le IS NOT NULL', idRappel) === 1
      && compter('SELECT COUNT(*) c FROM relances WHERE contact_id = ?', idRappel) === relancesAvant && relancesAvant >= 3);
    test('corbeille : admin seulement', (await req('GET', '/api/contacts/corbeille', agent)).status === 403 && (await req('GET', '/api/contacts/corbeille', admin)).body.length === 1);
    test('restaurer : la fiche revient', (await req('POST', '/api/contacts/corbeille/restaurer', admin, { ids: [idRappel] })).body.restaures === 1
      && (await req('GET', '/api/contacts/' + idRappel, agent)).status === 200);

    test('« tout effacer » sans la confirmation : refusé par le serveur', (await req('DELETE', '/api/contacts/all', admin)).status === 400
      && compter('SELECT COUNT(*) c FROM contacts WHERE supprime_le IS NULL') >= 6);
    test('« tout effacer » : agent et manager refusés', (await req('DELETE', '/api/contacts/all', agent, { confirmation: 'EFFACER' })).status === 403
      && (await req('DELETE', '/api/contacts/all', manager, { confirmation: 'EFFACER' })).status === 403);
    const totalRelances = compter('SELECT COUNT(*) c FROM relances');
    const totalContacts = compter('SELECT COUNT(*) c FROM contacts');
    const tout = await req('DELETE', '/api/contacts/all?bloc_id=1', admin, { confirmation: 'EFFACER' });
    test('« tout effacer » le fichier 1 : sauvegarde écrite, fiches à la corbeille, rien de détruit',
      tout.status === 200 && tout.body.supprimes === 3 && /^immo-.*\.db$/.test(tout.body.sauvegarde || '')
      && compter('SELECT COUNT(*) c FROM contacts') === totalContacts && compter('SELECT COUNT(*) c FROM relances') === totalRelances
      && compter('SELECT COUNT(*) c FROM contacts WHERE bloc_id = 1 AND supprime_le IS NULL') === 0, tout.body);
    test('le fichier Acquéreurs n a pas été touché', compter('SELECT COUNT(*) c FROM contacts WHERE bloc_id = ? AND supprime_le IS NULL', bloc2) === 4);
    test('tout remettre d un coup', (await req('POST', '/api/contacts/corbeille/restaurer', admin, { supprime_le: tout.body.supprime_le })).body.restaures === 3
      && (await req('GET', '/api/contacts', agent)).body.total === 3);

    // --- Paramètres ---
    const dp = base(true); dp.prepare("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('session_cloturee_2', '2026-11-11 08:00:00')").run(); dp.close();
    test('paramètres : écriture réservée à l admin', (await req('PUT', '/api/admin/parametres', manager, { delai_sans_reponse_jours: '9' })).status === 403);
    const pr = await req('PUT', '/api/admin/parametres', admin, { delai_sans_reponse_jours: '4', session_cloturee_2: '1999-01-01 00:00:00' });
    const lp = base();
    test('une clé de clôture de session ne s écrase pas par l écran des réglages', pr.body.ecrites === 1
      && lp.prepare("SELECT valeur v FROM parametres WHERE cle = 'session_cloturee_2'").get().v === '2026-11-11 08:00:00'
      && lp.prepare("SELECT valeur v FROM parametres WHERE cle = 'delai_sans_reponse_jours'").get().v === '4');
    lp.close();

    // --- Suivi sur période libre ---
    // Des appels anciens, datés à la main : il y a 200 jours, et un appel de 23 h 30 (heure de Paris).
    const ds = base(true);
    const idAgent = ds.prepare("SELECT id FROM users WHERE email = 'agent@lequai-immobilier.com'").get().id;
    const ajouter = ds.prepare("INSERT INTO relances (contact_id, agent_id, statut, issue, type, created_at, bloc_id) VALUES (?,?,?,?, 'appel', ?, 1)");
    ajouter.run(id1, idAgent, 'rdv_obtenu', 'projet', '2026-04-20 09:00:00');
    ajouter.run(id1, idAgent, 'tente_sans_reponse', 'sans_reponse', '2026-04-21 09:00:00');
    ajouter.run(id1, idAgent, 'contacte', 'sans_projet', '2026-07-14 21:30:00');   // 23 h 30 à Paris, le 14 juillet
    ds.prepare("INSERT INTO relances (contact_id, agent_id, statut, notes, type, created_at, bloc_id) VALUES (?,?, 'contacte', 'une note', 'note', '2026-04-20 10:00:00', 1)").run(id1, idAgent);
    ds.close();
    const s90 = (await req('GET', `/api/relances/stats?debut=${dans(-90)}&fin=${dans(0)}`, admin)).body;
    const sAn = (await req('GET', '/api/relances/stats?debut=2026-01-01&fin=2026-12-31', admin)).body;
    test('une période d un an : les appels d avril sont là, absents des 90 derniers jours',
      sAn.totaux.appels === s90.totaux.appels + 3 && sAn.periode.granularite === 'semaine', { an: sAn.totaux.appels, j90: s90.totaux.appels });
    const tout2 = (await req('GET', '/api/relances/stats?depuis_debut=1', admin)).body;
    test('« depuis le début » : part du tout premier appel', tout2.periode.debut === '2026-04-20' && tout2.totaux.appels === sAn.totaux.appels && tout2.precedente === null, tout2.periode);
    const avril = (await req('GET', '/api/relances/stats?debut=2026-04-20&fin=2026-04-21', admin)).body;
    test('avril : 2 appels, 1 abouti, 1 personne, 1 projet ; la note libre ne compte pas',
      avril.totaux.appels === 2 && avril.totaux.appels_aboutis === 1 && avril.totaux.personnes_appelees === 1 && avril.totaux.projets === 1 && avril.periode.granularite === 'jour', avril.totaux);
    const j14 = (await req('GET', '/api/relances/stats?debut=2026-07-14&fin=2026-07-14', admin)).body;
    const j15 = (await req('GET', '/api/relances/stats?debut=2026-07-15&fin=2026-07-15', admin)).body;
    test('un appel de 23 h 30 reste sur son jour (heure de Paris)', j14.totaux.appels === 1 && j15.totaux.appels === 0, { j14: j14.totaux.appels, j15: j15.totaux.appels });
    test('dates inversées ou fantaisistes : pas d erreur', (await req('GET', '/api/relances/stats?debut=2026-12-31&fin=2026-01-01', admin)).body.totaux.appels === sAn.totaux.appels
      && (await req('GET', '/api/relances/stats?debut=2026-13-45', admin)).status === 200);
    test('par personne, pour le manager : une ligne par personne ayant appelé', (await req('GET', '/api/relances/stats?debut=2026-01-01&fin=2026-12-31', manager)).body.parPersonne.length === 2);
    test('par fichier : les appels du fichier Acquéreurs seulement', (await req('GET', `/api/relances/stats?depuis_debut=1&bloc_id=${bloc2}`, admin)).body.totaux.appels === 1);

    const moi = (await req('GET', `/api/relances/stats?depuis_debut=1&agent_id=${idAcq}`, agent)).body;
    test('un agent ne voit que SA propre activité, même s il demande quelqu un d autre',
      moi.portee.agent_id === idAgent && moi.parPersonne.length === 0 && moi.parAgent.length === 1 && moi.parAgent[0].id === idAgent, moi.portee);
    test('Madame Acquéreurs : ses chiffres, sur son fichier', (await req('GET', '/api/relances/stats?depuis_debut=1', acq)).body.totaux.appels === 1);
    test('export du suivi : manager oui, agent non', (await req('GET', '/api/relances/stats?depuis_debut=1&format=csv', agent)).status === 403
      && (await req('GET', '/api/relances/stats?depuis_debut=1&format=csv', manager)).texte.split('\n').length >= 3);

    // --- Supervision ---
    test('supervision : la liste des personnes est lisible par un manager', (await req('GET', '/api/admin/agents', manager)).status === 200
      && (await req('GET', '/api/admin/agents', agent)).status === 403);
    const vue = (await req('GET', '/api/admin/vue-agent/' + idAcq, manager)).body;
    test('vue par-dessus l épaule : la file de la personne est celle de SON fichier', vue.file.length >= 1 && vue.file.every(c => c.categorie !== undefined)
      && compter(`SELECT COUNT(*) c FROM contacts WHERE id IN (${vue.file.map(c => c.id).join(',')}) AND bloc_id != ?`, bloc2) === 0, vue.file.length);

    // --- Redémarrage : la migration est rejouable, rien ne bouge ---
    const avant = { c: compter('SELECT COUNT(*) c FROM contacts'), r: compter('SELECT COUNT(*) c FROM relances'), a: compter('SELECT COUNT(*) c FROM bloc_acces'), b: compter('SELECT COUNT(*) c FROM blocs') };
    srv.kill(); await new Promise(r => setTimeout(r, 500));
    await demarrer();
    const apresR = { c: compter('SELECT COUNT(*) c FROM contacts'), r: compter('SELECT COUNT(*) c FROM relances'), a: compter('SELECT COUNT(*) c FROM bloc_acces'), b: compter('SELECT COUNT(*) c FROM blocs') };
    test('après redémarrage : mêmes fiches, mêmes appels, et le nouvel agent n a pas reçu le fichier 1 d office',
      JSON.stringify(avant) === JSON.stringify(apresR) && (await req('GET', '/api/contacts/blocs', await login('nouvelle@test.fr', 'secret123'))).body.length === 0, { avant, apresR });
  } catch (e) { console.error('  FAIL ' + (e.stack || e.message)); process.exitCode = 1 }
  finally { srv?.kill(); for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s) } catch { /* absent */ } } }
})();
