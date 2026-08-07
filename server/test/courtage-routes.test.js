// Teste les routes /api/courtage : cycle complet des relances courtage (Marine),
// isolation stricte (agent 403, admin lecture seule) et mail modele. HTTP reel (spawn serveur).
const { spawn } = require('child_process');

const env = { ...process.env, DB_PATH: '/tmp/immo-courtage-routes-' + process.pid + '.db', JWT_SECRET: 'dev', PORT: '3014' };
const srv = spawn('node', ['server/src/index.js'], { env, stdio: 'ignore' });

const B = 'http://localhost:3014';
async function loginFull(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return r.json();
}
async function req(method, path, token, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
function test(n, ok, detail) { if (ok) console.log('  OK  ' + n); else { console.error('  FAIL ' + n + (detail ? ' : ' + detail : '')); process.exitCode = 1 } }

setTimeout(async () => {
  try {
    console.log('courtage-routes.test.js (HTTP)');
    const auj = new Date().toISOString().slice(0, 10);
    const j7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Login Marine : must_change_password present dans la reponse.
    const loginMarine = await loginFull('marine.rosain@lequai-immobilier.com', 'MarineLeQuai');
    // TEMPORAIRE : gate desactivee (phase de test Loick, voir database.js) -> attendu 0.
    test('login Marine renvoie must_change_password (0 temporaire)', loginMarine.user && loginMarine.user.must_change_password === 0, JSON.stringify(loginMarine.user));
    test('login Marine renvoie role courtage', loginMarine.user && loginMarine.user.role === 'courtage');
    const marine = loginMarine.token;
    const agent = (await loginFull('agent@lequai-immobilier.com', 'agent123')).token;
    const admin = (await loginFull('admin@lequai-immobilier.com', 'admin123')).token;

    // Creation fiche : 201, statut en_relance, prochaine_relance J+7 par defaut.
    const cr = await req('POST', '/api/courtage/fiches', marine, { nom: 'Durand', prenom: 'Alice', telephone: '+33 6 12 34 56 78', mail: 'Alice.Durand@Test.fr', reference_bien: 'REF123', montant_projet: '250000' });
    test('creation fiche 201', cr.status === 201, cr.status + ' ' + JSON.stringify(cr.body));
    test('fiche statut en_relance', cr.body.statut === 'en_relance');
    test('prochaine_relance = J+7 par defaut', cr.body.prochaine_relance === j7, cr.body.prochaine_relance);
    test('telephone normalise (33 -> 0)', cr.body.telephone_norm === '0612345678', cr.body.telephone_norm);
    test('mail normalise en minuscules', cr.body.mail_norm === 'alice.durand@test.fr', cr.body.mail_norm);
    const f1 = cr.body.id;

    // Detail : demande creee via reference_bien + action creation.
    const det = await req('GET', '/api/courtage/fiches/' + f1, marine);
    test('detail : demande creee (reference_bien)', det.body.demandes.length === 1 && det.body.demandes[0].reference_bien === 'REF123', JSON.stringify(det.body.demandes));
    test('detail : action creation historisee', det.body.actions.some(a => a.type === 'creation'), JSON.stringify(det.body.actions));

    // relances-jour : vide (J+7 futur), puis une fiche a date passee apparait, triee.
    let rj = await req('GET', '/api/courtage/fiches/relances-jour', marine);
    test('relances-jour vide quand relance future', rj.body.length === 0, JSON.stringify(rj.body));
    const cr2 = await req('POST', '/api/courtage/fiches', marine, { nom: 'Martin', prenom: 'Bob', telephone: '0699887766', prochaine_relance: hier, commentaire: 'a rappeler vite' });
    const f2 = cr2.body.id;
    rj = await req('GET', '/api/courtage/fiches/relances-jour', marine);
    test('fiche a date passee dans relances-jour', rj.body.length === 1 && rj.body[0].id === f2, JSON.stringify(rj.body.map(x => x.id)));
    test('relances-jour renvoie le dernier commentaire', rj.body[0].dernier_commentaire === 'a rappeler vite', rj.body[0].dernier_commentaire);

    // Relance faite : commentaire requis, historisee, date mise a jour.
    const sansCom = await req('POST', '/api/courtage/fiches/' + f2 + '/relance', marine, {});
    test('relance sans commentaire refusee 400', sansCom.status === 400, sansCom.status);
    const rel = await req('POST', '/api/courtage/fiches/' + f2 + '/relance', marine, { commentaire: 'appel ok, veut une simulation', prochaine_relance: j7 });
    test('relance faite : prochaine_relance mise a jour', rel.status === 200 && rel.body.prochaine_relance === j7, JSON.stringify(rel.body));
    const det2 = await req('GET', '/api/courtage/fiches/' + f2, marine);
    test('relance historisee avec commentaire', det2.body.actions.some(a => a.type === 'relance' && a.commentaire === 'appel ok, veut une simulation'), JSON.stringify(det2.body.actions));

    // Trop tot : +7 jours.
    const tt = await req('POST', '/api/courtage/fiches/' + f2 + '/trop-tot', marine, {});
    test('trop-tot decale a J+7', tt.status === 200 && tt.body.prochaine_relance === j7, tt.body.prochaine_relance);

    // Pas de reponse x2 -> injoignable, retour demain.
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const p1 = await req('POST', '/api/courtage/fiches/' + f1 + '/pas-de-reponse', marine, {});
    test('pas-de-reponse 1 : tentatives=1, statut inchange', p1.body.tentatives === 1 && p1.body.statut === 'en_relance', JSON.stringify(p1.body));
    const p2 = await req('POST', '/api/courtage/fiches/' + f1 + '/pas-de-reponse', marine, {});
    test('pas-de-reponse 2 : statut injoignable', p2.body.tentatives === 2 && p2.body.statut === 'injoignable', JSON.stringify(p2.body));
    const f1apres = await req('GET', '/api/courtage/fiches/' + f1, marine);
    test('pas-de-reponse : prochaine_relance = demain', f1apres.body.prochaine_relance === demain, f1apres.body.prochaine_relance);

    // Mail modele : mailto avec destinataire, prenom, ref bien.
    const mm = await req('GET', '/api/courtage/mail-modele/' + f1, marine);
    test('mail-modele : mailto vers le bon destinataire', mm.status === 200 && mm.body.mailto.startsWith('mailto:Alice.Durand@Test.fr?subject='), mm.body && mm.body.mailto);
    test('mail-modele : prenom substitue dans le corps', mm.body.mailto.includes(encodeURIComponent('Bonjour Alice')), mm.body.mailto);
    test('mail-modele : reference bien substituee', mm.body.mailto.includes(encodeURIComponent('(REF123)')), mm.body.mailto);

    // Mail propose : mail_propose_le pose, relance J+7.
    const mp = await req('POST', '/api/courtage/fiches/' + f1 + '/mail-propose', marine, {});
    test('mail-propose : date posee et relance J+7', mp.body.mail_propose_le === auj && mp.body.prochaine_relance === j7, JSON.stringify(mp.body));

    // Statuts : whitelist, gagne -> relance NULL.
    const badSt = await req('PUT', '/api/courtage/fiches/' + f2 + '/statut', marine, { statut: 'nimporte' });
    test('statut hors whitelist refuse 400', badSt.status === 400, badSt.status);
    const st = await req('PUT', '/api/courtage/fiches/' + f2 + '/statut', marine, { statut: 'gagne' });
    test('statut gagne : prochaine_relance NULL', st.body.statut === 'gagne' && st.body.prochaine_relance === null, JSON.stringify(st.body));

    // Ne plus contacter -> blacklist -> re-creation meme tel refusee 409.
    const npc = await req('PUT', '/api/courtage/fiches/' + f1 + '/statut', marine, { statut: 'ne_plus_contacter' });
    test('ne_plus_contacter : relance NULL', npc.body.statut === 'ne_plus_contacter' && npc.body.prochaine_relance === null, JSON.stringify(npc.body));
    const rec = await req('POST', '/api/courtage/fiches', marine, { nom: 'Durand', telephone: '0612345678' });
    test('re-creation meme tel apres blacklist refusee 409', rec.status === 409, rec.status + ' ' + JSON.stringify(rec.body));
    const recMail = await req('POST', '/api/courtage/fiches', marine, { nom: 'Durand', mail: 'alice.durand@test.fr' });
    test('re-creation meme mail apres blacklist refusee 409', recMail.status === 409, recMail.status);

    // ISOLATION : agent (Chrystelle) -> 403 partout ; admin -> lecture 200, ecriture 403.
    const agPost = await req('POST', '/api/courtage/fiches', agent, { nom: 'Intrus' });
    test('isolation : agent POST /fiches 403', agPost.status === 403, agPost.status);
    const agGet = await req('GET', '/api/courtage/fiches', agent);
    test('isolation : agent GET /fiches 403', agGet.status === 403, agGet.status);
    const adGet = await req('GET', '/api/courtage/fiches', admin);
    test('isolation : admin GET /fiches 200', adGet.status === 200, adGet.status);
    const adPost = await req('POST', '/api/courtage/fiches', admin, { nom: 'AdminIntrus' });
    test('isolation : admin POST /fiches 403', adPost.status === 403, adPost.status);
    const adPut = await req('PUT', '/api/courtage/fiches/' + f2 + '/statut', admin, { statut: 'perdu' });
    test('isolation : admin PUT /statut 403', adPut.status === 403, adPut.status);

    // Dashboard : 200 pour Marine et admin, chiffres coherents.
    const dashM = await req('GET', '/api/courtage/dashboard', marine);
    test('dashboard Marine 200', dashM.status === 200, dashM.status);
    test('dashboard : parStatut et compteurs presents', Array.isArray(dashM.body.parStatut) && typeof dashM.body.relancesSemaine === 'number' && typeof dashM.body.aRelancerAujourdhui === 'number', JSON.stringify(dashM.body));
    test('dashboard : relancesSemaine compte la relance faite', dashM.body.relancesSemaine === 1, dashM.body.relancesSemaine);
    const dashA = await req('GET', '/api/courtage/dashboard', admin);
    test('dashboard admin 200', dashA.status === 200, dashA.status);
  } catch (e) {
    console.error('  FAIL exception : ' + e.message); process.exitCode = 1;
  } finally { srv.kill(); }
}, 2500);
