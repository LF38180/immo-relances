// Teste la base du module courtage : migration users (CHECK + must_change_password,
// table-swap FK-safe), seed Marine, tables courtage_*, parametres courtage_*.
// Reproduit le cas prod : base existante ancien schema, FK actives, lignes relances/contacts
// qui referencent users -> la migration doit passer sans casser les donnees existantes.
const assert = require('assert')
const fs = require('fs')

const DB_PATH = '/tmp/immo-test-courtage-base-' + process.pid + '.db'
for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) { try { fs.unlinkSync(f) } catch {} }
process.env.DB_PATH = DB_PATH
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'

// 1. Pre-creation d'une base "prod" a l'ancien schema (pas de courtage, pas de last_login).
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
{
  const old = new Database(DB_PATH)
  old.pragma('foreign_keys = ON')
  old.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL, prenom TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('agent', 'manager', 'admin')),
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      categorie TEXT NOT NULL DEFAULT 'autre',
      score_priorite INTEGER NOT NULL DEFAULT 50,
      prochain_contact TEXT,
      statut TEXT NOT NULL DEFAULT 'a_contacter',
      assigned_to INTEGER REFERENCES users(id)
    );
    CREATE TABLE relances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES users(id),
      statut TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  const hash = bcrypt.hashSync('x', 4)
  old.prepare("INSERT INTO users (nom,prenom,email,password,role) VALUES ('Admin','Le Quai','admin@lequai-immobilier.com',?, 'admin')").run(hash)
  const agentId = old.prepare("INSERT INTO users (nom,prenom,email,password,role) VALUES ('Dupont','Marie','agent@lequai-immobilier.com',?, 'agent')").run(hash).lastInsertRowid
  const cId = old.prepare('INSERT INTO contacts (nom, assigned_to) VALUES (?, ?)').run('ContactProd', agentId).lastInsertRowid
  old.prepare('INSERT INTO relances (contact_id, agent_id, statut) VALUES (?,?,?)').run(cId, agentId, 'contacte')
  old.close()
}

// 2. Charger database.js -> les migrations doivent s'executer (dont le table-swap).
const { db } = require('../src/database')

function test(n, fn) { try { fn(); console.log('  OK  ' + n) } catch (e) { console.error('  FAIL ' + n + ' : ' + e.message); process.exitCode = 1 } }
console.log('courtage-base.test.js')

test('CHECK users contient courtage', () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql
  assert.ok(/'courtage'/.test(sql), sql)
})

test('pas de table users_new residuelle', () => {
  const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users_new'").get()
  assert.strictEqual(r, undefined)
})

test('colonnes must_change_password et last_login presentes', () => {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name)
  assert.ok(cols.includes('must_change_password'))
  assert.ok(cols.includes('last_login'))
})

test('Marine existe : role courtage, active', () => {
  const m = db.prepare('SELECT * FROM users WHERE email = ?').get('marine.rosain@lequai-immobilier.com')
  assert.ok(m, 'Marine absente')
  assert.strictEqual(m.role, 'courtage')
  // TEMPORAIRE : gate désactivée le temps des tests de Loïck (voir database.js) —
  // repasser cette assertion à 1 quand la ligne temporaire sera retirée.
  assert.strictEqual(m.must_change_password, 0)
  assert.strictEqual(m.actif, 1)
  assert.ok(bcrypt.compareSync('MarineLeQuai', m.password))
})

test('users existants intacts apres migration (roles et ids inchanges)', () => {
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@lequai-immobilier.com')
  const agent = db.prepare('SELECT * FROM users WHERE email = ?').get('agent@lequai-immobilier.com')
  assert.ok(admin && admin.role === 'admin' && admin.id === 1)
  assert.ok(agent && agent.role === 'agent' && agent.id === 2)
  assert.strictEqual(agent.must_change_password, 0)
})

test('donnees FK (contacts/relances) intactes apres le swap', () => {
  const c = db.prepare("SELECT * FROM contacts WHERE nom = 'ContactProd'").get()
  assert.ok(c && c.assigned_to === 2)
  const r = db.prepare('SELECT * FROM relances WHERE contact_id = ?').get(c.id)
  assert.ok(r && r.agent_id === 2)
  assert.strictEqual(db.pragma('foreign_key_check', { simple: false }).length, 0)
})

test('foreign_keys reactivees apres migration', () => {
  assert.strictEqual(db.pragma('foreign_keys', { simple: true }), 1)
})

test('tables courtage presentes', () => {
  for (const t of ['courtage_fiches', 'courtage_actions', 'courtage_blacklist', 'courtage_demandes']) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all()
    assert.ok(cols.length > 0, 'table manquante : ' + t)
  }
  const fCols = db.prepare('PRAGMA table_info(courtage_fiches)').all().map(c => c.name)
  for (const col of ['telephone_norm', 'mail_norm', 'statut', 'prochaine_relance', 'tentatives_sans_reponse', 'mail_propose_le', 'priorite']) {
    assert.ok(fCols.includes(col), 'colonne manquante : ' + col)
  }
})

test('parametres courtage_* presents', () => {
  const params = {}
  db.prepare("SELECT cle, valeur FROM parametres WHERE cle LIKE 'courtage_%'").all().forEach(r => { params[r.cle] = r.valeur })
  assert.strictEqual(params.courtage_delai_relance_jours, '7')
  assert.strictEqual(params.courtage_tentatives_max, '2')
  assert.strictEqual(params.courtage_tel_marine, '')
  assert.ok(params.courtage_mail_objet.includes('financement'))
  assert.ok(params.courtage_mail_corps.includes('[Prénom]') && params.courtage_mail_corps.includes('[BIEN]') && params.courtage_mail_corps.includes('[TEL_MARINE]'))
  assert.strictEqual(params.courtage_exclusion_agents, 'POITEVIN Lyes,BARRETO Nolan')
})

test('parametres existants non ecrases', () => {
  const p = db.prepare("SELECT valeur FROM parametres WHERE cle = 'delai_sans_reponse_jours'").get()
  assert.ok(p)
})
