import { useState } from 'react'
import Icon from '../../components/ui/Icon'

// Page d'accueil du module : lue une fois, le 26 au matin, puis plus jamais.
//
// D'où deux partis pris : elle tient à l'écran sans trop dérouler, et ce qui
// doit rester disponible ensuite (comment lire sa liste) est aussi accessible
// depuis l'écran d'appel.
//
// Les chiffres sont ceux du conseiller connecté. Ceux de l'opération entière
// — 1 088 contacts, 363 orphelins — intéressent le manager, pas l'agent.
export default function AccueilOperation({ acces, bilan, onCommencer, estPilote }) {
  const sansCourrier = acces?.sans_courrier
  const [aideOuverte, setAideOuverte] = useState(false)

  // Ce que je dois appeler moi-même, pas ce que je supervise.
  const mesFiches = acces?.fiches || 0
  const perimetre = acces?.perimetre || mesFiches
  const total = estPilote ? perimetre : mesFiches
  const restants = bilan?.restants ?? total
  const joints = bilan?.joints || 0
  const estimations = bilan?.estimations || 0
  const soiree = bilan?.soiree || 0
  const panneaux = bilan?.panneaux || 0
  const fichesAJour = bilan?.fiches_a_jour || 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-4">

        {/* Tout le monde n'a pas reçu la lettre. Pour un portefeuille sorti de
            l'envoi, l'ouverture change et la soirée n'est pas proposée : c'est
            la première chose à lire, avant les compteurs. */}
        {sansCourrier && (
          <div className="border-l-4 border-amber-500 bg-amber-50 rounded-r px-3.5 py-3">
            <div className="font-semibold text-sm text-amber-900 mb-1">
              Tes clients n’ont pas reçu le courrier
            </div>
            <p className="text-[13px] text-amber-900/90 leading-snug">
              Ton portefeuille a été sorti de l’envoi. Ne fais jamais référence à une lettre :
              tous tes appels sont en <b>script 2</b>, celui qui ouvre sans courrier.
            </p>
            <p className="text-[13px] text-amber-900/90 leading-snug mt-1.5">
              <b>N’invite pas à la soirée du 3 décembre.</b> Le reste ne change pas :
              on prend des nouvelles, on remet la fiche à jour, on propose l’estimation.
            </p>
          </div>
        )}

        <div className="text-center pt-2">
          <img src="/operation/sceau-badge.png" alt="Opération anciens clients"
            className="w-40 h-40 md:w-52 md:h-52 rounded-xl mx-auto mb-4" />
          <h1 className="font-display text-2xl md:text-3xl font-bold text-quai-navy">On reprend contact.</h1>
          <p className="text-sm text-quai-muted mt-2 leading-snug">
            Jérémy Bertrand a écrit à toutes les familles qu’on a accompagnées depuis 2021.
            Plus de mille. Maintenant on les appelle, une par une.
          </p>
        </div>

        {/* Ligne 1 — où j'en suis. « Personnes jointes » plutôt qu'un compteur
            d'adresses : trois rendez-vous sur dix personnes jointes et trois sur
            quatre-vingts ne disent pas la même chose, et un agent qui tombe sur
            des répondeurs toute la matinée se croirait mauvais. */}
        <div className="grid grid-cols-3 gap-2">
          <Chiffre valeur={total} libelle={estPilote ? 'contacts suivis' : 'contacts à toi'} />
          <Chiffre valeur={restants} libelle="restent à appeler" accent />
          <Chiffre valeur={joints} libelle="personnes jointes" />
        </div>

        {/* Ligne 2 — les quatre objectifs, même taille, même poids, dans
            l'ordre du script. Aucun ne domine : ils comptent pareil. */}
        <div>
          <div className="text-[11px] font-semibold text-quai-muted uppercase tracking-wide mb-1.5">
            Les quatre objectifs
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Chiffre valeur={estimations} libelle="estimations calées" />
            <Chiffre valeur={soiree} libelle="soirée" />
            <Chiffre valeur={panneaux} libelle="panneaux" />
            <Chiffre valeur={fichesAJour} libelle="fiches à jour" />
          </div>
        </div>

        <p className="text-[11px] text-quai-muted text-center">
          Du 3 au 14 novembre. La soirée est le 3 décembre.
        </p>

        {/* Un manager a deux casquettes : ses propres appels, et le suivi de
            son équipe. Le bouton dit lequel des deux il déclenche. */}
        {estPilote && mesFiches > 0 && (
          <p className="text-[11px] text-quai-muted text-center -mt-1">
            Dont <b className="text-quai-navy">{mesFiches}</b> à appeler vous-même.
          </p>
        )}

        <button onClick={onCommencer}
          className="btn-primary w-full min-h-[3.25rem] text-base inline-flex items-center justify-center gap-2">
          <Icon name="phone" size="sm" />
          {restants > 0 ? 'Commencer les appels' : 'Voir ma liste'}
        </button>

        <Carte titre="Tu n’appelles pas pour vendre.">
          <p className="text-sm text-quai-text leading-snug">
            Le courrier du président le promet noir sur blanc : on ne proposera rien.
            Tu appelles pour prendre des nouvelles et remettre la fiche à jour.
          </p>
          <p className="text-sm text-quai-navy font-medium mt-3">
            Trois choses à proposer, dans cet ordre. Le client prend ce qui l’intéresse.
          </p>
          <ol className="text-sm space-y-1.5 mt-2">
            <Proposition n="1" titre="L’actualisation de la valeur"
              texte="offerte, sans engagement. On dit « actualisation » au client, jamais « estimation »." />
            <Proposition n="2" titre="La soirée du 3 décembre"
              texte="au Casarosa à Crolles, on réunit les familles qu’on a accompagnées." />
            <Proposition n="3" titre="Le panneau « Vendu par Le Quai »"
              texte="en dernier, toujours. « Et vous me dites non sans problème. »" />
          </ol>

          {/* Le quatrième ne se propose pas : il se recueille. Mais il compte
              autant, et il concerne tout le monde. */}
          <div className="mt-3 pt-3 border-t border-quai-border">
            <p className="text-sm text-quai-navy font-medium">
              Et une quatrième chose, qui ne se demande pas.
            </p>
            <p className="text-[13px] text-quai-text mt-1 leading-snug">
              <b>La fiche à jour</b> — son adresse, s’il est toujours propriétaire,
              s’il a un projet et pour quand. Ça se recueille dans la conversation,
              sans jamais l’annoncer. Ça compte autant que les trois autres.
            </p>
          </div>
        </Carte>

        {/* Replié : se relit au besoin, et reste accessible depuis l'écran
            d'appel une fois cette page oubliée. */}
        <div className="bg-white border border-quai-border rounded-xl overflow-hidden">
          <button onClick={() => setAideOuverte(o => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left">
            <span className="text-sm font-semibold text-quai-navy">Comment lire ta liste</span>
            <Icon name={aideOuverte ? 'chevron-up' : 'chevron-down'} size="sm" className="text-quai-muted" />
          </button>
          {aideOuverte && <AideListe />}
        </div>

        <Carte titre="Trois règles">
          {/* La spec disait « l'application bloque » et « l'application
              compte ». Décision du 20 octobre : elle avertit, elle ne bloque
              pas — les conseillers connaissent le cadre et en répondent. Le
              texte dit donc ce que fait réellement l'outil. */}
          <ul className="text-sm space-y-2">
            <Regle titre="Les créneaux légaux"
              texte="Lundi au vendredi, 10h-13h et 14h-20h. L’application te le rappelle à l’écran." />
            <Regle titre="Quatre appels par mois et par personne"
              texte="Toutes tentatives comprises, répondeurs inclus. L’application compte et te le signale." />
            <Regle titre="« Stop téléphone » : jamais"
              texte="Même une fois. Même pour dire bonjour. La fiche est marquée en rouge." />
          </ul>
          <p className="text-sm text-quai-navy font-medium mt-3 leading-snug">
            Et jamais de prix au téléphone.
          </p>
          <p className="text-[13px] text-quai-text leading-snug">
            On propose une actualisation, on ne chiffre pas un bien qu’on n’a pas revu.
            Un chiffre lâché à l’oral, c’est une négociation qui commence avant la visite.
          </p>
        </Carte>

        <Carte titre="Après l’appel">
          <p className="text-sm text-quai-text leading-snug">
            <b className="text-quai-navy">Trois minutes dans l’application, tout de suite.</b>{' '}
            Un appel non noté est un appel perdu : la semaine suivante, personne ne sait
            ce qui a été dit.
          </p>
          <p className="text-[13px] text-quai-muted mt-2 leading-snug">
            L’issue · la nouvelle adresse s’il y en a une · le projet et son échéance ·
            les trois propositions · la date du rendez-vous.
          </p>
          <p className="text-[13px] text-quai-text mt-2 leading-snug">
            Les boutons d’envoi sont sur l’écran d’appel. Ils partent de ta boîte,
            pas d’une adresse générique.
          </p>
        </Carte>

        <p className="text-sm text-quai-navy font-medium text-center leading-snug py-3 px-2">
          Ces gens nous ont fait confiance une fois. Ils ne nous doivent rien
          aujourd’hui — c’est à nous de leur redonner une raison.
        </p>

        <button onClick={onCommencer}
          className="btn-primary w-full min-h-[3.25rem] text-base inline-flex items-center justify-center gap-2 mb-4">
          <Icon name="phone" size="sm" /> Commencer les appels
        </button>
      </div>
    </div>
  )
}

// Extraite pour être réutilisée depuis l'écran d'appel : cette page-ci ne sera
// plus ouverte après le premier matin.
export function AideListe() {
  return (
    <div className="px-4 pb-4 space-y-3">
      <div>
        <div className="text-xs font-semibold text-quai-navy mb-1">La colonne SCRIPT</div>
        <p className="text-[13px] text-quai-text leading-snug mb-1.5">
          Elle te dit lequel des quatre prendre. Elle est calculée, tu n’as pas à décider.
        </p>
        <ul className="text-[13px] space-y-0.5">
          <Puce n="1" texte="C’est ton client, il a reçu le courrier" />
          <Puce n="2" texte="C’est ton client, il n’a rien reçu" />
          <Puce n="3" texte="Tu reprends ce dossier, il a reçu le courrier" />
          <Puce n="4" texte="Tu reprends ce dossier, il n’a rien reçu" />
        </ul>
        <p className="text-[13px] text-quai-text leading-snug mt-2">
          Sur les scripts 3 et 4, <b className="text-quai-navy">le prénom à dire</b> s’affiche
          en tête de la fiche : <i>« je reprends les dossiers qui étaient suivis par
          Charlotte. »</i> Ne reste pas vague, c’est là que l’appel se gagne.
        </p>
      </div>

      <div>
        <div className="text-xs font-semibold text-quai-navy mb-1">Où en est le courrier</div>
        <dl className="text-[13px] space-y-1">
          <Etat label="Envoyé" texte="Il l’a entre les mains." />
          <Etat label="Non imprimé" texte="Son adresse est bonne, le pli n’est pas parti — une correction de fiche et il part." />
          <Etat label="À appeler" texte="On savait l’adresse fausse. Le plus souvent un vendeur encore fiché à l’adresse du bien qu’il a vendu." />
          <Etat label="À trancher" texte="On n’est pas certain que ce soit la bonne personne. Vérifie avant de dérouler — compare avec « Au registre »." />
        </dl>
      </div>
    </div>
  )
}

function Chiffre({ valeur, libelle, accent, couleur }) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? 'bg-quai-navy border-quai-navy' : 'bg-white border-quai-border'}`}>
      <div className={`text-3xl font-bold tabular-nums leading-none ${
        accent ? 'text-quai-gold' : couleur || 'text-quai-navy'}`}>
        {valeur}
      </div>
      <div className={`text-[11px] mt-1 leading-snug ${accent ? 'text-white/70' : 'text-quai-muted'}`}>
        {libelle}
      </div>
    </div>
  )
}

function Carte({ titre, children }) {
  return (
    <div className="bg-white border border-quai-border rounded-xl p-4">
      <h2 className="font-display font-bold text-quai-navy mb-2">{titre}</h2>
      {children}
    </div>
  )
}

function Proposition({ n, titre, texte }) {
  return (
    <li className="flex gap-2">
      <span className="w-5 h-5 rounded-full bg-quai-navy text-white text-[11px] font-bold
                       grid place-items-center shrink-0 mt-0.5">{n}</span>
      <span className="text-[13px] leading-snug">
        <b className="text-quai-navy">{titre}</b> — <span className="text-quai-text">{texte}</span>
      </span>
    </li>
  )
}

function Regle({ titre, texte }) {
  return (
    <li className="flex gap-2">
      <Icon name="alert-triangle" size="sm" className="text-quai-gold shrink-0 mt-0.5" />
      <span className="text-[13px] leading-snug">
        <b className="text-quai-navy">{titre}</b> — <span className="text-quai-text">{texte}</span>
      </span>
    </li>
  )
}

function Puce({ n, texte }) {
  return (
    <li className="flex gap-2">
      <span className="w-4 h-4 rounded bg-quai-navy text-white text-[10px] font-bold
                       grid place-items-center shrink-0 mt-0.5">{n}</span>
      <span className="text-quai-text">{texte}</span>
    </li>
  )
}

function Etat({ label, texte }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium text-quai-navy w-24 shrink-0">{label}</dt>
      <dd className="text-quai-text leading-snug">{texte}</dd>
    </div>
  )
}
