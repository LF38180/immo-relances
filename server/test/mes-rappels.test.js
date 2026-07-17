// Teste GET /api/relances/mes-rappels : chaque agent voit SES rappels planifiés,
// groupés retard / aujourd'hui / à venir. HTTP réel (spawn serveur).
const assert = require('assert');
const { spawn } = require('child_process');

const env = { ...process.env, DB_PATH: '/tmp/immo-rappels-' + process.pid + '.db', JWT_SECRET: 'dev', PORT: '3013' };
const srv = spawn('node', ['server/src/index.js'], { env, stdio: 'ignore' });

const B = 'http://localhost:3013';
async function login(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).token;
}
async function post(path, token, body) {
  const r = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  return r.json();
}
function test(n, ok, detail) { if (ok) console.log('  OK  ' + n); else { console.error('  FAIL ' + n + (detail ? ' : ' + detail : '')); process.exitCode = 1; } }

setTimeout(async () => {
  try {
    console.log('mes-rappels.test.js (HTTP)');
    const agent = await login('agent@lequai-immobilier.com', 'agent123');
    const manager = await login('manager@lequai-immobilier.com', 'manager123');

    // Agent crée 3 contacts et planifie 3 rappels : hier (retard), aujourd'hui, dans 3 jours.
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const auj = new Date().toISOString().slice(0, 10);
    const dans3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const dates = [hier, auj, dans3];
    for (let i = 0; i < 3; i++) {
      const c = await post('/api/contacts', agent, { nom: 'RappelTest' + i, telephone: '060000000' + i, categorie: 'vendeur' });
      await post('/api/relances', agent, { contact_id: c.id, issue: 'rappel', date_rappel: dates[i], notes: 'promis le ' + dates[i] });
    }

    // L'agent voit ses 3 rappels dans les bons groupes.
    const mine = await (await fetch(B + '/api/relances/mes-rappels', { headers: { Authorization: 'Bearer ' + agent } })).json();
    test('retard contient le rappel d\'hier', mine.retard.length === 1 && mine.retard[0].nom === 'RappelTest0', JSON.stringify(mine.retard));
    test('aujourdhui contient le rappel du jour', mine.aujourdhui.length === 1 && mine.aujourdhui[0].nom === 'RappelTest1', JSON.stringify(mine.aujourdhui));
    test('aVenir contient le rappel a +3j', mine.aVenir.length === 1 && mine.aVenir[0].nom === 'RappelTest2', JSON.stringify(mine.aVenir));
    test('la note du rappel est renvoyee', mine.retard[0].derniere_note === 'promis le ' + hier, mine.retard[0].derniere_note);

    // Le manager (autre agent) ne voit RIEN : ce sont les promesses de l'agent.
    const theirs = await (await fetch(B + '/api/relances/mes-rappels', { headers: { Authorization: 'Bearer ' + manager } })).json();
    test('un autre agent ne voit pas ces rappels', theirs.retard.length === 0 && theirs.aujourdhui.length === 0 && theirs.aVenir.length === 0, JSON.stringify(theirs));

    // Résolution : l'agent rappelle le contact en retard (issue sans_projet) -> sort de la liste.
    const c0 = mine.retard[0];
    await post('/api/relances', agent, { contact_id: c0.id, issue: 'sans_projet', notes: 'rappelé, plus de projet' });
    const apres = await (await fetch(B + '/api/relances/mes-rappels', { headers: { Authorization: 'Bearer ' + agent } })).json();
    test('un rappel traité sort de la liste', apres.retard.length === 0, JSON.stringify(apres.retard));
  } catch (e) {
    console.error('  FAIL exception : ' + e.message); process.exitCode = 1;
  } finally { srv.kill(); }
}, 2500);
