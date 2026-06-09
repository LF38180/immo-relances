export const CATEGORIES = {
  ancien_client:   { label: 'Ancien client',    color: 'bg-quai-navy/10 text-quai-navy border border-quai-navy/20',     dot: 'bg-quai-navy' },
  prospect_chaud:  { label: 'Prospect chaud',   color: 'bg-red-50 text-red-700 border border-red-200',                  dot: 'bg-red-500' },
  prospect_froid:  { label: 'Prospect froid',   color: 'bg-sky-50 text-sky-700 border border-sky-200',                  dot: 'bg-sky-400' },
  acquereur:       { label: 'Acquéreur',         color: 'bg-emerald-50 text-emerald-700 border border-emerald-200',      dot: 'bg-emerald-500' },
  vendeur:         { label: 'Vendeur',           color: 'bg-amber-50 text-amber-700 border border-amber-200',            dot: 'bg-amber-500' },
  autre:           { label: 'Autre',             color: 'bg-quai-light text-quai-muted border border-quai-border',       dot: 'bg-quai-muted' },
}

export const STATUTS = {
  a_contacter:        { label: 'À contacter',       color: 'bg-quai-navy/10 text-quai-navy border border-quai-navy/20' },
  tente_sans_reponse: { label: 'Sans réponse',      color: 'bg-amber-50 text-amber-700 border border-amber-200' },
  rappel_planifie:    { label: 'Rappel planifié',   color: 'bg-orange-50 text-orange-700 border border-orange-200' },
  rdv_obtenu:         { label: 'RDV obtenu',        color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  pas_interesse:      { label: 'Pas intéressé',     color: 'bg-red-50 text-red-600 border border-red-200' },
  a_recontacter:      { label: 'À recontacter',     color: 'bg-quai-gold/15 text-quai-navy border border-quai-gold/40' },
  inactif:            { label: 'Inactif',            color: 'bg-quai-light text-quai-muted border border-quai-border' },
}

export const STATUTS_RELANCE = {
  tente_sans_reponse: { label: 'Pas de réponse',  color: 'bg-amber-50 text-amber-700 border border-amber-200',     icon: 'phone-off' },
  message_laisse:     { label: 'Message laissé',  color: 'bg-amber-50 text-amber-700 border border-amber-200',     icon: 'voicemail' },
  contacte:           { label: 'Contacté',         color: 'bg-sky-50 text-sky-700 border border-sky-200',           icon: 'phone-call' },
  rdv_obtenu:         { label: 'RDV obtenu',       color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: 'calendar-check' },
  pas_interesse:      { label: 'Pas intéressé',   color: 'bg-red-50 text-red-700 border border-red-200',           icon: 'x-circle' },
  rappel_planifie:    { label: 'Rappel planifié',  color: 'bg-orange-50 text-orange-700 border border-orange-200',   icon: 'calendar-clock' },
  mandat_obtenu:      { label: 'Mandat obtenu',    color: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: 'trophy' },
}

export const POTENTIEL_LABELS = { 1: 'Très faible', 2: 'Faible', 3: 'Moyen', 4: 'Élevé', 5: 'Très élevé' }
