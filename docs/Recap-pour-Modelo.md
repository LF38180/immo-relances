# Opération anciens clients — état de l'application au 27 octobre

**À recouper avec Modelo.**

---

## Ce que je te demande

L'application a été alimentée le 20 octobre depuis un export Modelo. Une
semaine a passé, et une vérification sur les fiches de Cindy BERTRAND a déjà
montré que l'application et le CRM divergent sur plusieurs points.

**Ce que je voudrais que tu vérifies, fiche par fiche quand c'est possible :**

1. **Les portefeuilles.** Les nombres ci-dessous correspondent-ils à ce que
   Modelo attribue aujourd'hui à chaque conseiller ? Un écart signifie soit une
   réattribution faite dans Modelo depuis le 20, soit une erreur d'import.

2. **Les 340 fiches sans conseiller.** Elles sont rattachées à des conseillers
   partis. Pour chacune, Modelo connaît-il un suiveur actuel ? Si oui, lequel —
   c'est lui qui devrait la reprendre.

3. **Les 46 identités incertaines.** Ces fiches ont été appariées sur un nom
   partiel, sans certitude qu'elles correspondent à une vente réelle. Modelo
   permet-il de trancher ?

4. **Les 19 adresses mail d'agents** listées plus bas. Elles sont dans
   l'application à la place de celle du client. Modelo a-t-il la bonne ?

5. **Ce que l'application ignore** et que Modelo saurait : des clients décédés,
   des fiches fusionnées, des oppositions au démarchage enregistrées depuis le
   20 octobre.

**Signale-moi tout écart avant que je corrige.** Les fichiers source ne sont pas
modifiés ; seule la base de l'application le sera.

---

## 1 · Les portefeuilles — 748 fiches attribuées

| Conseiller | Fiches |
|---|--:|
| Tara ZOPPAS | 149 |
| Lynda GUDINCI | 115 |
| Jérôme PAGLIARO | 83 |
| Gilles BORGHIN | 63 |
| Jérémy TINE | 62 |
| Jérémy BERTRAND | 51 |
| Hervé MARTIN | 41 |
| Yasmina MAHDJOUB | 38 |
| Virginie DURAND | 36 |
| Marine ROSAIN | 31 |
| Nathalie ALBIN | 25 |
| Loïck FERRUCCI | 23 |
| Alexandre DUDOUET | 20 |
| Chrystelle BAJULAZ | 9 |
| Nolan BARRETO | 1 |
| Lilas FERKOUS | 1 |
| **Total** | **748** |

> Les 23 fiches de Loïck FERRUCCI sont les anciennes « anomalies Cindy
> BERTRAND ». La vérification du 27 octobre a établi que Cindy n'a négocié
> aucune d'elles : elles sont en cours de réattribution à leur négociateur
> réel. **Ce chiffre va passer à zéro.**

---

## 2 · Les 340 fiches sans conseiller

Portefeuilles de conseillers partis. Le nombre entre parenthèses est le nombre
de fiches que l'application leur rattache.

| Ancien conseiller | Fiches |
|---|--:|
| Charlotte SOLER | 48 |
| Karine CAZARÉ | 41 |
| Arthur SARTORELLI | 38 |
| Karine DIDIER | 32 |
| *(aucun conseiller précédent connu)* | 26 |
| Olivier FRICKERT | 19 |
| Édouard DARLIX | 19 |
| Frédéric LEGRAND | 17 |
| Françoise GIRAUD | 13 |
| Corine VIVIER | 11 |
| Thomas DEGACHE | 9 |
| Angélique FRICKERT | 6 |
| Jean-Pierre SARTORELLI | 6 |
| Antoine HOOGEWYS | 5 |
| Laura DOMEIGNOZ · Nelly LEQUEUX · Tom KLOPPENBURG · Christian DUPUIS · Delphine ALBIN | 4 chacun |
| Etienne CORNU · Salmane BARKOUK | 3 chacun |
| Christophe LECOINTRE · Philippe DRESIN · Sébastien FROMENT · Valentin OHL · Jacques RONZANI · Aurore DINAHET · Elodie RIVIERE | 2 chacun |
| Vanessa ORTIZ · Elliot GIRARDI · Nathalie FREICHET · Pierre-Thomas BEAL | 1 chacun |

**Quatre cas à part** : Lynda GUDINCI (2), Jérémy BERTRAND (1), Jérémy TINE (1),
Marine ROSAIN (1) et Loïck FERRUCCI (1) apparaissent comme anciens conseillers
sur des fiches encore non attribuées — alors qu'ils sont en poste. Ces fiches
devraient logiquement leur revenir. **À confirmer dans Modelo.**

**Les 26 sans conseiller précédent** sont celles où rien ne permet de savoir qui
a suivi le dossier. Si Modelo le sait, je corrige.

---

## 3 · Les 46 identités incertaines

Fiches appariées sur un seul mot du nom, ou sans correspondance avec le registre
des 663 ventes. Elles sont **volontairement hors des listes d'appel** tant que
personne n'a tranché.

Pour chacune, l'application conserve le nom tel qu'il figure au registre des
ventes, en regard du nom de la fiche. Si Modelo permet de confirmer ou
d'infirmer le lien, je règle les 46 d'un coup.

---

## 4 · Les 19 adresses mail d'agents

Ces fiches portent l'adresse d'un conseiller, pas celle du client. Toutes en
`@kwfrance.com`, l'ancienne enseigne. **Le bouton « renvoyer le courrier »
enverrait le pli au conseiller.**

| id_modelo | Client | Adresse trouvée | Conseiller actuel |
|---|---|---|---|
| 121452 | BROCHIER | tara.zoppas@ | Tara ZOPPAS |
| 141182 | GAUDIN | tara.zoppas@ | Tara ZOPPAS |
| 147328 | SCI LES QUATRE SAISONS | tara.zoppas@ | Tara ZOPPAS |
| 96076 | REBOH | yasmina.mahdjoub@ | Yasmina MAHDJOUB |
| 92610 | REPELLIN VILLARD | lynda.gudinci@ | Lynda GUDINCI |
| 81010 | TEMPESTA | jeremy.tine@ | Jérémy TINE |
| 119496 | VESSIERE | gilles.borghin@ | Gilles BORGHIN |
| 91810 | BUSTOS | arthur.sartorelli@ | *(anomalie Cindy)* |
| 82958 | GONZALES | corinne.martin@ | *(anomalie Cindy)* |
| 88128 | HAKKAR | yasmina.mahdjoub@ | *(anomalie Cindy)* |
| 88664 | TULOUP | thomas.degache@ | *(anomalie Cindy)* |
| 74968 | GOADELOT | charlotte.soler@ | à dispatcher |
| 126398 | SOSNOWSKI & DURAND | karine.cazare@ | à dispatcher |
| 13934 | VANTAJOUX | alan.morel@ | à dispatcher |
| 64992 | DAUDIN & ROUZIER | edouard.darlix@ | à dispatcher |
| 60082 | PATUREL | edouard.darlix@ | à dispatcher |
| 71918 | CHEYNET & AYEL | edouard.darlix@ | à dispatcher |
| 80260 | URCEL | val.ohl@ | à dispatcher |
| 70234 | CIL | tom.kloppenburg@ | à dispatcher |

> **Ces 19 ne sont pas les 5 qu'on avait repérées.** Le contrôle a porté sur
> les 1 088 fiches : il y en a quatorze de plus que prévu. Modelo a-t-il la
> bonne adresse pour ces clients, ou faut-il simplement vider le champ ?

---

## 5 · Les adresses portées par plusieurs fiches

Dix-sept adresses apparaissent sur deux ou trois fiches. Certaines sont
légitimes — un couple, une SCI et son gérant. D'autres trahissent un doublon.

**Probablement des doublons à fusionner dans Modelo :**

| Fiches | Nom |
|---|---|
| 154788 · 106398 · 59002 | CASSARINO / PATRUNO · PATRUNO · PATRUNO |
| 36990 · 153334 | COGNE — SARL Grenobloise d'Investissement |
| 146854 · 153204 | MASTROSIMONE |
| 128930 · 36968 | MOUNIER Marie-Laure — SCI Concorde |
| 21540 · 28850 | LAVOREL |
| 128298 · 69110 | MARTINELLI |
| 111678 · 125682 | RENOUD DELARQUE |
| 138348 · 88632 | GONDRAN |
| 86666 · 148378 (+1) | LASSIAZ Gérard — SPA du Dauphiné |

**Probablement légitimes** : 73536 GIMBERT & GRAFFIN avec 79152 GRAFFIN,
37170 GARIN ET ROUGER avec 37022 GARIN, 36970 BLANC avec 115550 SCI PHIVAL.

**À vérifier**, car l'adresse est celle d'un agent : 121452 · 141182 · 147328
(Tara), 88128 · 96076 (Yasmina), et 64992 · 60082 · 71918 (Édouard Darlix).

---

## 6 · Les corrections en cours, à faire aussi dans Modelo

Issues de la vérification du 27 octobre. **L'application ne les reportera pas
dans Modelo** — il faut les y faire séparément.

**Sept fiches encore « suivies par Cindy » à réattribuer :**

| id_modelo | Client | Négociateur réel |
|---|---|---|
| 153334 | COGNE — SARL Grenobloise d'Investissement | Yasmina MAHDJOUB |
| 53556 | SUCHEY & BELASSEN | Yasmina MAHDJOUB |
| 68788 | TENDAYOUDABANY | Jérémy BERTRAND |
| 138348 | GONDRAN | Marine ROSAIN |
| 60142 | MOLIMARD | Lynda GUDINCI |
| 87864 | LABORIE & BOREL | Alexandre DUDOUET |
| 150528 | CARSANA | Jérémy BERTRAND *(déjà chez lui)* |

**Une fiche à sortir de l'opération** : 153204 MASTROSIMONE — location suivie
par Lyes, aucune vente.

**Une vente à corriger** : FL-3732 d'octobre 2025, 6 960 €, aujourd'hui
attribuée à 100 % à Cindy BERTRAND, à reporter sur Frédéric LEGRAND.

---

## 7 · Les totaux attendus après correction

| | Avant | Après |
|---|--:|--:|
| Contacts | 1 088 | 1 087 |
| Exclus | 191 | 192 |
| Attribués | 748 | 731 |
| À dispatcher | 340 | 356 |

Plus aucune fiche au nom de Loïck FERRUCCI, plus aucune occurrence de Cindy
BERTRAND ni comme conseiller ni comme conseiller précédent.

---

## Ce que l'application ne sait pas faire

Elle ne lit pas Modelo et n'y écrit pas. Tout ce qui est corrigé ici doit l'être
séparément dans le CRM, et inversement : une réattribution faite dans Modelo
depuis le 20 octobre n'est pas visible dans l'application.

C'est précisément ce que ce document cherche à mesurer.
