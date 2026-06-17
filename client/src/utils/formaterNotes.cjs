// Logique pure partagée (testable sous node). Pas d'import DOM.
// Transforme la chaîne `notes` (souvent un pavé Modelo dense) en lignes lisibles.
//
// Les notes Modelo sont des paires "Libellé : valeur" collées les unes aux autres :
//   "ID négo suiveur : 6365Négo suiveur : Arthur SARTORELLIDate estimation : 2022-..."
// On ne peut pas deviner la frontière valeur/libellé par heuristique pure (un nom
// propre collé à un libellé n'a pas de marqueur). On scanne donc les positions de
// chaque libellé : un libellé = la séquence de "mots Modelo" située juste avant
// " : ". Tout ce qui est entre deux libellés successifs est la valeur du premier.
//
// LIMITE CONNUE : un nom propre en CAPITALES collé au libellé suivant
// ("Arthur SARTORELLINégo créateur") ne peut pas être séparé proprement (pas de
// transition minuscule->Majuscule détectable). Ces rares cas restent groupés.
// L'objectif est la lisibilité globale, pas une séparation parfaite : le résultat
// est déjà très supérieur au pavé d'origine.

// Un libellé Modelo : lettres accentuées, chiffres, espaces, apostrophes, tirets,
// underscore, parenthèses, °. Borné à ~50 caractères (au-delà = texte libre).
const LIBELLE = "[A-Za-zÀ-ÿ0-9 '’_°()\\-]{1,50}?"
// Repère " <libellé> : " dans le flux. Le libellé est non gourmand ; on s'appuie
// sur le fait qu'un libellé ne contient pas de \n et tient en début de "mot".
const SCAN = new RegExp("(" + LIBELLE + ") : ", "g")

// Éclate un bloc en lignes { libelle, valeur } à partir des positions des " : ".
function eclaterBloc(bloc) {
  if (!bloc.includes(' : ')) {
    const t = bloc.trim()
    return t ? [{ libelle: t, valeur: null }] : []
  }
  // 1) Trouver toutes les positions des " : " et le libellé qui les précède.
  //    Le libellé = les mots juste avant " : ", coupés au dernier \n s'il existe.
  const seps = []
  let idx = bloc.indexOf(' : ')
  while (idx !== -1) {
    seps.push(idx)
    idx = bloc.indexOf(' : ', idx + 3)
  }
  // 2) Pour chaque " : ", déterminer début du libellé : juste après la fin de la
  //    valeur précédente. La valeur précédente se termine au début du libellé
  //    courant. Le libellé courant = dernier groupe de "mots libellé" avant " : ".
  const lignes = []
  let curseurValeur = 0 // début de la valeur en cours (après le libellé précédent)
  for (let i = 0; i < seps.length; i++) {
    const posSep = seps[i]
    // Le texte entre curseurValeur et posSep contient : [valeur du couple précédent]
    // + [libellé courant]. On isole le libellé courant = la fin "mots Modelo"
    // immédiatement avant posSep, coupée au dernier \n et au dernier marqueur de
    // fin de valeur (chiffre/ponctuation suivi d'une lettre de libellé).
    const avant = bloc.slice(curseurValeur, posSep)
    const debutLibelle = debutDuLibelle(avant)
    const libelle = avant.slice(debutLibelle).trim()
    if (i === 0) {
      // tout ce qui précède le 1er libellé (rare) est ignoré s'il est vide
      const prefixe = avant.slice(0, debutLibelle).trim()
      if (prefixe) lignes.push({ libelle: prefixe, valeur: null })
    } else {
      // la valeur du couple précédent = avant[0..debutLibelle]
      const valeurPrec = avant.slice(0, debutLibelle).trim()
      lignes[lignes.length - 1].valeur = valeurPrec || null
    }
    lignes.push({ libelle, valeur: null })
    curseurValeur = posSep + 3 // après " : "
  }
  // 3) La valeur du dernier couple = reste de la chaîne.
  const reste = bloc.slice(curseurValeur).trim()
  if (lignes.length) lignes[lignes.length - 1].valeur = reste || null
  return lignes
}

// Dans "valeurPrecedente + libelleCourant", retourne l'index où commence le
// libellé courant (= les mots Modelo accolés juste avant le " : ").
function debutDuLibelle(avant) {
  // Couper au dernier \n : un libellé ne contient pas de saut de ligne.
  const apresSaut = avant.lastIndexOf('\n')
  let base = apresSaut === -1 ? 0 : apresSaut + 1
  let zone = avant.slice(base)
  // La valeur précédente se termine souvent par un nombre (6365, 2.50, 200000.00).
  // Le libellé commence à la 1re lettre APRÈS ce nombre de tête.
  // ex zone = "6365Négo suiveur" -> libellé = "Négo suiveur" (après "6365").
  const num = zone.match(/^[0-9][0-9.,€%-]*/)
  if (num) return base + num[0].length
  // Sinon, valeur textuelle (nom propre) collée : "Arthur SARTORELLINégo suiveur".
  // Frontière = dernière transition minuscule->Majuscule (CamelCase de jonction).
  const camel = zone.match(/^.*[a-zà-ÿ](?=[A-ZÀ-Þ])/)
  if (camel) return base + camel[0].length
  // Sinon tout est libellé (pas de valeur précédente identifiable).
  return base
}

// API principale : retourne un tableau de lignes structurées.
function formaterNotes(notes) {
  if (!notes) return []
  const lignes = []
  const blocs = String(notes).split('\n')
  let premier = true
  for (const bloc of blocs) {
    const t = bloc.trim()
    if (!t) continue
    // Titre de section "Observations bien :" / "Observations contact :"
    const sectionMatch = t.match(/^(Observations [^:]+?)\s*:\s*(.*)$/)
    if (sectionMatch) {
      lignes.push({ libelle: sectionMatch[1].trim(), valeur: null, section: true })
      const reste = sectionMatch[2]
      if (reste && reste.trim()) lignes.push(...eclaterBloc(reste))
      premier = false
      continue
    }
    // Résumé bien en tête : contient " · " et pas de " : "
    if (premier && t.includes(' · ') && !t.includes(' : ')) {
      lignes.push({ libelle: t, valeur: null, titre: true })
      premier = false
      continue
    }
    // Bloc normal : éclater les paires Libellé : valeur
    lignes.push(...eclaterBloc(t))
    premier = false
  }
  return lignes
}

module.exports = { formaterNotes }
