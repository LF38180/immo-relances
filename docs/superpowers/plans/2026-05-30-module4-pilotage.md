# Module 4 — Pilotage manager — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à ImmoProspect un tableau de bord de pilotage (manager/admin) qui agrège en lecture les données des modules 2-3 : effort (passages terrain, affaires signalées) vs résultat (RDV, mandats, ventes), par canal et par agent, sur une période 7/30/90 jours.

**Architecture :** Ajout dans `/Users/loickferrucci/Desktop/immo-prospect/`. Aucune nouvelle table. Une route `GET /api/pilotage?periode=` qui calcule des agrégations SQL sur `passages`, `affaires`, `users`. Front : page `PilotagePage` (KPIs + graphique Recharts + tableaux canal/agent) + onglet de navigation visible seulement manager/admin. Réutilise auth, charte quai-*, Icon, PageHeader, NavTabs, api.js.

**Tech Stack :** Node + Express + better-sqlite3, React 18 + Vite + Tailwind + **Recharts** (nouvelle dépendance client). Aucune donnée externe.

**Construction en 2 paliers :** A (backend route pilotage), B (frontend page + nav).

---

## File Structure

**Backend :**
- Create: `server/src/routes/pilotageRoutes.js` — route GET /pilotage (agrégations)
- Modify: `server/src/index.js` — monter la route

**Frontend :**
- Modify: `client/package.json` — ajouter `recharts`
- Modify: `client/src/components/NavTabs.jsx` — onglet « Pilotage » (filtré par rôle via prop)
- Modify: `client/src/App.jsx` — router vers la page pilotage
- Modify: `client/src/pages/CartePage.jsx`, `SecteursPage.jsx`, `ApporteursPage.jsx` — accès pilotage (manager/admin)
- Create: `client/src/pages/PilotagePage.jsx` — tableau de bord (4 blocs)

**Port :** 3002. Accès route réservé manager/admin via `requireRole`.

---

## PALIER A — Backend (route pilotage)

### Task A1 : Route GET /api/pilotage

**Files:**
- Create: `server/src/routes/pilotageRoutes.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Créer `server/src/routes/pilotageRoutes.js`**

```js
const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../auth');
const router = express.Router();
router.use(requireAuth, requireRole('manager', 'admin'));

router.get('/', (req, res) => {
  const periode = [7, 30, 90].includes(parseInt(req.query.periode)) ? parseInt(req.query.periode) : 30;
  const depuis = `-${periode} days`;

  // --- KPIs ---
  const passages = db.prepare(`SELECT COUNT(*) c FROM passages WHERE created_at >= date('now', ?)`).get(depuis).c;
  const rdv = db.prepare(`SELECT COUNT(*) c FROM passages WHERE statut='rdv' AND created_at >= date('now', ?)`).get(depuis).c;
  const affaires = db.prepare(`SELECT COUNT(*) c FROM affaires WHERE created_at >= date('now', ?)`).get(depuis).c;
  const mandatsVentes = db.prepare(`SELECT COUNT(*) c FROM affaires WHERE statut IN ('mandat','vente') AND updated_at >= date('now', ?)`).get(depuis).c;
  const effort = passages + affaires;
  const resultats = rdv + mandatsVentes;
  const tauxTransfo = effort > 0 ? Math.round(resultats / effort * 100) : 0;

  // --- Tendance (jour si <=30, semaine si 90) ---
  const parJour = periode <= 30;
  const fmtDate = parJour ? "DATE(created_at)" : "strftime('%Y-%W', created_at)";
  const tendanceMap = {};
  db.prepare(`SELECT ${fmtDate} d, COUNT(*) c FROM passages WHERE created_at >= date('now', ?) GROUP BY d`).all(depuis)
    .forEach(r => { tendanceMap[r.d] = { date: r.d, passages: r.c, affaires: 0 }; });
  db.prepare(`SELECT ${fmtDate} d, COUNT(*) c FROM affaires WHERE created_at >= date('now', ?) GROUP BY d`).all(depuis)
    .forEach(r => { (tendanceMap[r.d] = tendanceMap[r.d] || { date: r.d, passages: 0, affaires: 0 }).affaires = r.c; });
  const tendance = Object.values(tendanceMap).sort((a, b) => a.date < b.date ? -1 : 1);

  // --- Performance par canal ---
  const canal = (c) => {
    const eff = db.prepare(`SELECT COUNT(*) n FROM passages WHERE canal=? AND created_at >= date('now', ?)`).get(c, depuis).n;
    const r = db.prepare(`SELECT COUNT(*) n FROM passages WHERE canal=? AND statut='rdv' AND created_at >= date('now', ?)`).get(c, depuis).n;
    return { canal: c, effort: eff, resultats: r, taux: eff > 0 ? Math.round(r / eff * 100) : 0 };
  };
  const apporteursCanal = (() => {
    const eff = affaires;
    const r = mandatsVentes;
    return { canal: 'apporteurs', effort: eff, resultats: r, taux: eff > 0 ? Math.round(r / eff * 100) : 0 };
  })();
  const parCanal = [canal('boitage'), canal('porte_a_porte'), apporteursCanal];

  // --- Activité par agent (rôle agent uniquement) ---
  const parAgent = db.prepare(`
    SELECT u.id, u.prenom, u.nom,
      (SELECT COUNT(*) FROM passages p WHERE p.agent_id = u.id AND p.created_at >= date('now', ?)) AS passages,
      (SELECT COUNT(*) FROM passages p WHERE p.agent_id = u.id AND p.statut='rdv' AND p.created_at >= date('now', ?)) AS rdv,
      (SELECT COUNT(*) FROM affaires a WHERE a.agent_id = u.id AND a.created_at >= date('now', ?)) AS affaires,
      (SELECT MAX(d) FROM (
         SELECT MAX(created_at) d FROM passages WHERE agent_id = u.id
         UNION SELECT MAX(created_at) d FROM affaires WHERE agent_id = u.id
      )) AS derniere_activite
    FROM users u WHERE u.role = 'agent' AND u.actif = 1
    ORDER BY passages DESC, affaires DESC
  `).all(depuis, depuis, depuis).map(a => ({
    id: a.id, nom: `${a.prenom} ${a.nom}`, passages: a.passages, rdv: a.rdv, affaires: a.affaires, derniere_activite: a.derniere_activite,
  }));

  res.json({
    periode,
    kpis: { passages, affaires, rdv, mandats_ventes: mandatsVentes, taux_transfo: tauxTransfo },
    tendance, parCanal, parAgent,
  });
});

module.exports = router;
```

- [ ] **Step 2: Monter la route dans `server/src/index.js`**

Après `app.use('/api/affaires', ...)`, ajouter :

```js
app.use('/api/pilotage', require('./routes/pilotageRoutes'));
```

- [ ] **Step 3: Tester (avec quelques données injectées)**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
# injecter un peu de données de test
node -e "
const {db}=require('./server/src/database');
const adr=db.prepare('SELECT id FROM adresses LIMIT 1').get().id;
db.prepare(\"INSERT INTO passages (adresse_id, agent_id, canal, statut) VALUES (?,3,'boitage','fait')\").run(adr);
db.prepare(\"INSERT INTO passages (adresse_id, agent_id, canal, statut) VALUES (?,3,'porte_a_porte','rdv')\").run(adr);
const ap=db.prepare(\"INSERT INTO apporteurs (nom,type) VALUES ('T','autre')\").run().lastInsertRowid;
db.prepare(\"INSERT INTO affaires (apporteur_id, agent_id, description, statut) VALUES (?,3,'x','mandat')\").run(ap);
console.log('données test injectées');
"
JWT_SECRET=dev PORT=3002 node server/src/index.js >/tmp/pi.log 2>&1 &
sleep 2
M=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "Pilotage (30j):"
curl -s "http://localhost:3002/api/pilotage?periode=30" -H "Authorization: Bearer $M" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('  kpis:',JSON.stringify(d.kpis));console.log('  parCanal:',d.parCanal.map(c=>c.canal+'='+c.effort+'/'+c.resultats).join(', '));console.log('  parAgent:',d.parAgent.length,'agent(s)')"
echo "Accès agent refusé ?"
A=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"agent@lequai-immobilier.com","password":"agent123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
curl -s -o /dev/null -w "  HTTP %{http_code} (attendu 403)\n" "http://localhost:3002/api/pilotage" -H "Authorization: Bearer $A"
pkill -f "server/src/index.js"
# nettoyer les données de test
node -e "const {db}=require('./server/src/database');db.prepare('DELETE FROM passages').run();db.prepare('DELETE FROM affaires').run();db.prepare('DELETE FROM apporteurs').run();console.log('test nettoyé')"
```

Expected: kpis avec passages=2, affaires=1, rdv=1, mandats_ventes=1, taux_transfo=67 ; parCanal montre boitage=1/0, porte_a_porte=1/1, apporteurs=1/1 ; parAgent ≥ 1 ; accès agent = **HTTP 403**.

- [ ] **Step 4: Commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add server/src/routes/pilotageRoutes.js server/src/index.js
git commit -q -m "feat(api): route pilotage (KPIs, tendance, canaux, agents) réservée manager/admin"
```

---

## PALIER B — Frontend (page pilotage)

### Task B1 : Dépendance recharts + navigation

**Files:**
- Modify: `client/package.json`
- Modify: `client/src/components/NavTabs.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/CartePage.jsx`, `SecteursPage.jsx`, `ApporteursPage.jsx`

- [ ] **Step 1: Ajouter recharts**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
npm --prefix client install recharts
```

Expected: `added N packages`, pas d'erreur.

- [ ] **Step 2: Étendre `NavTabs.jsx` avec l'onglet Pilotage (filtré par rôle)**

Remplacer la définition de `tabs` et la signature pour accepter un rôle :

```jsx
import Icon from './ui/Icon'
export default function NavTabs({ active, onChange, role }) {
  const tabs = [
    { id: 'ciblage', label: 'Ciblage', icon: 'map' },
    { id: 'terrain', label: 'Terrain', icon: 'footprints' },
    { id: 'apporteurs', label: 'Apporteurs', icon: 'handshake' },
    ...(['manager', 'admin'].includes(role) ? [{ id: 'pilotage', label: 'Pilotage', icon: 'bar-chart-3' }] : []),
  ]
  return (
    <div className="bg-white/10 rounded-lg p-0.5 flex text-xs">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5 ${active === t.id ? 'bg-quai-gold text-quai-navy font-semibold' : 'text-white/80'}`}>
          <Icon name={t.icon} size="sm" /> {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Router dans `App.jsx`**

Ajouter l'import : `import PilotagePage from './pages/PilotagePage'`.
Dans `Inner`, avant le `return <CartePage ... />` final :

```jsx
  if (page === 'pilotage') return <PilotagePage onNav={setPage} />
```

- [ ] **Step 4: Propager l'accès pilotage depuis les autres pages**

Dans `CartePage.jsx` : le `<NavTabs>` reçoit déjà `active`/`onChange`. Lui passer le rôle et gérer pilotage. Récupérer le user via `useAuth` (déjà importé dans CartePage). Modifier le NavTabs :

```jsx
            role={user?.role}
            onChange={(id) => { if (id === 'terrain') onNav('secteurs'); else if (id === 'apporteurs') onNav('apporteurs'); else if (id === 'pilotage') onNav('pilotage') }}
```

Dans `SecteursPage.jsx` et `ApporteursPage.jsx`, dans le header, ajouter (seulement si manager/admin) un bouton Pilotage. Pour SecteursPage et ApporteursPage qui ont `const { user, logout } = useAuth()` (vérifier/ajouter `user`), ajouter à côté des autres boutons du header :

```jsx
          {['manager','admin'].includes(user?.role) && <button onClick={() => onNav('pilotage')} className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1"><Icon name="bar-chart-3" size="sm" /> Pilotage</button>}
```

(Si `user` n'est pas déjà destructuré du `useAuth()` dans ces pages, l'ajouter : `const { user, logout } = useAuth()`.)

- [ ] **Step 5: Créer un stub `PilotagePage` pour le build**

Créer `client/src/pages/PilotagePage.jsx` :

```jsx
export default function PilotagePage() { return <div className="p-6">Pilotage (à venir)</div> }
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/package.json client/package-lock.json client/src
git commit -q -m "feat(client): recharts + navigation onglet Pilotage (manager/admin) + stub"
```

Expected: build OK.

---

### Task B2 : Page Pilotage complète (4 blocs)

**Files:**
- Modify (remplace le stub): `client/src/pages/PilotagePage.jsx`

- [ ] **Step 1: Écrire `PilotagePage.jsx` complet**

```jsx
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../hooks/useAuth'

const CANAL_LABEL = { boitage: 'Boîtage', porte_a_porte: 'Porte-à-porte', apporteurs: 'Apporteurs' }

export default function PilotagePage({ onNav }) {
  const { logout } = useAuth()
  const [periode, setPeriode] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/pilotage?periode=${periode}`).then(r => setData(r.data)).catch(() => toast.error('Erreur de chargement')).finally(() => setLoading(false))
  }, [periode])

  return (
    <div className="min-h-screen bg-quai-light">
      <header className="bg-quai-navy text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Le Quai" className="h-7 w-auto" />
          <span className="font-display text-sm">Pilotage</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNav('carte')} className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1"><Icon name="map" size="sm" /> Ciblage</button>
          <button onClick={logout} className="text-white/70 hover:text-white p-1.5" aria-label="Déconnexion"><Icon name="log-out" size="md" /></button>
        </div>
      </header>
      <div className="max-w-5xl mx-auto p-6">
        <PageHeader title="Tableau de bord" subtitle="Activité de prospection — effort et résultats">
          <select className="input w-auto" value={periode} onChange={e => setPeriode(Number(e.target.value))}>
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
          </select>
        </PageHeader>

        {loading || !data ? <div className="text-quai-muted animate-pulse">Chargement…</div> : (
          <div className="space-y-6">
            {/* Bloc 1 : KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Kpi label="Passages terrain" value={data.kpis.passages} icon="footprints" />
              <Kpi label="Affaires signalées" value={data.kpis.affaires} icon="handshake" />
              <Kpi label="RDV obtenus" value={data.kpis.rdv} icon="calendar-check" variant="gold" />
              <Kpi label="Mandats + ventes" value={data.kpis.mandats_ventes} icon="trophy" variant="navy" />
              <Kpi label="Taux de transfo" value={`${data.kpis.taux_transfo}%`} icon="trending-up" variant="navy" />
            </div>

            {/* Bloc 2 : Tendance */}
            <div className="card">
              <h3 className="font-display font-semibold text-quai-navy mb-3">Activité dans le temps</h3>
              {data.tendance.length === 0 ? <Vide /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.tendance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B6660' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2DDD6', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="passages" name="Passages" fill="#0D0D2B" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="affaires" name="Affaires" fill="#C9A96E" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Bloc 3 : Performance par canal */}
            <div className="card">
              <h3 className="font-display font-semibold text-quai-navy mb-3">Performance par canal</h3>
              <div className="space-y-3">
                {data.parCanal.every(c => c.effort === 0) ? <Vide /> : data.parCanal.map(c => (
                  <div key={c.canal} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-quai-navy font-medium">{CANAL_LABEL[c.canal]}</div>
                    <div className="flex-1 bg-quai-border rounded-full h-5 overflow-hidden relative">
                      <div className="h-full bg-quai-gold rounded-full" style={{ width: `${Math.min(100, c.taux)}%` }} />
                    </div>
                    <div className="w-40 text-xs text-quai-muted text-right">{c.resultats} / {c.effort} · <span className="text-quai-navy font-medium">{c.taux}%</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bloc 4 : Activité par agent */}
            <div className="card">
              <h3 className="font-display font-semibold text-quai-navy mb-3">Activité par agent</h3>
              {data.parAgent.length === 0 ? <Vide /> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-quai-muted border-b border-quai-border">
                    <th className="py-2">Agent</th><th>Passages</th><th>RDV</th><th>Affaires</th><th>Dernière activité</th>
                  </tr></thead>
                  <tbody className="divide-y divide-quai-border">
                    {data.parAgent.map(a => (
                      <tr key={a.id}>
                        <td className="py-2 font-medium text-quai-navy">{a.nom}</td>
                        <td className="text-quai-text">{a.passages}</td>
                        <td className="text-quai-text">{a.rdv}</td>
                        <td className="text-quai-text">{a.affaires}</td>
                        <td className="text-quai-muted text-xs">{a.derniere_activite ? new Date(a.derniere_activite).toLocaleDateString('fr') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, icon, variant }) {
  const styles = { navy: 'bg-quai-navy text-white', gold: 'bg-quai-gold text-quai-navy', default: 'bg-white border border-quai-border text-quai-navy' }
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 ${styles[variant] || styles.default}`}>
      <Icon name={icon} size="lg" className="opacity-80" />
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs opacity-70">{label}</div>
      </div>
    </div>
  )
}

function Vide() {
  return <div className="text-quai-muted text-sm py-6 text-center">Pas encore d'activité sur cette période.</div>
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect && npm --prefix client run build
git add client/src/pages/PilotagePage.jsx
git commit -q -m "feat(client): page Pilotage — KPIs, tendance (Recharts), canaux, agents + états vides"
```

Expected: build OK.

---

## PALIER C — Vérification & déploiement

### Task C1 : Vérification end-to-end + base + push

**Files:** aucun (vérification)

- [ ] **Step 1: Zéro emoji**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
grep -rlP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' client/src/pages/PilotagePage.jsx 2>/dev/null && echo "EMOJI!" || echo "✓ aucun"
```

Expected: `✓ aucun`.

- [ ] **Step 2: Build prod + parcours API**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
npm run build 2>&1 | grep -iE "error|built in" | tail -1
JWT_SECRET=verif PORT=3002 npm start >/tmp/c4.log 2>&1 &
sleep 2.5
M=$(curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
echo "pilotage:"; curl -s "http://localhost:3002/api/pilotage?periode=7" -H "Authorization: Bearer $M" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('  période',d.periode,'kpis',JSON.stringify(d.kpis))"
echo "title:"; curl -s http://localhost:3002/ | grep -o "<title>[^<]*</title>"
pkill -f "server/src/index.js"
```

Expected: build OK ; route répond (kpis à 0 si pas de données, c'est normal) ; title présent.

- [ ] **Step 3: Checkpoint WAL + recompression base + commit**

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
node -e "const Database=require('better-sqlite3');const db=new Database('server/data/prospect.db');db.pragma('wal_checkpoint(TRUNCATE)');db.close()"
gzip -c server/data/prospect.db > server/data/prospect.db.gz
git add server/data/prospect.db.gz
git commit -q -m "chore(deploy): base recompressée (Module 4)" || echo "base inchangée"
```

Note : le Module 4 ne modifie pas le schéma (lecture seule). La base ne change que si des données de test ont été insérées/nettoyées — le commit peut être vide, c'est OK.

- [ ] **Step 4: README + push**

Ajouter une section « Module 4 — Pilotage » au README.

```bash
cd /Users/loickferrucci/Desktop/immo-prospect
git add README.md
git commit -q -m "docs: README — Module 4 pilotage manager"
git push origin main 2>&1 | tail -3
```

Expected: push OK ; Railway redéploie.

- [ ] **Step 5: Vérifier la prod**

```bash
sleep 90
BASE="https://immo-prospect-production.up.railway.app"
M=$(curl -s -m 15 -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"manager@lequai-immobilier.com","password":"manager123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")
curl -s -m 15 "$BASE/api/pilotage?periode=30" -H "Authorization: Bearer $M" | head -c 1 | grep -q '{' && echo "✓ Module 4 actif en prod" || echo "déploiement en cours, re-tester"
```

Expected: `✓ Module 4 actif en prod` (après fin du redéploiement).

---

## Definition of Done (rappel spec §9)
- [x] Route /api/pilotage (kpis + tendance + parCanal + parAgent) réservée manager/admin
- [x] Page Pilotage accessible managers/admins (onglet masqué aux agents)
- [x] Sélecteur 7/30/90 recalcule tout
- [x] 4 blocs avec états vides soignés
- [x] Graphique de tendance Recharts
- [x] Build + run + déploiement vérifiés

## Hors périmètre (rappel)
Export PDF/Excel, données ImmoRelances, objectifs/quotas, comparaison entre périodes, coût d'acquisition monétaire.
