# Colonne "Dernier suivi" dans la liste Contacts

Date : 2026-06-19
Statut : design validé

## Besoin

Dans l'onglet Contacts, voir le dernier suivi de chaque contact directement
dans la liste, sans ouvrir la fiche. Le "dernier suivi" = la dernière relance
du contact : son issue, sa note, et sa date.

## Décisions

- Contenu : **note + issue + date** de la dernière relance.
- Affichage : **nouvelle colonne "Dernier suivi"** (issue en badge + date + note
  tronquée avec tooltip pour le texte complet).

## Architecture

### Serveur — `GET /contacts` (liste)

La requête liste joint, pour chaque contact, sa relance la plus récente.

```sql
LEFT JOIN relances dr ON dr.id = (
  SELECT id FROM relances WHERE contact_id = contacts.id
  ORDER BY created_at DESC, id DESC LIMIT 1
)
```

Champs ajoutés à chaque contact de la réponse :
- `derniere_issue` (ex 'projet', 'sans_reponse', 'autre'… ou null)
- `derniere_note` (texte ou null)
- `derniere_relance_date` (UTC 'YYYY-MM-DD HH:MM:SS' ou null)

La sous-requête s'exécute par ligne de la page paginée (limit 50) → coût
négligeable sur ~425 contacts. Pas de migration.

### Client — `ContactsPage.jsx`

Nouvelle colonne "Dernier suivi" (entête + cellule), placée après "Statut" ou
en fin de tableau :
- Si `derniere_issue` présent :
  - Badge de l'issue (réutiliser le mapping ISSUES de constants — label court).
  - Date `dd/MM/yyyy` en petit/gris.
  - Note tronquée à ~40 caractères (suffixe "…" si coupée), avec attribut
    `title` = note complète (tooltip natif au survol).
- Sinon : "—".

Mapping issue → label : réutiliser `ISSUES[issue]?.label` (constants.js). Si
l'issue est absente du mapping (relances legacy via `statut`), retomber sur un
libellé neutre ou la valeur brute.

## Découpage

| Unité | Rôle |
|-------|------|
| `contactRoutes.js` (GET /) | + LEFT JOIN dernière relance, 3 champs |
| `ContactsPage.jsx` | + colonne "Dernier suivi" (badge + date + note tronquée) |

## Tests

- **Serveur** : 2 relances sur un contact (dates différentes) → la liste renvoie
  la plus récente (issue/note/date). Contact sans relance → champs null.
- **Navigateur** : liste Contacts → la colonne affiche le dernier suivi ;
  tooltip = note complète ; contact jamais appelé = "—".

## Hors scope

Historique complet dans la liste (reste dans la fiche). Tri/filtre sur le
dernier suivi. Édition depuis la liste.
