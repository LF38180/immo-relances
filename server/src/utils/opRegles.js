// Règles de l'opération anciens clients.
//
// Isolées ici parce qu'elles sont la partie coûteuse à se tromper : trois
// d'entre elles sont légales, et une interface qui se contente d'avertir ne
// protège de rien. Les routes les appellent avant toute écriture.

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

// Un contact est-il appelable ? Regroupe les trois blocages.
// `nbAppelsCeMois` vient de la base ; la fonction reste pure, donc testable.
function appelAutorise(contact, nbAppelsCeMois, maintenant = new Date()) {
  if (!contact) return { ok: false, raison: 'Contact introuvable.' };
  if (contact.stop_telephone) return { ok: false, raison: 'Cette personne s\'est opposée au démarchage téléphonique.', definitif: true };
  if (nbAppelsCeMois >= PLAFOND_MENSUEL)
    return { ok: false, raison: `Plafond légal atteint : ${PLAFOND_MENSUEL} appels ce mois-ci. Rappel possible le mois prochain.` };
  return plageAppelOk(maintenant);
}

// Envoi de mail autorisé ?
function mailAutorise(contact) {
  if (!contact) return { ok: false, raison: 'Contact introuvable.' };
  if (contact.stop_mail) return { ok: false, raison: 'Cette personne s\'est opposée aux envois par mail.' };
  if (!contact.email) return { ok: false, raison: 'Aucune adresse mail connue.' };
  return { ok: true };
}

// Les issues qui mettent fin définitivement aux appels.
const ISSUES_TERMINALES = new Set(['REFUS_FERME', 'DECEDE']);
const ISSUE_OPPOSITION = 'REFUS_FERME';

module.exports = {
  PLAGES, PLAFOND_MENSUEL, ISSUES_TERMINALES, ISSUE_OPPOSITION,
  feries, plageAppelOk, appelAutorise, mailAutorise, moisCourant, jourLocal,
};
