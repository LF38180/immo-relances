// Teste GET /api/admin/vue-agent/:id — la vue "par-dessus l'epaule" (lecture seule)
// utilisee par le selecteur de vue de Session relance. Points sensibles :
// un agent ne doit PAS y acceder, et la route ne doit rien ecrire.
const { spawn } = require('child_process');

const DB = '/tmp/immo-vue-agent-' + process.pid + '.db';
const env = { ...process.env, DB_PATH: DB, JWT_SECRET: 'dev', PORT: '3016' };
const srv = spawn('node', ['server/src/index.js'], { env, stdio: 'ignore' });

const B = 'http://localhost:3016';
async function login(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).token;
}
async function get(path, token) {
  const r = await fetch(B + path, { headers: { Authorization: 'Bearer ' + token } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
function test(n, ok, detail) { if (ok) console.log('  OK  ' + n); else { console.error('  FAIL ' + n + (detail ? ' : ' + detail : '')); process.exitCode = 1 } }

setTimeout(async () => {
  try {
    console.log('vue-agent.test.js (HTTP)');
    const admin = await login('admin@lequai-immobilier.com', 'admin123');
    const manager = await login('manager@lequai-immobilier.com', 'manager123');
    const agent = await login('agent@lequai-immobilier.com', 'agent123');
    const marine = await login('marine.rosain@lequai-immobilier.com', 'MarineLeQuai');

    const users = (await get('/api/admin/users', admin)).body;
    const agentId = users.find(u => u.role === 'agent').id;

    const vue = await get('/api/admin/vue-agent/' + agentId, admin);
    test('admin : 200', vue.status === 200, vue.status);
    test('renvoie agent/file/rappels/dujour', vue.body && vue.body.agent
      && Array.isArray(vue.body.file) && Array.isArray(vue.body.rappels) && Array.isArray(vue.body.dujour),
      JSON.stringify(vue.body && Object.keys(vue.body)));

    test('manager : 200', (await get('/api/admin/vue-agent/' + agentId, manager)).status === 200);

    // Isolation : ni l'agent ni Marine ne doivent pouvoir observer qui que ce soit.
    test('agent : 403', (await get('/api/admin/vue-agent/' + agentId, agent)).status === 403);
    test('courtage : 403', (await get('/api/admin/vue-agent/' + agentId, marine)).status === 403);
    test('sans token : 401', (await fetch(B + '/api/admin/vue-agent/' + agentId)).status === 401);

    test('agent inconnu : 404', (await get('/api/admin/vue-agent/999999', admin)).status === 404);

    // La route est en lecture seule : deux appels successifs ne changent rien.
    const a = await get('/api/admin/vue-agent/' + agentId, admin);
    const b = await get('/api/admin/vue-agent/' + agentId, admin);
    test('lecture seule : resultat stable', JSON.stringify(a.body) === JSON.stringify(b.body));
  } catch (e) {
    console.error('  FAIL exception : ' + e.message); process.exitCode = 1;
  } finally {
    srv.kill();
    for (const f of [DB, DB + '-wal', DB + '-shm']) { try { require('fs').unlinkSync(f) } catch {} }
  }
}, 2500);
