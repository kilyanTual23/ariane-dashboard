# Ariane — dashboard de recherches généalogiques

Application locale pour recenser les trouvailles : plusieurs **profils de recherche**
(un arbre indépendant par profil), une fiche par personne où tout se saisit sur place,
une liste de travail et quelques chiffres.

Tout vit sur ta machine : Next.js + SQLite (`data/ariane.db`).

## Démarrer

```bash
npm install     # une seule fois
npm run dev     # http://localhost:3000
```

`npm run build && npm start` pour la version optimisée.

## Le principe

**Une personne est une carte à remplir.** Onze cases — identité, naissance
(date / lieu / acte), mariage (date / lieu / acte), décès (date / lieu / acte),
parents — auxquelles s'ajoutent les enfants rattachés ; le bandeau en haut de
chaque carte montre l'état d'un coup d'œil.
Une case vide est en pointillés : elle appelle à être remplie, et un clic suffit
pour le faire sur place (Entrée enregistre, Échap annule). Créer quelqu'un ne
demande qu'un nom ; le reste se remplit au fil des trouvailles.

**Complétion adaptative & dispenses d'actes.**
- **Personnes vivantes** (`is_living`) : dispense automatique des critères de décès (date, lieu, acte), mention `(vivant)`.
- **Célibataires / sans union** (`is_unmarried`) : dispense automatique des critères de mariage (date, lieu, acte).
- **Actes introuvables ou inaccessibles** : un bouton `Ø Ignorer` permet de renseigner un motif (archives lacunaires, archives détruites, délai de communicabilité de 75/100 ans) pour ne pas pénaliser la fiche. Le total s'ajuste dynamiquement (ex: 10/10 = 100 %) et permet à la carte de passer en « Complet » sans actes fictifs.

**Ajout rapide en langage naturel (NLP).**
Sur la page d'ajout d'une personne, un champ d'analyse intelligente interprète directement les phrases libres en français (*« Kilyan TUAL né le 23 octobre 2004 à Fougères, marié à Julie Robert… »*), extrait tous les champs, détecte conjoint et parents, et prépare la carte en un clic.

**Mémorisation des filtres et vues personnalisées.**
Les filtres de recherche de la vue Cartes (statut, SOSA, lien de parenté, éléments manquants, tri) sont mémorisés automatiquement en local et synchronisés dans l'URL. Un sélecteur de vues permet de basculer instantanément sur des préréglages recommandés ou d'enregistrer ses propres combinaisons sous un nom personnalisé.

**Les dates s'écrivent toutes pareil.** `19/11/1882`, `19 nov 1882`, `1882-11-19` sont
réécrits en `19 novembre 1882` ; `v1880` et `~1880` en `vers 1880` ; `<1900` en
`avant 1900` ; `>1925` en `après 1925`. Un aperçu sous le champ annonce ce qui sera
enregistré, et une date incohérente (`29 février 1875`) est conservée telle quelle
plutôt que corrigée d'autorité. Les mois abrégés et `1er` sont acceptés.

**Les lieux aussi.** Le champ propose d'abord les lieux déjà écrits dans le profil
(les plus fréquents en tête, marqués « déjà utilisé »), puis les communes officielles
via `geo.api.gouv.fr`, au format `Commune, Région, France`. Sans connexion, seuls les
lieux déjà saisis sont proposés — rien ne casse.

| Page | Rôle |
|---|---|
| `/p/<profil>` | Recherche, la dernière fiche ouverte, les prochaines pistes |
| `/p/<profil>/personnes` | Le jeu de cartes : grille (tri, filtres, export CSV) ou kanban |
| `/p/<profil>/personnes/<id>` | La carte : ses onze cases, la famille, les notes |
| `/p/<profil>/arbre` | Navigation dans l'arbre : enfants à gauche, ascendance à droite |
| `/p/<profil>/taches` | Liste de travail + pistes calculées depuis les fiches |
| `/p/<profil>/statistiques` | Complétion, générations Sosa, actes manquants, communes |
| `/p/<profil>/reglages` | Racine Sosa, liens d'archives, export JSON |

## Direction artistique

Interface **monochrome** : l'encre (`--fg`) sert aux titres, aux boutons pleins et
aux liens, qui sont soulignés plutôt que colorés. La couleur est réservée au sens —
les quatre statuts et l'avancement des cartes — pour qu'un coup d'œil sur un jeu de
186 cartes reste lisible.

| Rôle | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond / surface | `--bg`, `--surface` | `#f7f8fa`, `#ffffff` | `#0c0d10`, `#141519` |
| Encre | `--fg`, `--fg-muted`, `--fg-subtle` | `#0f1012` → `#9aa0ae` | `#f4f5f7` → `#6f7685` |
| Filets | `--border` | encre à 7 % | blanc à 8 % |
| Complet | `--ok` | `#0d9488` | `#2dd4bf` |
| En recherche | `--info` | `#4f46e5` | `#a5b4fc` |
| À rechercher | `--warn` | `#d97706` | `#fbbf24` |
| Bloqué / Stoppé | `--danger` | `#e11d48` | `#fb7185` |
| À définir | `--neutral` | `#94a3b8` | `#7c8496` |

Les quatre couleurs d'état passent les tests de séparation deuteranope,
protanope et tritanope, et sont toujours accompagnées du mot — jamais seules.

**L'avancement suit une échelle rouge → vert** (`--grade-0` à `--grade-4`, un palier
par tranche : moins de 20 %, 20, 45, 70 %, puis complet). Elle colore le bandeau des
cartes, les jetons de l'arbre et les barres de l'accueil. Là encore la couleur ne
travaille jamais seule : le compte (« 8/11 ») et la longueur remplie l'accompagnent
partout, ce qui la garde lisible en cas de daltonisme.

Le reste tient par l'espace : **DM Sans** pour toute l'interface, **JetBrains Mono**
pour les chiffres que l'on compare (années, compteurs, cases remplies), des titres
en grand corps à interlettrage resserré, des filets à 7 % au lieu de traits pleins,
des cartes à grand rayon posées sur une ombre très douce, et des transitions de
150 ms désactivées si le système demande moins d'animation. Les deux thèmes sont
composés séparément, pas inversés mécaniquement.

## Importer une base Notion

Export Notion en CSV (« Download all rows »), puis :

```bash
npm run import -- "chemin/vers/Généalogie ..._all.csv" --profil "Famille Tual"
npm run verify -- "chemin/vers/Généalogie ..._all.csv" --profil "Famille Tual"
npm run audit  -- "chemin/vers/Généalogie ..._all.csv" --profil "Famille Tual"
```

`--remplacer` réécrit un profil du même nom. `verify` compare la complétion calculée
au pourcentage affiché par Notion, ligne par ligne. `audit` vérifie que **toutes** les
références de parenté du CSV ont trouvé leur carte, puis liste les morceaux d'arbre
que rien ne relie (option `--nom MALLE` pour détailler un patronyme). Ce sont les deux
garde-fous à passer après un import.

Un mariage est ici un **événement partagé** par deux personnes, pas une colonne
recopiée sur chaque fiche. L'import relie les conjoints, rapproche par date et lieu
les mariages que Notion n'avait pas reliés, et conserve les autres avec un conjoint
inconnu. Quelques fiches y gagnent donc des points de complétion que Notion ne leur
comptait pas (l'acte de mariage vaut pour les deux époux).

## L'arbre

L'arbre se **parcourt** : les enfants de la personne courante sont à gauche, son
ascendance à droite sur 3 à 6 générations. Cliquer une carte recentre l'arbre sur
elle — vers le haut comme vers le bas — et la flèche en coin ouvre sa fiche. Les
conjoints sont accessibles depuis la barre d'outils.

L'ascendance est **toujours complète** : un ancêtre absent occupe quand même sa
place, en pointillés (« + père · case à remplir »), et le clic ouvre la carte de son
enfant — c'est de là qu'on rattache un parent. L'en-tête annonce combien de cases
sur combien sont occupées.

## Les quatre statuts

**Pas commencé · En recherche · Bloqué · Complet.** Chacun a sa couleur (gris,
indigo, rose, sarcelle) et n'apparaît jamais sans son mot. Ils sont visibles partout :
en pastilles cliquables sur l'accueil (qui filtrent les cartes), sur chaque carte, et
en sélecteur sur la fiche avec une phrase qui dit ce que chaque état signifie.

Les cinq états de Notion y ont été ramenés par `npm run migrate:status`
(« À définir » et « À rechercher » deviennent « Pas commencé »). La nuance perdue
est recalculée : une carte « Pas commencé » dont on connaît déjà la commune et la
période remonte d'elle-même dans les pistes suggérées.

## Racine Sosa (G1)

Le « de cujus » porte le numéro 1. Il est rappelé en permanence **en haut de
l'accueil** (avec un lien vers sa carte et vers son arbre), marqué **G1** sur son
jeton dans l'arbre et sur sa fiche, et l'arbre affiche un bouton **« ↩ Revenir au
G1 »** dès qu'on s'en est éloigné. Pour en changer : « définir comme G1 » sur
n'importe quelle carte, ou les réglages.

Il prend le numéro 1, son père 2, sa mère 3, etc. Les statistiques basculent alors sur le suivi par génération
(*n* ancêtres trouvés sur 2^(g-1) attendus). Une racine ne remonte qu'**une** branche :
pour couvrir tout l'arbre, la racine doit être la personne la plus récente.

Le sexe alimente la numérotation (père = 2n, mère = 2n+1). L'import le déduit du
prénom quand il est sans ambiguïté ; il se corrige dans la fiche.

## Le report sur Geneanet

Une carte qui passe en **Complet** ou **Bloqué** est terminée côté recherche : la
fiche affiche alors un bandeau qui invite à la reporter sur Geneanet, avec un lien
vers le site et un bouton « C'est reporté, archiver ». La carte devient
**archivée** — elle porte la date du report, sort des invitations, et se repère
d'un ✓ dans le jeu de cartes. Un bouton « rouvrir la carte » annule l'archivage.

L'état de publication se déduit du statut et de la date de report :

| État | Quand |
|---|---|
| en cours | recherche « Pas commencé » ou « En recherche » |
| à mettre sur Geneanet | statut « Complet » ou « Bloqué », pas encore reporté |
| archivée | reportée sur Geneanet, définitivement finie |

Les trois états se lisent à l'œil nu sur une carte : **en cours** est neutre,
**à reporter** porte un liseré ambre et l'étiquette « à reporter sur Geneanet »,
**classée** est posée à plat en gris avec un ✓ — affaire réglée.

L'accueil compte les cartes à reporter, la grille les filtre (« plus de filtres »),
et l'export CSV porte la colonne correspondante.

## Confronter Ariane à l'arbre publié

```bash
npm run geneanet -- "chemin/export.ged" --profil "Famille Tual"             # simulation
npm run geneanet -- "chemin/export.ged" --profil "Famille Tual" --appliquer # archive
```

Le script lit un GEDCOM (Geneanet, MyHeritage…), apparie ses individus aux cartes
par patronyme, prénoms et années, puis **compare les données** : pour chaque fait
connu d'Ariane — date et lieu de naissance, de mariage, de décès — il vérifie qu'il
figure à l'identique dans l'arbre publié. Les écritures de lieux sont rapprochées à
la commune près (« Lieu-dit La Renardière, 35133 Billé » = « Billé »).

Une carte n'est archivée que si elle est **réellement complète** (statut
« Complet » avec 100 % des cases remplies), qu'elle porte au moins deux faits —
un simple homonyme sans données ne compte pas — et que **toutes ses données
figurent à l'identique dans l'arbre Geneanet**. Une carte bloquée ou encore en cours
peut avoir des données sur Geneanet, mais ne sera pas archivée tant que la fiche
n'est pas complète. Le rapport liste aussi les cartes présentes mais incomplètes
côté arbre (avec ce qui manque), celles trop maigres pour trancher, et les
individus de l'arbre sans carte Ariane.

## La vue kanban

`/p/<profil>/personnes?vue=kanban` (bouton « Vue kanban ») range les cartes en cinq
colonnes qui suivent le cycle de vie : **Pas commencé · En recherche · Bloqué ·
Complet · Classées**. On **glisse une carte d'une colonne à l'autre** pour changer
son état ; la déposer dans « Classées » l'archive (et la marque Complet si elle ne
l'était pas), l'en sortir la rouvre. Dans chaque colonne, les cartes les plus
remplies sont en haut.

## Morceaux d'arbre

La page **Chiffres** liste les ensembles que rien ne relie entre eux : deux
personnes appartiennent au même morceau si une filiation ou un mariage les relie,
de proche en proche. Chaque morceau pointe vers sa personne la plus récente —
c'est par là qu'il faudrait le raccorder, en lui rattachant un enfant.

## Sauvegarde

- `data/ariane.db` est la base complète — une copie du fichier suffit.
- Réglages → **Export** produit un JSON lisible de tout le profil.
- La table Personnes exporte en CSV la sélection affichée, filtres compris.

## Structure

```
src/lib/        schéma SQL, accès données, complétion, statistiques, dates FR, résumés
src/app/        pages (App Router) et server actions
src/components/ fiche éditable, table, recherche, graphiques
scripts/        import Notion et vérification
```

Le barème de complétion est dans `src/lib/completion.ts` (11 critères, 1/11 chacun,
celui de la base Notion d'origine), les pistes suggérées dans `src/lib/stats.ts`.
