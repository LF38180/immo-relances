// Report vers Modelo : ce que l'appli a recueilli, au format convenu avec
// la conversation « Exploration Modelo » (04/11/2026), qui le saisit fiche par
// fiche dans le navigateur de Loïck. Une note de suivi par fiche et par
// passage, rédigée ici ; les champs (adresse, e-mail, stop) avec leur valeur
// « avant » pour que le report refuse d'écraser une fiche modifiée entre-temps.
const { db } = require('../database');

const SANS_CONTACT = new Set(['REPONDEUR', 'PAS_DE_REPONSE']);
const ISSUE_TEXTE = {
  JOINT: 'Joint.',
  REFUS_FERME: 'Refus de démarchage : ne plus appeler ni écrire.',
  DECEDE: 'Personne décédée.',
  ERREUR_IDENTITE: 'Pas la bonne personne au bout du fil.',
};
const SITUATION_TEXTE = { PROPRIETAIRE: 'propriétaire', LOCATAIRE: 'locataire', HEBERGE: 'hébergé', BAILLEUR: 'bailleur', AUTRE: 'autre' };
const PROJET_TEXTE = { VENTE: 'vente', ACHAT: 'achat', INVESTISSEMENT: 'investissement', MISE_EN_LOCATION: 'mise en location', AUTRE: 'autre', AUCUN: null };

const jjmm = (sql) => { const d = depuis(sql); return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''; };
const jjmmaaaa = (sql) => { const d = depuis(sql); return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
function depuis(sql) {
  if (!sql) return null;
  // UTC 'AAAA-MM-JJ HH:MM:SS' ; un rappel_le local 'AAAA-MM-JJTHH:MM' se lit tel quel.
  const d = sql.includes('T') && sql.length === 16 ? new Date(sql) : new Date(sql.replace(' ', 'T') + (sql.length > 10 ? 'Z' : 'T12:00:00'));
  return isNaN(d) ? null : d;
}
const maj = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const diff = (avant, apres) => {
  const a = (avant || '').trim(), b = (apres || '').trim();
  return b && b.toLowerCase() !== a.toLowerCase() ? b : '';
};

// Les fiches qui ont du nouveau depuis leur dernier report : un appel avec
// contact (joint, rappel, refus, décédé, faux numéro, erreur d'identité) ou
// une saisie sur la fiche (adresse, NPAI, résultat) postérieurs à la date du
// dernier report. Les répondeurs seuls n'ouvrent pas de note : ils s'ajoutent
// en « Tentatives » à la note suivante.
function fichesAReporter() {
  const contacts = db.prepare(`
    SELECT c.*, r.updated_at AS resultat_le, r.adresse_maj, r.complement_maj, r.code_postal_maj, r.commune_maj,
           r.email_maj, r.tel_portable_maj, r.tel_fixe_maj, r.toujours_proprietaire, r.revendu_quand, r.revendu_par_qui, r.statut_actuel, r.situations,
           r.situation_autre, r.investissement_locatif, r.projet, r.projet_type, r.projet_autre, r.projet_echeance,
           r.actualisation, r.date_rdv, r.soiree, r.panneau, r.fiche_confirmee, r.npai AS r_npai,
           r.recommandation_nom, r.recommandation_tel, r.recommandation_email, r.recommandation_motif, r.recommandation_mode
    FROM op_contacts c LEFT JOIN op_resultats r ON r.id_modelo = c.id_modelo`).all();
  const appelsDe = db.prepare(`SELECT * FROM op_appels WHERE id_modelo = ? AND horodatage > ? ORDER BY horodatage ASC, id ASC`);
  // Qui a signalé le courrier revenu : le journal (depuis le 04/11), à défaut
  // la personne qui a saisi les premiers retours avant le journal.
  const auteurNpai = db.prepare(`SELECT auteur FROM op_journal WHERE id_modelo = ? AND action = 'NPAI' ORDER BY le DESC LIMIT 1`);
  const SAISIE_NPAI_AVANT_JOURNAL = 'Loïck FERRUCCI';

  const fiches = []; const recommandations = [];
  for (const c of contacts) {
    const depuisLe = c.modelo_reporte_le || '';
    const appels = appelsDe.all(c.id_modelo, depuisLe);
    const avecContact = appels.filter(a => !SANS_CONTACT.has(a.issue));
    const tentatives = appels.filter(a => SANS_CONTACT.has(a.issue));
    const resultatNouveau = !!(c.resultat_le && c.resultat_le > depuisLe);
    if (!avecContact.length && !resultatNouveau) continue;

    const dernier = avecContact[avecContact.length - 1] || null;
    // Sans appel : le conseiller de la fiche ; sans conseiller (fiche à
    // répartir), la personne qui a signalé le courrier revenu. Jamais un nom
    // générique : Modelo réattribue la fiche à qui agit dessus.
    const agent = dernier?.conseiller || c.conseiller
      || auteurNpai.get(c.id_modelo)?.auteur || SAISIE_NPAI_AVANT_JOURNAL;
    const dateNote = dernier?.horodatage || c.resultat_le;

    const parts = [];
    if (dernier) {
      if (dernier.issue === 'A_RAPPELER') {
        const r = depuis(dernier.rappel_le);
        parts.push(`Joint, à rappeler${r ? ` le ${r.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${r.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}` : ''}.`);
      } else if (dernier.issue === 'FAUX_NUMERO') {
        parts.push(`Faux numéro${c.tel_portable || c.tel_fixe ? ` (${c.tel_portable || c.tel_fixe})` : ''}.`);
      } else parts.push(ISSUE_TEXTE[dernier.issue] || `${maj(dernier.issue.toLowerCase().replace(/_/g, ' '))}.`);
    }
    if (c.r_npai === 1 || c.npai === 1) parts.push('Courrier du président revenu (NPAI).');
    const situ = (c.situations || c.statut_actuel || '').split(',').filter(Boolean).map(s => SITUATION_TEXTE[s] || s.toLowerCase());
    if (situ.length) parts.push(maj(situ.join(' et ')) + (c.situation_autre ? ` (${c.situation_autre})` : '') + '.');
    if (c.toujours_proprietaire === 1) parts.push('Toujours propriétaire du bien.');
    if (c.toujours_proprietaire === 0) parts.push(`N'est plus propriétaire du bien${c.revendu_quand ? `, revendu ${c.revendu_quand}` : ''}${c.revendu_par_qui ? ` par ${c.revendu_par_qui}` : ''}.`);
    if (c.investissement_locatif === 1) parts.push('Achat réalisé en investissement locatif.');
    if (c.investissement_locatif === 0) parts.push('Achat pour y habiter.');
    const projet = c.projet_type || c.projet;
    if (projet === 'AUCUN') parts.push('Aucun projet.');
    else if (projet) parts.push(`Projet : ${PROJET_TEXTE[projet] || projet.toLowerCase()}${c.projet_autre ? ` (${c.projet_autre})` : ''}${c.projet_echeance ? ` d'ici ${c.projet_echeance} mois` : ''}.`);
    if (c.actualisation === 'ACCEPTEE') parts.push(`Actualisation de la valeur acceptée${c.date_rdv ? `, RDV le ${jjmm(c.date_rdv)}` : ''}.`);
    if (c.actualisation === 'A_REPROPOSER') parts.push('Actualisation à reproposer.');
    if (c.actualisation === 'REFUSEE') parts.push('Actualisation refusée.');
    if (c.soiree === 1) parts.push('Soirée du 3 décembre : oui.');
    if (c.panneau === 1) parts.push('Panneau « Vendu par Le Quai » : oui.');
    if (c.fiche_confirmee === 1 && !c.adresse_maj) parts.push('Coordonnées confirmées.');
    if (c.adresse_maj) parts.push(`Nouvelle adresse : ${[c.adresse_maj, c.complement_maj, c.code_postal_maj, c.commune_maj].filter(Boolean).join(', ')}.`);
    if (diff(c.email, c.email_maj)) parts.push(`Nouvel e-mail : ${c.email_maj}.`);
    if (diff(c.tel_portable, c.tel_portable_maj)) parts.push(`Nouveau portable : ${c.tel_portable_maj}.`);
    if (diff(c.tel_fixe, c.tel_fixe_maj)) parts.push(`Nouveau fixe : ${c.tel_fixe_maj}.`);
    if (c.recommandation_nom) parts.push(`Recommandation : ${c.recommandation_nom} (voir fichier des recommandations).`);
    if (dernier?.notes) parts.push(`Note : « ${dernier.notes.trim()} »`);
    if (tentatives.length) parts.push('Tentatives : ' + tentatives.map(a => `${jjmm(a.horodatage)} ${a.canal === 'SMS' ? 'SMS envoyé' : a.issue === 'REPONDEUR' ? 'répondeur' : 'pas de réponse'}`).join(', ') + '.');

    // Rien à dire : une ligne de résultat vide (un essai d'avant l'opération)
    // ou une saisie sans contenu. Pas de note vide dans Modelo.
    if (!parts.length) continue;
    // Pas de conversation, mais des informations saisies : le dire en tête,
    // pour que la note ne se lise pas comme un appel abouti.
    if (!dernier && !(c.r_npai === 1 || c.npai === 1)) {
      parts.unshift(tentatives.length ? 'Non joint. Infos connues de l’agent :' : 'Sans appel. Infos saisies par l’agent :');
    }

    const refus = dernier?.issue === 'REFUS_FERME' || c.stop_telephone === 1 && avecContact.some(a => a.issue === 'REFUS_FERME');
    const proposer = [];
    if (dernier?.issue === 'DECEDE') proposer.push('Archiver la fiche (décédé)');
    if (dernier?.issue === 'FAUX_NUMERO') proposer.push(`Retirer le numéro ${c.tel_portable || c.tel_fixe || ''}`.trim());
    if (dernier?.issue === 'ERREUR_IDENTITE') proposer.push('Identité à vérifier');
    if (c.recommandation_nom) proposer.push('Recommandation à créer (fichier des recommandations)');

    fiches.push({
      id_modelo: c.id_modelo, nom: c.nom, prenom: c.prenom || '', agent,
      date_note: depuis(dateNote) ? depuis(dateNote).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '',
      commentaire: `[OPÉ ANCIENS CLIENTS 2026] [${jjmmaaaa(dateNote)} — ${agent}] ${parts.join(' ')}`.trim(),
      stop_tel: (c.stop_telephone === 1 || refus) ? 1 : 0,
      stop_mail: (c.stop_mail === 1 || refus) ? 1 : 0,
      email_avant: c.email || '', email_apres: diff(c.email, c.email_maj),
      tel_port_avant: c.tel_portable || '', tel_port_apres: diff(c.tel_portable, c.tel_portable_maj),
      tel_fixe_avant: c.tel_fixe || '', tel_fixe_apres: diff(c.tel_fixe, c.tel_fixe_maj),
      adresse_avant: c.adresse || '', adresse_apres: diff(c.adresse, c.adresse_maj),
      cp_avant: c.code_postal || '', cp_apres: c.adresse_maj ? diff(c.code_postal, c.code_postal_maj) : '',
      commune_avant: c.commune || '', commune_apres: c.adresse_maj ? diff(c.commune, c.commune_maj) : '',
      a_proposer_a_loick: proposer.join(' ; '),
      // Pour le marquage : la date du dernier élément inclus.
      jusqu_a: [dernier?.horodatage, c.resultat_le, tentatives[tentatives.length - 1]?.horodatage].filter(Boolean).sort().pop(),
    });
    if (c.recommandation_nom) recommandations.push({
      id_modelo: c.id_modelo, client: `${c.prenom || ''} ${c.nom}`.trim(), agent,
      nom: c.recommandation_nom, tel: c.recommandation_tel || '', email: c.recommandation_email || '',
      motif: c.recommandation_motif || '', qui_fait_le_lien: c.recommandation_mode === 'IL_FAIT_LE_LIEN' ? 'le client' : 'l’agent',
    });
  }
  fiches.sort((a, b) => a.agent.localeCompare(b.agent) || a.nom.localeCompare(b.nom));
  return { fiches, recommandations };
}

module.exports = { fichesAReporter };
