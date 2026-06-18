import { STATUTS_RELANCE, ISSUES } from './constants'

// AAAA-MM-JJ (ou ISO) -> JJ/MM/AAAA. Vide si absent.
function dateFr(v) {
  if (!v) return ''
  const s = String(v).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

function statutLabel(statut) {
  if (statut === 'supprime') return 'Contact supprimé'
  return ISSUES[statut]?.label || STATUTS_RELANCE[statut]?.label || statut || ''
}

// Génère et télécharge un PDF récapitulatif des actions d'une session d'appel.
// actions : [{ nom, prenom, telephone, statut, notes, prochain_contact, heure }]
// meta : { agent, dateLabel, stats: { total, rdv, contactes, pasRep } }
export async function genererRecapPdf(actions, meta) {
  // Charge jsPDF + autotable à la demande (libs lourdes) — pas dans le bundle initial.
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const navy = [13, 13, 43] // #0D0D2B

  // En-tête
  doc.setFontSize(16)
  doc.setTextColor(...navy)
  doc.text('Le Quai de l’Immobilier', 14, 16)
  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text('Récapitulatif de session d’appels — à reporter dans le CRM', 14, 23)

  doc.setFontSize(9)
  doc.setTextColor(120)
  const ligneMeta = [
    meta.agent ? `Agent : ${meta.agent}` : '',
    meta.dateLabel ? `Date : ${meta.dateLabel}` : '',
  ].filter(Boolean).join('     ')
  if (ligneMeta) doc.text(ligneMeta, 14, 29)

  // Totaux
  const s = meta.stats || {}
  const totaux = `Traités : ${s.total || 0}     RDV : ${s.rdv || 0}     Contactés : ${s.contactes || 0}     Sans réponse : ${s.pasRep || 0}`
  doc.text(totaux, 14, 34)

  // Tableau
  autoTable(doc, {
    startY: 39,
    head: [['Contact', 'Téléphone', 'Statut', 'Prochain contact', 'Notes']],
    body: actions.map(a => [
      `${a.prenom || ''} ${a.nom || ''}`.trim(),
      a.telephone || '',
      statutLabel(a.statut),
      dateFr(a.prochain_contact),
      a.notes || '',
    ]),
    styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak', textColor: [28, 28, 28] },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 246, 243] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 35 },
      2: { cellWidth: 38 },
      3: { cellWidth: 34 },
      4: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  })

  const nomFichier = `recap-session-${(meta.dateFichier || 'export')}.pdf`
  doc.save(nomFichier)
}
