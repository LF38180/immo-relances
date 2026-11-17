// Bilan chiffré de l'opération anciens clients, depuis le début : appels,
// personnes jointes, ce qui a été obtenu. Chiffres seuls, aucun nom : il sert
// à la page de contrôle du serveur (demande de Loïck, 17/11/2026).
const { db } = require('../database');

// Quelqu'un a décroché et parlé à l'agent.
const DECROCHE = "('JOINT','A_RAPPELER','REFUS_FERME')";
// La fiche est close ou à corriger : on ne la rappelle pas telle quelle.
const SANS_SUITE = "('FAUX_NUMERO','ERREUR_IDENTITE','DECEDE')";

function bilanOperation() {
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const pasSms = "COALESCE(a.canal, '') <> 'SMS'";

  const appels = {
    passes: n(`SELECT COUNT(*) n FROM op_appels a WHERE ${pasSms}`),
    sms: n("SELECT COUNT(*) n FROM op_appels a WHERE a.canal = 'SMS'"),
    fiches_contactees: n('SELECT COUNT(DISTINCT id_modelo) n FROM op_appels'),
    fiches_au_fichier: n('SELECT COUNT(*) n FROM op_contacts'),
  };

  // Par fiche : a-t-on parlé à quelqu'un, au moins une fois ?
  const fiches = {
    ont_repondu: n(`SELECT COUNT(DISTINCT id_modelo) n FROM op_appels WHERE issue IN ${DECROCHE}`),
    // Appelées, jamais jointes, rien qui empêche de rappeler : à rappeler.
    jamais_jointes_a_rappeler: n(`SELECT COUNT(DISTINCT a.id_modelo) n FROM op_appels a
      WHERE NOT EXISTS (SELECT 1 FROM op_appels b WHERE b.id_modelo = a.id_modelo
        AND (b.issue IN ${DECROCHE} OR b.issue IN ${SANS_SUITE}))`),
    sans_suite: n(`SELECT COUNT(DISTINCT a.id_modelo) n FROM op_appels a
      WHERE a.issue IN ${SANS_SUITE}
        AND NOT EXISTS (SELECT 1 FROM op_appels b WHERE b.id_modelo = a.id_modelo AND b.issue IN ${DECROCHE})`),
    jamais_appelees: n(`SELECT COUNT(*) n FROM op_contacts c
      WHERE NOT EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)`),
  };

  // Les jamais appelées, triées : ce qui peut partir en appel tout de suite,
  // et ce qui bloque (pas encore réparti, pas de numéro, identité douteuse,
  // stop téléphone). Une fiche ne tombe que dans la première case qui la
  // concerne, dans cet ordre.
  const jamais = db.prepare(`SELECT
      CASE
        WHEN c.stop_telephone = 1 THEN 'stop_telephone'
        WHEN c.a_verifier = 1 AND (c.verifie IS NULL OR c.verifie = 'ECARTE') THEN 'identite_a_verifier_ou_ecartee'
        WHEN NULLIF(TRIM(COALESCE(c.tel_portable, '')), '') IS NULL
         AND NULLIF(TRIM(COALESCE(c.tel_fixe, '')), '') IS NULL THEN 'sans_telephone'
        WHEN c.a_dispatcher = 1 OR NULLIF(TRIM(COALESCE(c.conseiller, '')), '') IS NULL THEN 'pas_encore_reparties'
        ELSE 'dans_la_file_d_un_agent'
      END k, COUNT(*) n
    FROM op_contacts c
    WHERE NOT EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)
    GROUP BY 1`).all();
  fiches.jamais_appelees_detail = Object.fromEntries(jamais.map(x => [x.k, x.n]));
  fiches.jamais_appelees_detail.par_agent = Object.fromEntries(db.prepare(`SELECT c.conseiller k, COUNT(*) n
    FROM op_contacts c
    WHERE NOT EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)
      AND COALESCE(c.stop_telephone, 0) = 0 AND c.a_dispatcher = 0
      AND NOT (c.a_verifier = 1 AND (c.verifie IS NULL OR c.verifie = 'ECARTE'))
      AND (NULLIF(TRIM(COALESCE(c.tel_portable, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(c.tel_fixe, '')), '') IS NOT NULL)
      AND NULLIF(TRIM(COALESCE(c.conseiller, '')), '') IS NOT NULL
    GROUP BY c.conseiller ORDER BY n DESC`).all().map(x => [x.k, x.n]));

  // Dernière issue de chaque fiche appelée.
  const derniere_issue = {};
  for (const r of db.prepare(`SELECT issue, canal, COUNT(*) n FROM (
      SELECT a.issue, a.canal FROM op_appels a
      WHERE a.id = (SELECT b.id FROM op_appels b WHERE b.id_modelo = a.id_modelo
        ORDER BY b.horodatage DESC, b.id DESC LIMIT 1)
    ) GROUP BY issue, canal`).all()) {
    const cle = r.canal === 'SMS' ? 'SMS' : r.issue;
    derniere_issue[cle] = (derniere_issue[cle] || 0) + r.n;
  }

  const r = (cond) => n(`SELECT COUNT(*) n FROM op_resultats r JOIN op_contacts c ON c.id_modelo = r.id_modelo WHERE ${cond}`);
  const change = (avant, apres) => `NULLIF(TRIM(COALESCE(${apres}, '')), '') IS NOT NULL
    AND LOWER(TRIM(${apres})) <> LOWER(TRIM(COALESCE(${avant}, '')))`;

  const obtenu = {
    estimations_acceptees: r("r.actualisation = 'ACCEPTEE'"),
    estimations_a_reproposer: r("r.actualisation = 'A_REPROPOSER'"),
    estimations_refusees: r("r.actualisation = 'REFUSEE'"),
    soiree: r('r.soiree = 1'),
    panneau: r('r.panneau = 1'),
    courrier_renvoye: r('r.courrier_renvoye = 1'),
    recommandations: r("NULLIF(TRIM(COALESCE(r.recommandation_nom, '')), '') IS NOT NULL"),
  };

  const mises_a_jour = {
    adresses: r("NULLIF(TRIM(COALESCE(r.adresse_maj, '')), '') IS NOT NULL"),
    emails: r(change('c.email', 'r.email_maj')),
    portables: r(change('c.tel_portable', 'r.tel_portable_maj')),
    fixes: r(change('c.tel_fixe', 'r.tel_fixe_maj')),
    coordonnees_confirmees: r('r.fiche_confirmee = 1'),
    // Au moins une donnée nouvelle ou confirmée sur la fiche.
    fiches_mises_a_jour: r(`NULLIF(TRIM(COALESCE(r.adresse_maj, '')), '') IS NOT NULL
      OR (${change('c.email', 'r.email_maj')}) OR (${change('c.tel_portable', 'r.tel_portable_maj')})
      OR (${change('c.tel_fixe', 'r.tel_fixe_maj')}) OR r.fiche_confirmee = 1
      OR r.situations IS NOT NULL OR r.statut_actuel IS NOT NULL OR r.toujours_proprietaire IS NOT NULL`),
  };

  const projets = {};
  for (const p of db.prepare(`SELECT COALESCE(r.projet_type, r.projet) p, COUNT(*) n FROM op_resultats r
      WHERE COALESCE(r.projet_type, r.projet) IS NOT NULL GROUP BY 1`).all()) projets[p.p] = p.n;

  return { appels, fiches, derniere_issue, obtenu, mises_a_jour, projets };
}

// --- Mail récap aux agents (demande de Loïck, 17/11/2026) ------------------
// Les chiffres que l'appli connaît, mis en page comme les mails envoyés à la
// main. Ce qui demande de lire les notes (vendeurs chauds, mise en gestion
// déguisée en estimation…) reste à ajouter à la main : le mail le dit.
function chiffresMail() {
  const b = bilanOperation();
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const fiches = (issue) => n('SELECT COUNT(DISTINCT id_modelo) n FROM op_appels WHERE issue = ?', issue);
  const appelable = `NOT EXISTS (SELECT 1 FROM op_appels a WHERE a.id_modelo = c.id_modelo)
    AND COALESCE(c.stop_telephone, 0) = 0 AND c.a_dispatcher = 0
    AND NULLIF(TRIM(COALESCE(c.conseiller, '')), '') IS NOT NULL
    AND NOT (c.a_verifier = 1 AND (c.verifie IS NULL OR c.verifie = 'ECARTE'))
    AND (NULLIF(TRIM(COALESCE(c.tel_portable, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(c.tel_fixe, '')), '') IS NOT NULL)`;
  const d = b.fiches.jamais_appelees_detail || {};
  const p = b.projets;
  return {
    au_fichier: b.appels.fiches_au_fichier,
    appelees: b.appels.fiches_contactees,
    appels: b.appels.passes,
    sms: b.appels.sms,
    joints: b.fiches.ont_repondu,
    soiree: b.obtenu.soiree,
    estimations: b.obtenu.estimations_acceptees,
    a_reproposer: b.obtenu.estimations_a_reproposer,
    vendeurs: p.VENTE || 0,
    acquereurs: (p.ACHAT || 0) + (p.INVESTISSEMENT || 0),
    location: p.MISE_EN_LOCATION || 0,
    panneaux: b.obtenu.panneau,
    recommandations: b.obtenu.recommandations,
    adresses: b.mises_a_jour.adresses,
    confirmees: b.mises_a_jour.coordonnees_confirmees,
    refus: fiches('REFUS_FERME'),
    faux_numeros: fiches('FAUX_NUMERO'),
    deces: fiches('DECEDE'),
    // Un même retour importé deux fois ne compte qu'une fois (même fiche, même horodatage).
    notes_modelo: n(`SELECT COUNT(*) n FROM (SELECT DISTINCT id_modelo, le FROM op_modelo_reports WHERE statut = 'REPORTE')`),
    a_appeler: d.dans_la_file_d_un_agent || 0,
    a_appeler_courrier_recu: n(`SELECT COUNT(*) n FROM op_contacts c WHERE ${appelable} AND c.courrier_etat = 'ENVOYE' AND COALESCE(c.npai, 0) = 0`),
    a_appeler_npai: n(`SELECT COUNT(*) n FROM op_contacts c WHERE ${appelable} AND COALESCE(c.npai, 0) = 1`),
    a_appeler_sans_courrier: n(`SELECT COUNT(*) n FROM op_contacts c WHERE ${appelable} AND c.courrier_etat <> 'ENVOYE' AND COALESCE(c.npai, 0) = 0`),
    a_rappeler_non_joints: b.fiches.jamais_jointes_a_rappeler,
    rappels_cales: b.derniere_issue.A_RAPPELER || 0,
    a_completer: (d.identite_a_verifier_ou_ecartee || 0) + (d.sans_telephone || 0) + (d.pas_encore_reparties || 0),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nb = (x) => Number(x || 0).toLocaleString('fr-FR').replace(/ | /g, ' ');

function mailRecapHtml(c, maintenant = new Date()) {
  const date = maintenant.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const tuile = (v, l, or = false) => `<div class="tuile${or ? ' or' : ''}"><b>${nb(v)}</b><span>${esc(l)}</span></div>`;
  const li = (v, l) => v ? `<li><b>${l(nb(v))}</b></li>` : '';
  const aRappeler = c.a_rappeler_non_joints + c.rappels_cales + c.a_reproposer;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Récap opération anciens clients</title><style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b2340;max-width:720px;margin:32px auto;padding:0 20px;line-height:1.5;font-size:15px}
.objet{color:#6b7280;margin:0 0 20px;font-size:14px} h2{font-size:16px;margin:26px 0 8px;border-bottom:2px solid #c9a24a;padding-bottom:3px;letter-spacing:.02em}
ul{padding-left:20px;margin:6px 0} li{margin:4px 0} .note{font-size:13px;color:#6b7280}
.tuiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0} .tuile{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#fff} .tuile b{display:block;font-size:24px;line-height:1.2} .tuile span{font-size:12px;color:#6b7280}
.tuile.or{border-color:#c9a24a;background:#fbf8f1}
.bloc{border-left:4px solid #c9a24a;background:#fbf8f1;padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0}
.potentiel{border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;margin:10px 0} .potentiel .titre{font-weight:700;margin-bottom:4px} .potentiel .titre b{color:#c9a24a;font-size:20px;margin-right:6px}
.prio{font-weight:600}</style></head><body>
<p class="objet"><b>Objet :</b> Opération anciens clients : le point au ${esc(date)}</p>
<p>Bonjour à tous,</p>
<p>Voici le point sur l'opération anciens clients, avec ce que vos appels ont déjà produit. Bravo et merci à chacun !</p>

<h2>VOTRE MOBILISATION EN CHIFFRES</h2>
<div class="tuiles">
${tuile(c.au_fichier, "anciens clients dans l'opération")}
${tuile(c.appelees, 'déjà appelés')}
${tuile(c.appels, 'appels passés')}
${tuile(c.joints, 'clients joints', true)}
${tuile(c.sms, 'SMS envoyés')}
</div>

<h2>CE QUE ÇA A DÉJÀ DONNÉ</h2>
<ul>
${li(c.soiree, v => `${v} intéressés pour la soirée du 3 décembre`)}
${li(c.estimations, v => `${v} estimations acceptées`)}
${li(c.a_reproposer, v => `${v} actualisations de valeur à reproposer`)}
${li(c.vendeurs, v => `${v} projets de vente identifiés`)}
${li(c.acquereurs, v => `${v} acquéreurs et investisseurs`)}
${li(c.location, v => `${v} projets de mise en location`)}
${li(c.panneaux, v => `${v} accords pour le panneau « Vendu par Le Quai »`)}
${li(c.recommandations, v => `${v} recommandation${c.recommandations > 1 ? 's' : ''}`)}
</ul>
<div class="bloc">Rien que ça, c'est déjà du chiffre d'affaires en perspective.</div>

<h2>UN FICHIER REMIS À NEUF</h2>
<p>Vos notes sont reportées dans Modelo, à votre nom${c.notes_modelo ? ` : <b>${nb(c.notes_modelo)} notes de suivi</b> à ce jour, que vous n'avez pas eu à saisir` : ''}.</p>
<div class="tuiles">
${tuile(c.adresses, 'adresses mises à jour')}
${tuile(c.confirmees, 'coordonnées confirmées')}
${tuile(c.refus, 'refus de démarchage (stops posés)')}
${tuile(c.faux_numeros, 'faux numéros signalés')}
${c.deces ? tuile(c.deces, 'décès signalés') : ''}
</div>

<h2>ET LE MEILLEUR RESTE À VENIR</h2>
<div class="potentiel">
  <div class="titre"><b>${nb(c.a_appeler)}</b>1. Les anciens clients pas encore appelés</div>
  <ul>
    ${c.a_appeler_courrier_recu ? `<li class="prio">dont ${nb(c.a_appeler_courrier_recu)} qui ont reçu le courrier et attendent votre appel : c'est la priorité</li>` : ''}
    ${c.a_appeler_npai ? `<li>dont ${nb(c.a_appeler_npai)} dont le courrier est revenu (NPAI)</li>` : ''}
    ${c.a_appeler_sans_courrier ? `<li>dont ${nb(c.a_appeler_sans_courrier)} à appeler directement, sans courrier</li>` : ''}
  </ul>
</div>
<div class="potentiel">
  <div class="titre"><b>${nb(aRappeler)}</b>2. Les anciens clients déjà appelés, à rappeler</div>
  <ul>
    ${c.a_rappeler_non_joints ? `<li>${nb(c.a_rappeler_non_joints)} pas encore joints (répondeur, pas de réponse ou SMS sans retour) : ils reviennent dans votre liste 48 h après le dernier essai</li>` : ''}
    ${c.rappels_cales ? `<li>${nb(c.rappels_cales)} avec un rappel calé à une date précise</li>` : ''}
    ${c.a_reproposer ? `<li>${nb(c.a_reproposer)} joints, avec une actualisation de valeur à reproposer</li>` : ''}
  </ul>
</div>
${c.a_completer ? `<p class="note">À cela s'ajoutent ${nb(c.a_completer)} fiches à compléter avant de pouvoir les appeler (numéro manquant, identité à vérifier, pas encore réparties) : on s'en occupe de notre côté.</p>` : ''}
<p>On compte sur vous pour continuer vos sessions d'appels et de relances. Pensez à bien noter à chaque appel la soirée, le panneau, les projets et les recommandations : c'est ce qui fait apparaître vos résultats.</p>
<p>Merci encore à tous !</p>
<p class="note">Chiffres de l'application au ${esc(maintenant.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}.</p>
</body></html>`;
}

module.exports = { bilanOperation, chiffresMail, mailRecapHtml };
