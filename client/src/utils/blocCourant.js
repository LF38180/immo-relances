// Le fichier (« bloc ») sur lequel on travaille, pour qui en a plusieurs.
//
// Qui n'a qu'un fichier (Chrystelle aujourd'hui) n'a rien à choisir : aucune
// valeur n'est posée, aucune demande n'est modifiée, ses écrans sont identiques.
// Le choix vit dans l'onglet du navigateur : il se remet à « tous mes fichiers »
// à la fermeture.
const CLE = 'bloc-courant'
export function blocCourant() {
  try { const v = sessionStorage.getItem(CLE); return v ? Number(v) : null } catch { return null }
}
export function choisirBloc(id) {
  try { id ? sessionStorage.setItem(CLE, String(id)) : sessionStorage.removeItem(CLE) } catch { /* stockage indisponible */ }
}
// Les demandes qui portent sur un fichier : listes, file d'appels, rappels, suivi,
// export, et la création ou l'import d'une fiche. Jamais la modification d'une
// fiche existante (elle garde son fichier), ni la corbeille, ni « tout effacer ».
export function ajouterBloc(config) {
  const bloc = blocCourant()
  if (!bloc) return config
  const url = String(config.url || '').split('?')[0]
  const methode = String(config.method || 'get').toLowerCase()
  const LECTURES = ['/contacts', '/contacts/file-relances', '/contacts/filtres', '/contacts/export/csv', '/relances/stats', '/relances/mes-rappels']
  if (methode === 'get' && LECTURES.includes(url)) {
    if (config.params?.bloc_id === undefined && !/[?&]bloc_id=/.test(String(config.url))) config.params = { ...(config.params || {}), bloc_id: bloc }
  } else if (methode === 'post' && (url === '/contacts' || url === '/contacts/import')) {
    if (config.data && typeof config.data === 'object' && config.data.bloc_id === undefined) config.data = { ...config.data, bloc_id: bloc }
  }
  return config
}
