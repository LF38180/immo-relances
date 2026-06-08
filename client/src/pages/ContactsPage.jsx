import { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES, STATUTS } from '../utils/constants'
import { CategorieBadge, StatutBadge, ScoreBadge } from '../components/ContactBadge'
import ContactModal from '../components/ContactModal'
import ImportModal from '../components/ImportModal'
import Icon from '../components/ui/Icon'
import { format } from 'date-fns'

export default function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [categorie, setCategorie] = useState('')
  const [statut, setStatut] = useState('')
  const [sort, setSort] = useState('score_priorite')
  const [order, setOrder] = useState('DESC')
  const [assigned, setAssigned] = useState('')
  const [source, setSource] = useState('')
  const [ville, setVille] = useState('')
  const [users, setUsers] = useState([])
  const [filtreOpts, setFiltreOpts] = useState({ sources: [], villes: [] })
  const [selectedContact, setSelectedContact] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const searchTimer = useRef(null)
  const LIMIT = 50

  const load = async (p = page) => {
    setLoading(true)
    try {
      const r = await api.get('/contacts', {
        params: { page: p, limit: LIMIT, search, categorie, statut, sort, order, assigned_to: assigned, source, ville }
      })
      setContacts(r.data.contacts)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); load(1) }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search, categorie, statut, sort, order, assigned, source, ville])

  useEffect(() => { load() }, [page])

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).catch(() => {})
    api.get('/contacts/filtres').then(r => setFiltreOpts(r.data)).catch(() => {})
  }, [])

  const handleExport = async () => {
    const r = await api.get('/contacts/export/csv', { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url; a.download = 'contacts_export.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export téléchargé')
  }

  const openContact = (c) => { setSelectedContact(c); setShowModal(true) }
  const openNew = () => { setSelectedContact(null); setShowModal(true) }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="flex-1 overflow-hidden flex flex-col pb-24 md:pb-0">
      <div className="bg-white border-b border-quai-border p-4">
        <div className="flex flex-col lg:flex-row lg:flex-wrap gap-3 lg:items-center">
          <input
            className="input flex-1 min-w-0 lg:min-w-[16rem]"
            placeholder="Rechercher (nom, téléphone, ville…)"
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Rechercher un contact"
          />
          <div className="flex flex-wrap gap-3">
            <select className="input w-auto" value={categorie} onChange={e => setCategorie(e.target.value)} aria-label="Filtrer par catégorie">
              <option value="">Toutes catégories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input w-auto" value={statut} onChange={e => setStatut(e.target.value)} aria-label="Filtrer par statut">
              <option value="">Tous statuts</option>
              {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input w-auto" value={assigned} onChange={e => setAssigned(e.target.value)} aria-label="Filtrer par conseiller">
              <option value="">Tous conseillers</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
            </select>
            <select className="input w-auto" value={source} onChange={e => setSource(e.target.value)} aria-label="Filtrer par source">
              <option value="">Toutes sources</option>
              {filtreOpts.sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input w-auto" value={ville} onChange={e => setVille(e.target.value)} aria-label="Filtrer par ville">
              <option value="">Toutes villes</option>
              {filtreOpts.villes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="input w-auto" value={`${sort}:${order}`} onChange={e => { const [s, o] = e.target.value.split(':'); setSort(s); setOrder(o) }} aria-label="Trier">
              <option value="score_priorite:DESC">Score décroissant</option>
              <option value="nom:ASC">Nom A-Z</option>
              <option value="date_dernier_contact:DESC">Dernier contact</option>
              <option value="prochain_contact:ASC">Prochain contact</option>
              <option value="created_at:DESC">Ajouté récemment</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <button onClick={openNew} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Icon name="plus" size="sm" /> Nouveau</button>
            <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="upload" size="sm" /> Importer</button>
            <button onClick={handleExport} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="download" size="sm" /> Exporter</button>
          </div>
        </div>
        <div className="text-xs text-quai-muted mt-2">{total.toLocaleString('fr')} contact(s) trouvé(s)</div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-quai-muted animate-pulse">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-quai-light border-b border-quai-border sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Téléphone</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Ville</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Score</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Dernier contact</th>
                <th className="text-left px-4 py-3 font-medium text-quai-muted">Prochain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-quai-border">
              {contacts.map(c => (
                <tr
                  key={c.id}
                  onClick={() => openContact(c)}
                  className="hover:bg-quai-light cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-quai-navy">{c.civilite ? c.civilite + ' ' : ''}{c.prenom} {c.nom}</div>
                    {c.email && <div className="text-xs text-quai-muted">{c.email}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-quai-text">{c.telephone}</td>
                  <td className="px-4 py-3 text-quai-muted">{c.ville}</td>
                  <td className="px-4 py-3"><CategorieBadge categorie={c.categorie} /></td>
                  <td className="px-4 py-3"><StatutBadge statut={c.statut} /></td>
                  <td className="px-4 py-3"><ScoreBadge score={c.score_priorite} /></td>
                  <td className="px-4 py-3 text-quai-muted text-xs">
                    {c.date_dernier_contact ? format(new Date(c.date_dernier_contact), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-quai-muted text-xs">
                    {c.prochain_contact ? (
                      <span className={new Date(c.prochain_contact) < new Date() ? 'text-red-600 font-medium' : ''}>
                        {format(new Date(c.prochain_contact), 'dd/MM/yyyy')}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="bg-white border-t border-quai-border px-4 py-3 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Icon name="arrow-left" size="sm" /> Précédent</button>
          <span className="text-sm text-quai-muted">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm inline-flex items-center gap-1.5">Suivant <Icon name="arrow-right" size="sm" /></button>
        </div>
      )}

      {showModal && (
        <ContactModal
          contact={selectedContact}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load() }}
        />
      )}
    </div>
  )
}
