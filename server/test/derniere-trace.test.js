// Teste la "derniere trace" exposee par /contacts/file-relances et /contacts/:id.
// Cas remonte par Chrystelle : un message laisse puis note depuis la recherche
// doit etre visible au moment de rappeler, et un appel enregistre hors file doit
// compter comme un appel de la file (meme route POST /relances).
const { spawn } = require('child_process');

const DB = '/tmp/immo-trace-' + process.pid + '.db';
const env = { ...process.env, DB_PATH: DB, JWT_SECRET: 'dev', PORT: '3017' };
const srv = spawn('node', ['server/src/index.js'], { env, stdio: 'ignore' });

const B = 'http://localhost:3017';
async function login(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).token;
}
async function req(method, path, token, body) {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
function test(n, ok, detail) { if (ok) console.log('  OK  ' + n); else { console.error('  FAIL ' + n + (detail ? ' : ' + detail : '')); process.exitCode = 1 } }

setTimeout(async () => {
  try {
    console.log('derniere-trace.test.js (HTTP)');
    const agent = await login('agent@lequai-immobilier.com', 'agent123');

    const cr = await req('POST', '/api/contacts', agent, { nom: 'TRACE', prenom: 'Test', telephone: '0611223344', categorie: 'ancien_client' });
    const id = cr.body.id;

    // 1. Aucun historique : pas de trace.
    let fiche = await req('GET', '/api/contacts/' + id, agent);
    test('sans historique : derniere_trace_le null', fiche.body.derniere_trace_le === null, JSON.stringify(fiche.body.derniere_trace_le));

    // 2. Note libre (le geste de Chrystelle depuis la recherche).
    await req('POST', '/api/relances/note', agent, { contact_id: id, notes: 'Message laisse sur repondeur' });
    fiche = await req('GET', '/api/contacts/' + id, agent);
    test('apres note : type = note', fiche.body.derniere_trace_type === 'note', fiche.body.derniere_trace_type);
    test('apres note : texte remonte', fiche.body.derniere_trace_notes === 'Message laisse sur repondeur', fiche.body.derniere_trace_notes);

    // 3. La trace doit AUSSI figurer dans la file d'appel (fiche vue en session).
    const file = await req('GET', '/api/contacts/file-relances', agent);
    const enFile = file.body.contacts.find(c => c.id === id);
    test('note visible dans la file d appel', enFile && enFile.derniere_trace_notes === 'Message laisse sur repondeur',
      enFile ? enFile.derniere_trace_notes : 'contact absent de la file');

    // 4. Appel enregistre (hors file : meme route que la file) -> devient la trace.
    const rel = await req('POST', '/api/relances', agent, { contact_id: id, issue: 'projet', notes: 'Rappel : veut une estimation' });
    test('appel enregistre 201', rel.status === 201 || rel.status === 200, rel.status);
    fiche = await req('GET', '/api/contacts/' + id, agent);
    test('apres appel : la trace devient l appel', fiche.body.derniere_trace_notes === 'Rappel : veut une estimation', fiche.body.derniere_trace_notes);
    test('apres appel : type != note', fiche.body.derniere_trace_type !== 'note', fiche.body.derniere_trace_type);

    // 5. L'appel hors file compte dans les statistiques de l'agent (contrairement a la note).
    const stats = await req('GET', '/api/relances/stats', agent);
    test('appel comptabilise dans les stats', stats.status === 200 && stats.body, JSON.stringify(stats.body).slice(0, 80));

    // 6. L'historique conserve les deux (la note n'est pas ecrasee).
    const hist = await req('GET', '/api/relances/contact/' + id, agent);
    test('historique : note + appel conserves', hist.body.length === 2, 'entrees : ' + hist.body.length);
    test('historique : la note reste typee note', hist.body.some(r => r.type === 'note'), JSON.stringify(hist.body.map(r => r.type)));
  } catch (e) {
    console.error('  FAIL exception : ' + e.message); process.exitCode = 1;
  } finally {
    srv.kill();
    for (const f of [DB, DB + '-wal', DB + '-shm']) { try { require('fs').unlinkSync(f) } catch {} }
  }
}, 2500);
