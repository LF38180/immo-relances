import { useState } from 'react'
import Icon from './ui/Icon'

// Aide contextuelle de l'opération.
//
// Une FAQ plutôt qu'une IA : l'agent est au téléphone, il n'a pas le temps de
// formuler une question et de lire une réponse générée. Les questions sont
// prévisibles et peu nombreuses, et sur une objection il faut la phrase exacte
// validée par l'agence — pas une improvisation.
//
// Le contenu vient de l'arborescence des scripts du 20 octobre.

const RUBRIQUES = {
  // Pendant un appel : ce qui sauve quand le client dit quelque chose
  // d'inattendu. C'est la rubrique ouverte par défaut sur l'écran d'appel.
  appel: [
    {
      titre: '« Ça vaut combien, ma maison ? »',
      corps: [
        'On ne chiffre jamais un bien qu’on n’a pas revu. Un prix lâché au téléphone, c’est une négociation qui commence avant la visite.',
        { dire: 'Je ne peux pas, et je préfère vous le dire : un chiffre donné au téléphone, sans avoir revu le bien, ne vaut rien. Je passe, et je vous donne quelque chose de sérieux.' },
      ],
    },
    {
      titre: '« Comment vous avez eu mon numéro ? »',
      corps: [
        { dire: 'Vous êtes passé par nous pour votre bien, on a vos coordonnées depuis. Et si vous préférez qu’on ne vous appelle plus, je le note tout de suite, c’est fait en dix secondes.' },
        'Factuel, et on ouvre soi-même la porte de sortie. C’est ce qui désamorce.',
      ],
    },
    {
      titre: '« Je ne vends pas » · « Je n’ai besoin de rien »',
      corps: [
        { dire: 'Tant mieux, ce n’est pas l’objet de mon appel. Je voulais prendre de vos nouvelles et vous inviter à la soirée.' },
        'Puis on enchaîne sur la soirée. On ne force pas sur l’estimation.',
      ],
    },
    {
      titre: '« Je ne me souviens pas de vous »',
      corps: [
        'Scripts 3 et 4 — dossier repris.',
        { dire: 'C’est normal, on ne s’est jamais parlé. Je reprends le dossier, c’est tout.' },
      ],
    },
    {
      titre: '« Pourquoi [l’ancien conseiller] est parti ? »',
      corps: [
        { dire: 'Je ne vais pas parler à sa place. Ce qui compte, c’est que vous ayez quelqu’un en face aujourd’hui.' },
        'Enchaîner sans laisser de silence. Ni la version courte, ni la longue, ni le sous-entendu.',
      ],
    },
    {
      titre: '« J’ai suivi [l’ancien conseiller] ailleurs »',
      corps: [
        { dire: 'C’est normal, vous aviez une relation avec elle. Je vous laisse quand même mon numéro : si un jour vous voulez un avis ou une actualisation, vous pouvez m’appeler sans que ça vous engage.' },
        'Terminer en « Joint », et le noter.',
      ],
    },
    {
      titre: '« Ça fait des années que je n’ai pas de nouvelles »',
      corps: [
        { dire: 'Vous avez raison, et c’est précisément ce qu’on est en train de changer.' },
        'On accepte. On ne se justifie pas.',
      ],
    },
    {
      titre: '« C’est du démarchage »',
      corps: [
        { dire: 'Je comprends, je ne vais pas insister. On vous recontacte parce que vous avez été clients, pas pour vous vendre quelque chose. Bonne journée.' },
        'Issue : refus ferme. Retrait définitif.',
      ],
    },
    {
      titre: '« Rappelez-moi plus tard »',
      corps: [
        { dire: 'Quand est-ce que je vous rappelle ?' },
        'On repart toujours avec un créneau. Issue : à rappeler.',
      ],
    },
    {
      titre: 'Je tombe sur un répondeur',
      corps: [
        'Scripts 1 et 3 :',
        { dire: 'Bonjour, [vous] du Quai de l’Immobilier. Vous avez reçu le courrier de notre président — je voulais prendre de vos nouvelles et vous parler d’une soirée le 3 décembre. Je vous rappelle dans les prochains jours.' },
        'Scripts 2 et 4 : ne pas parler du courrier, il n’est pas parti.',
      ],
    },
    {
      titre: 'Ce qu’on ne dit jamais',
      corps: [
        '« Je ne vous dérange pas ? » · « Vous avez deux minutes ? » — on offre un non en trois secondes.',
        '« Vous ne seriez pas vendeur ? » — la réponse est non par réflexe. C’est lui qui amène le sujet.',
        'Du mal d’un concurrent, même s’il y est allé : c’est du dénigrement, c’est sanctionnable.',
        'Rien sur le quartier, le voisinage ou l’ambiance d’un secteur : la discrimination au logement est pénalement sanctionnée, y compris à l’oral.',
      ],
    },
  ],

  objectifs: [
    {
      titre: 'L’actualisation de la valeur',
      corps: [
        'Offerte, sans engagement. On se déplace, on regarde le bien, on dit où il en est.',
        { dire: 'La première : une actualisation de la valeur de votre bien. Le marché a sans doute bougé depuis, dans les deux sens selon les secteurs. C’est offert et sans engagement — je passe, je regarde, je vous dis où vous en êtes.' },
        'S’il accepte : poser la date tout de suite. « Cette semaine ou la prochaine ? »',
        'Au client on dit « actualisation ». En interne on compte des « estimations ».',
      ],
    },
    {
      titre: 'La soirée du 3 décembre',
      corps: [
        'Jeudi 3 décembre, au Casarosa à Crolles.',
        { dire: 'La deuxième : on organise une soirée de retrouvailles le jeudi 3 décembre au Casarosa à Crolles pour revoir nos anciens clients. Ça vous dirait ?' },
      ],
    },
    {
      titre: 'Le panneau « Vendu par Le Quai »',
      corps: [
        'Toujours en dernier. La formule de sortie fait partie de la demande.',
        { dire: 'Et la troisième : on aimerait montrer dans les quartiers ce qu’on y a vendu. Vous accepteriez un panneau « Vendu par Le Quai » chez vous une quinzaine de jours ? Et vous me dites non sans problème.' },
      ],
    },
    {
      titre: 'La fiche à jour',
      corps: [
        'Le quatrième objectif. Il ne se propose pas, il se recueille dans la conversation : son adresse, s’il est toujours propriétaire, s’il a un projet et pour quand.',
        'Si tout est déjà bon, cliquez « Tout est déjà bon » — c’est une information, pas une absence d’information.',
      ],
    },
  ],

  liste: [
    {
      titre: 'La colonne SCRIPT',
      corps: [
        '1 — c’est votre client, il a reçu le courrier.',
        '2 — c’est votre client, il n’a rien reçu.',
        '3 — vous reprenez ce dossier, il a reçu le courrier.',
        '4 — vous reprenez ce dossier, il n’a rien reçu.',
        'Sur les scripts 3 et 4, le prénom de l’ancien conseiller s’affiche en haut de la fiche. Ne restez pas vague : c’est là que l’appel se gagne.',
      ],
    },
    {
      titre: '« Courrier non envoyé »',
      corps: [
        'Le pli n’est pas parti — soit l’adresse était fausse, soit l’impression a bloqué. Aucun courrier n’est revenu : vous appelez quelqu’un à qui on n’a jamais écrit, pas quelqu’un dont le courrier a échoué.',
        'N’en faites pas une affaire. Le courrier se renvoie à la fin, sans s’excuser.',
      ],
    },
    {
      titre: 'Les fiches à vérifier',
      corps: [
        'Elles ne sont pas dans votre liste : on n’est pas certain que ces personnes aient vendu chez nous. Un manager tranche avant qu’elles n’y entrent.',
      ],
    },
  ],

  regles: [
    {
      titre: 'Les horaires',
      corps: [
        'Lundi au vendredi, hors jours fériés, de 10h à 13h et de 14h à 20h.',
        'L’application vous le rappelle à l’écran. Elle ne vous bloque pas : vous êtes professionnel, vous en répondez.',
      ],
    },
    {
      titre: 'Quatre appels par mois',
      corps: [
        'Par personne, toutes tentatives comprises — répondeurs inclus, tous conseillers confondus.',
        'L’application compte et vous le signale.',
      ],
    },
    {
      titre: '« Stop téléphone »',
      corps: [
        'Ces personnes ont demandé à ne plus être démarchées. La fiche est marquée en rouge.',
        'Un refus ferme pendant l’appel les y ajoute définitivement — pour cette opération et les suivantes.',
      ],
    },
    {
      titre: 'Jamais de prix au téléphone',
      corps: [
        'On propose une actualisation, on ne l’improvise pas.',
      ],
    },
  ],
}

const ONGLETS = [
  ['appel', 'Pendant l’appel'],
  ['objectifs', 'Les 4 objectifs'],
  ['liste', 'Ma liste'],
  ['regles', 'Les règles'],
]

export default function AideOperation({ onFermer, rubrique = 'appel' }) {
  const [onglet, setOnglet] = useState(rubrique)
  const [ouverte, setOuverte] = useState(null)

  return (
    <div className="fixed inset-0 z-[1400] bg-black/40 flex items-end md:items-center justify-center md:p-4"
      onClick={onFermer}>
      <div className="bg-quai-light w-full md:max-w-xl h-[88vh] md:h-auto md:max-h-[85vh]
                      rounded-t-2xl md:rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="bg-white px-4 py-3 border-b border-quai-border flex items-center gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-quai-navy text-sm">Aide</div>
            <div className="text-[11px] text-quai-muted">Les phrases validées par l’agence.</div>
          </div>
          <button onClick={onFermer} className="text-quai-muted hover:text-quai-navy p-1.5">
            <Icon name="x" size="sm" />
          </button>
        </div>

        <div className="bg-white px-2 pb-2 flex gap-1 border-b border-quai-border shrink-0
                        overflow-x-auto scrollbar-none">
          {ONGLETS.map(([id, label]) => (
            <button key={id} onClick={() => { setOnglet(id); setOuverte(null) }}
              className={`text-xs px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                onglet === id ? 'bg-quai-navy text-white border-quai-navy'
                              : 'border-quai-border text-quai-muted'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {RUBRIQUES[onglet].map((q, i) => (
            <div key={i} className="bg-white border border-quai-border rounded-xl overflow-hidden">
              <button onClick={() => setOuverte(ouverte === i ? null : i)}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left">
                <span className="text-sm font-medium text-quai-navy leading-snug">{q.titre}</span>
                <Icon name={ouverte === i ? 'chevron-up' : 'chevron-down'}
                  size="sm" className="text-quai-muted shrink-0" />
              </button>
              {ouverte === i && (
                <div className="px-3 pb-3 space-y-2">
                  {q.corps.map((bloc, j) => typeof bloc === 'string' ? (
                    <p key={j} className="text-[13px] text-quai-text leading-snug">{bloc}</p>
                  ) : (
                    // Ce qui se dit au téléphone, mot pour mot.
                    <blockquote key={j} className="text-[13px] text-quai-navy bg-quai-gold/10
                                                   border-l-2 border-quai-gold pl-2.5 py-1.5 leading-snug italic">
                      « {bloc.dire} »
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
