// Règles de l'opération anciens clients.
//
// Le cadre légal (loi du 30 juin 2025, en vigueur depuis le 11 août 2026) fixe
// des plages d'appel, un plafond de quatre appels par mois et par personne, et
// l'interdiction d'appeler qui s'y est opposé.
//
// Décision de Loïck, 20 octobre : ces règles AVERTISSENT, elles ne bloquent
// pas. Les conseillers sont des professionnels, ils connaissent la loi et en
// répondent. L'application les renseigne — elle ne décide pas à leur place.
//
// Ce que le code garde malgré tout : la trace. Chaque appel passé en dehors du
// cadre est enregistré comme tel, avec son motif. Un avertissement ignoré sans
// trace ne protège personne ; horodaté, il montre que l'agence informait.

// Loi du 30 juin 2025, en vigueur depuis le 11 août 2026.
const PLAGES = [[10, 13], [14, 20]];   // 10h-13h et 14h-20h
const PLAFOND_MENSUEL = 4;             // appels par personne et par mois civil

// Jours fériés français. Calculés plutôt que listés : une table en dur
// périmerait en janvier, et l'opération doit survivre à son auteur.
function feries(annee) {
  const p = paques(annee);   // dimanche de Pâques, en UTC
  // Décalage et formatage en UTC de bout en bout : passer par les accesseurs
  // locaux décalerait d'un jour à l'ouest de Greenwich (bug attrapé en test :
  // le lundi de Pâques 2027 ressortait au dimanche).
  const ajoute = (n) => {
    const x = new Date(p.getTime() + n * 86400000);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  };
  return new Set([
    `${annee}-01-01`, `${annee}-05-01`, `${annee}-05-08`, `${annee}-07-14`,
    `${annee}-08-15`, `${annee}-11-01`, `${annee}-11-11`, `${annee}-12-25`,
    ajoute(1),    // lundi de Pâques
    ajoute(39),   // Ascension
    ajoute(50),   // lundi de Pentecôte
  ]);
}

// Algorithme de Meeus/Jones/Butcher.
function paques(a) {
  const f = Math.floor, g = a % 19;
  const c = f(a / 100), h = (c - f(c / 4) - f((8 * c + 13) / 25) + 19 * g + 15) % 30;
  const i = h - f(h / 28) * (1 - f(29 / (h + 1)) * f((21 - g) / 11));
  const jour = i - ((a + f(a / 4) + i + 2 - c + f(c / 4)) % 7) + 28;
  const mois = jour > 31 ? 4 : 3;
  return new Date(Date.UTC(a, mois - 1, jour > 31 ? jour - 31 : jour));
}

// Date locale au format AAAA-MM-JJ (pas toISOString, qui bascule en UTC et
// change de jour le soir).
const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Appel autorisé à cet instant ? Renvoie { ok, raison }.
function plageAppelOk(maintenant = new Date()) {
  const jour = maintenant.getDay();                 // 0 = dimanche
  if (jour === 0 || jour === 6) return { ok: false, raison: 'Les appels sont interdits le week-end.' };
  if (feries(maintenant.getFullYear()).has(jourLocal(maintenant)))
    return { ok: false, raison: 'Jour férié : les appels sont interdits.' };

  const h = maintenant.getHours() + maintenant.getMinutes() / 60;
  const dans = PLAGES.some(([a, b]) => h >= a && h < b);
  if (!dans) return { ok: false, raison: 'Hors plage légale : les appels sont autorisés de 10h à 13h et de 14h à 20h.' };
  return { ok: true };
}

// Mois civil en cours, pour le plafond.
const moisCourant = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Ce qu'il faut savoir avant d'appeler ce contact.
//
// Renvoie la liste des avertissements, du plus grave au plus bénin. Liste vide
// = rien à signaler. Aucun de ces points n'empêche l'appel : c'est le
// conseiller qui tranche, en connaissance de cause.
//
// `nbAppelsCeMois` vient de la base ; la fonction reste pure, donc testable.
function avertissementsAppel(contact, nbAppelsCeMois, maintenant = new Date()) {
  const av = [];
  if (!contact) return [{ niveau: 'grave', code: 'INTROUVABLE', texte: 'Contact introuvable.' }];

  if (contact.stop_telephone) av.push({
    niveau: 'grave', code: 'OPPOSITION',
    texte: 'Cette personne a demandé à ne plus être démarchée par téléphone.',
  });

  if (nbAppelsCeMois >= PLAFOND_MENSUEL) av.push({
    niveau: 'grave', code: 'PLAFOND',
    texte: `${nbAppelsCeMois} appels déjà passés ce mois-ci (plafond légal : ${PLAFOND_MENSUEL}).`,
  });

  const plage = plageAppelOk(maintenant);
  if (!plage.ok) av.push({ niveau: 'attention', code: 'HORS_PLAGE', texte: plage.raison });

  return av;
}

// Un appel sort-il du cadre ? Sert à l'horodater comme tel.
const horsCadre = (avertissements) => avertissements.some(a => a.niveau === 'grave' || a.code === 'HORS_PLAGE');

// Domaines qui ne peuvent pas être ceux d'un client : notre propre agence,
// notre ancienne enseigne, et les réseaux concurrents. Une fiche qui porte une
// de ces adresses contient celle d'un agent, pas celle du client — dix-neuf
// cas trouvés à la relecture du 27 octobre.
const DOMAINES_PRO = [
  'lequai-immobilier', 'kwfrance', 'kellerwilliams', 'orpi', 'century21',
  'laforet', 'guyhoquet', 'guy-hoquet', 'iadfrance', 'safti', 'optimhome',
  'nestenn', 'stephaneplaza', 'capifrance', 'era-immobilier', 'foncia', 'citya',
];

// L'adresse est-elle celle d'un professionnel plutôt que du client ?
function adresseProfessionnelle(email) {
  if (!email) return null;
  const bas = String(email).toLowerCase();
  return DOMAINES_PRO.find(d => bas.includes('@') && bas.split('@')[1].includes(d)) || null;
}

// Ce qu'il faut savoir avant d'écrire à ce contact.
function avertissementsMail(contact) {
  const av = [];
  if (!contact) return [{ niveau: 'grave', code: 'INTROUVABLE', texte: 'Contact introuvable.' }];
  if (contact.stop_mail) av.push({
    niveau: 'grave', code: 'OPPOSITION_MAIL',
    texte: 'Cette personne a demandé à ne plus recevoir de mails.',
  });

  // On n'efface rien : l'adresse peut servir à retrouver la bonne dans Modelo.
  // On prévient, et l'agent décide.
  const pro = adresseProfessionnelle(contact.email);
  if (pro) av.push({
    niveau: 'grave', code: 'MAIL_AGENT',
    texte: `Cette adresse est celle d'un professionnel (${pro}), pas du client. `
      + `Ne lui envoyez pas de mail avant d'avoir la bonne adresse : `
      + `demandez-la au téléphone.`,
  });

  if (!contact.email) av.push({
    niveau: 'attention', code: 'SANS_MAIL', texte: 'Aucune adresse mail connue.',
  });
  return av;
}

// --- Dates : deux formats qui ne se comparent pas tels quels ---------------
//
// SQLite écrit `datetime('now')` en UTC sans marqueur de fuseau :
// "2026-10-20 09:30:00". Node interprète cette chaîne comme de l'heure locale,
// donc deux heures d'écart en été.
//
// Et `rappel_le` vient d'un <input type="datetime-local"> : "2026-10-20T13:00",
// de l'heure locale sans marqueur non plus. Comparer les deux à un
// `toISOString()` (UTC) décalait tous les rappels — un rappel calé à 13h était
// présenté comme dû dès 11h.

// Horodatage SQLite (UTC naïf) -> Date réelle.
function depuisSqlite(s) {
  if (!s) return null;
  // Déjà un marqueur de fuseau : on fait confiance.
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

// Saisie "datetime-local" (heure locale) -> Date réelle.
function depuisSaisieLocale(s) {
  if (!s) return null;
  const d = new Date(s);   // sans suffixe, Node lit bien de l'heure locale
  return Number.isNaN(d.getTime()) ? null : d;
}

// Un rappel est-il arrivé à échéance ?
function rappelDu(rappelLe, maintenant = new Date()) {
  const d = depuisSaisieLocale(rappelLe);
  return !!d && d.getTime() <= maintenant.getTime();
}

// Deux moments sont-ils dans la même demi-journée ? Sert à la règle « relancer
// à une autre tranche horaire ».
function memeTranche(a, b) {
  if (!a || !b) return false;
  return (a.getHours() < 14) === (b.getHours() < 14);
}

// Les issues qui mettent fin définitivement aux appels.
const ISSUES_TERMINALES = new Set(['REFUS_FERME', 'DECEDE']);
const ISSUE_OPPOSITION = 'REFUS_FERME';

module.exports = {
  PLAGES, PLAFOND_MENSUEL, ISSUES_TERMINALES, ISSUE_OPPOSITION,
  feries, plageAppelOk, avertissementsAppel, avertissementsMail, horsCadre,
  adresseProfessionnelle, DOMAINES_PRO,
  moisCourant, jourLocal,
  depuisSqlite, depuisSaisieLocale, rappelDu, memeTranche,
};
