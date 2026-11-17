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

module.exports = { bilanOperation };
