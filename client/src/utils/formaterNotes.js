// Transforme la chaîne `notes` (pavé Modelo dense) en lignes lisibles.
// Logique identique à formaterNotes.cjs (version testable sous node) — voir ce
// fichier pour le détail de l'algorithme et la limite connue (noms ALL-CAPS collés).

const LIBELLE = "[A-Za-zÀ-ÿ0-9 '’_°()\\-]{1,50}?"

function eclaterBloc(bloc) {
  if (!bloc.includes(' : ')) {
    const t = bloc.trim()
    return t ? [{ libelle: t, valeur: null }] : []
  }
  const seps = []
  let idx = bloc.indexOf(' : ')
  while (idx !== -1) {
    seps.push(idx)
    idx = bloc.indexOf(' : ', idx + 3)
  }
  const lignes = []
  let curseurValeur = 0
  for (let i = 0; i < seps.length; i++) {
    const posSep = seps[i]
    const avant = bloc.slice(curseurValeur, posSep)
    const debutLibelle = debutDuLibelle(avant)
    const libelle = avant.slice(debutLibelle).trim()
    if (i === 0) {
      const prefixe = avant.slice(0, debutLibelle).trim()
      if (prefixe) lignes.push({ libelle: prefixe, valeur: null })
    } else {
      const valeurPrec = avant.slice(0, debutLibelle).trim()
      lignes[lignes.length - 1].valeur = valeurPrec || null
    }
    lignes.push({ libelle, valeur: null })
    curseurValeur = posSep + 3
  }
  const reste = bloc.slice(curseurValeur).trim()
  if (lignes.length) lignes[lignes.length - 1].valeur = reste || null
  return lignes
}

function debutDuLibelle(avant) {
  const apresSaut = avant.lastIndexOf('\n')
  const base = apresSaut === -1 ? 0 : apresSaut + 1
  const zone = avant.slice(base)
  const num = zone.match(/^[0-9][0-9.,€%-]*/)
  if (num) return base + num[0].length
  const camel = zone.match(/^.*[a-zà-ÿ](?=[A-ZÀ-Þ])/)
  if (camel) return base + camel[0].length
  return base
}

// Retourne un tableau de lignes structurées : { libelle, valeur, section?, titre? }.
export function formaterNotes(notes) {
  if (!notes) return []
  const lignes = []
  const blocs = String(notes).split('\n')
  let premier = true
  for (const bloc of blocs) {
    const t = bloc.trim()
    if (!t) continue
    const sectionMatch = t.match(/^(Observations [^:]+?)\s*:\s*(.*)$/)
    if (sectionMatch) {
      lignes.push({ libelle: sectionMatch[1].trim(), valeur: null, section: true })
      const reste = sectionMatch[2]
      if (reste && reste.trim()) lignes.push(...eclaterBloc(reste))
      premier = false
      continue
    }
    if (premier && t.includes(' · ') && !t.includes(' : ')) {
      lignes.push({ libelle: t, valeur: null, titre: true })
      premier = false
      continue
    }
    lignes.push(...eclaterBloc(t))
    premier = false
  }
  return lignes
}
