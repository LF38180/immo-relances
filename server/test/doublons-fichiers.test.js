// Même personne dans plusieurs fichiers, vue du manager, liste des conseillers — 11/11/2026.
const { spawn } = require('child_process');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB = '/tmp/immo-doublons-' + process.pid + '.db';
const PORT = 3072;
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
    console.log('doublons-fichiers.test.js (HTTP)');
    const admin = await login('admin@lequai-immobilier.com', 'admin123');
    const agent = await login('agent@lequai-immobilier.com', 'agent123');
    const manager = await login('manager@lequai-immobilier.com', 'manager123');
    const d = base(true);
    d.prepare('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)').run('Durand', 'Nolan', 'nolan@test.fr', bcrypt.hashSync('secret123', 10), 'agent');
    const idNolan = d.prepare("SELECT id FROM users WHERE email = 'nolan@test.fr'").get().id;
    d.close();
    const nolan = await login('nolan@test.fr', 'secret123');

    await req('POST', '/api/contacts', agent, { nom: 'Martin', prenom: 'Luc', telephone: '06 12 34 56 78', email: 'luc@exemple.fr', categorie: 'vendeur' });
    await req('POST', '/api/contacts', agent, { nom: 'Seul', telephone: '06 99 99 99 99', categorie: 'vendeur' });
    test('un seul fichier : aucun signalement', (await req('GET', '/api/admin/doublons-fichiers', admin)).body.length === 0);

    const cree = await req('POST', '/api/admin/blocs', admin, { libelle: 'Base de Nolan', proprietaire_id: idNolan });
    const bloc2 = cree.body.id;
    test('base personnelle créée', cree.status < 300 && bloc2 > 1, cree.body);
    const avant = compter('SELECT COUNT(*) c FROM contacts');
    // Même mobile écrit autrement, puis même e-mail avec un autre numéro, puis un inconnu.
    const imp = await req('POST', '/api/contacts/import?bloc_id=' + bloc2, admin, { bloc_id: bloc2, contacts: [
      { nom: 'MARTIN', prenom: 'Luc', telephone: '+33 6 12 34 56 78' },
      { nom: 'Petit', prenom: 'Anne', telephone: '04 76 00 00 01' },
    ] });
    test('import admin : fiches créées dans le second fichier, rien de fusionné', imp.body.importes === 2 && compter('SELECT COUNT(*) c FROM contacts') === avant + 2, imp.body);
    test('import admin : la personne déjà dans un autre fichier est signalée', imp.body.dans_autre_fichier === 1, imp.body);

    const liste = (await req('GET', '/api/admin/doublons-fichiers', admin)).body;
    test('signalement : une personne, ses deux fiches, les deux fichiers nommés',
      liste.length === 1 && liste[0].fiches.length === 2 && new Set(liste[0].fiches.map(f => f.bloc_id)).size === 2
      && liste[0].fiches.some(f => f.proprietaire === 'Nolan Durand'), liste);

    const impAgent = await req('POST', '/api/contacts/import', nolan, { contacts: [{ nom: 'Seul', telephone: '0699999999' }] });
    test('import par un agent : il n apprend rien du fichier d un autre', impAgent.status === 200 && impAgent.body.dans_autre_fichier === undefined, impAgent.body);
    test('mais la direction le voit', (await req('GET', '/api/admin/doublons-fichiers', admin)).body.length === 2);
    test('signalement réservé à l admin', (await req('GET', '/api/admin/doublons-fichiers', manager)).status === 403
      && (await req('GET', '/api/admin/doublons-fichiers', agent)).status === 403);

    // Une fiche mise à la corbeille ne compte plus.
    const idSeul2 = (await req('GET', '/api/contacts?search=Seul', nolan)).body.contacts[0].id;
    await req('DELETE', '/api/contacts/' + idSeul2, nolan);
    test('fiche en trop supprimée (corbeille) : le signalement disparaît', (await req('GET', '/api/admin/doublons-fichiers', admin)).body.length === 1);

    // Le manager voit les fiches des agents, base personnelle comprise.
    const vuM = (await req('GET', '/api/contacts?bloc_id=' + bloc2, manager)).body;
    test('manager : voit les fiches de la base personnelle d un agent', vuM.contacts.length === 2, vuM.contacts?.length);
    const vuA = await req('GET', '/api/contacts?bloc_id=' + bloc2, agent);
    test('une autre agente : non', vuA.status === 403 || (vuA.body.contacts || []).length === 0, vuA.status);

    // Liste des conseillers pour l'attribution : lisible par une agente, sans rien d'autre que les noms.
    const cons = await req('GET', '/api/contacts/conseillers', agent);
    test('agente : liste des conseillers lisible, noms seulement', cons.status === 200 && cons.body.length >= 3
      && cons.body.every(u => Object.keys(u).sort().join() === 'id,nom,prenom'), cons.body);
    test('manager : sélecteurs alimentés sans la liste des comptes', (await req('GET', '/api/admin/agents?courtage=1', manager)).status === 200
      && (await req('GET', '/api/admin/users', manager)).status === 403);
    const h = await (await fetch(B + '/api/health')).json();
    test('santé : compteur des personnes dans plusieurs fichiers', h.controles.personnes_dans_plusieurs_fichiers === 1, h.controles);
  } catch (e) { console.error('  FAIL ' + (e.stack || e.message)); process.exitCode = 1 }
  finally { srv?.kill(); for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s) } catch { /* absent */ } } }
})();
