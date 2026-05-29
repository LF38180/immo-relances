import { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { CATEGORIES, STATUTS } from '../utils/constants'
import { CategorieBadge, StatutBadge, ScoreBadge, PotentielStars } from '../components/ContactBadge'
import ContactModal from '../components/ContactModal'
import ImportModal from '../components/ImportModal'
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
  const [selectedContact, setSelectedContact] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const searchTimer = useRef(null)
  const LIMIT = 50

  const load = async (p = page) => {
    setLoading(true)
    try {
      const r = await api.get('/contacts', {
        params: { page: p, limit: LIMIT, search, categorie, statut, sort, order }
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
  }, [search, categorie, statut, sort, order])

  useEffect(() => { load() }, [page])

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
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            className="input flex-1 min-w-48"
            placeholder="Rechercher (nom, téléphone, ville...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="input w-auto" value={categorie} onChange={e => setCategorie(e.target.value)}>
            <option value="">Toutes catégories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input w-auto" value={statut} onChange={e => setStatut(e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input w-auto" value={`${sort}:${order}`} onChange={e => { const [s, o] = e.target.value.split(':'); setSort(s); setOrder(o) }}>
            <option value="score_priorite:DESC">Score ↓</option>
            <option value="nom:ASC">Nom A-Z</option>
            <option value="date_dernier_contact:DESC">Dernier contact ↓</option>
            <option value="prochain_contact:ASC">Prochain contact ↑</option>
            <option value="created_at:DESC">Ajouté récemment</option>
          </select>
          <button onClick={openNew} className="btn-primary btn-sm">+ Nouveau</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm">📥 Import CSV</button>
          <button onClick={handleExport} className="btn-secondary btn-sm">📤 Export</button>
        </div>
        <div className="text-xs text-gray-500 mt-2">{total.toLocaleString('fr')} contact(s) trouvé(s)</div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 animate-pulse">Chargement...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ville</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dernier contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Prochain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map(c => (
                <tr
                  key={c.id}
                  onClick={() => openContact(c)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.prenom} {c.nom}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{c.telephone}</td>
                  <td className="px-4 py-3 text-gray-600">{c.ville}</td>
                  <td className="px-4 py-3"><CategorieBadge categorie={c.categorie} /></td>
                  <td className="px-4 py-3"><StatutBadge statut={c.statut} /></td>
                  <td className="px-4 py-3"><ScoreBadge score={c.score_priorite} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.date_dernier_contact ? format(new Date(c.date_dernier_contact), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
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
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm">← Précédent</button>
          <span className="text-sm text-gray-600">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm">Suivant →</button>
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
