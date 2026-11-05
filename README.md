# Ariane — dashboard de recherches généalogiques

Application web pour recenser, visualiser et accélérer ses recherches généalogiques :
- **Profils indépendants** : un arbre et un espace de travail dédiés par profil.
- **Fiches personnes réactives** : onze cases éditables sur place, calcul de complétion dynamique, rappels et liste de contrôle de l'avancement.
- **Visionneuse haute résolution d'actes d'archives** : téléchargement automatique depuis les portails d'archives, zoom fluide, filtres de lisibilité, gestes tactiles.
- **Transcription paléographique par IA** : transcription des écritures anciennes (XVIe–XXe s.) et report des informations dans les fiches en un clic.
- **Exploration** : arbre interactif, carte Leaflet, calculateur de parenté, tâches et pistes, statistiques par génération, palette de commandes (`Ctrl K`).
- **Carnet** de notes ancré en bas de l'écran, disponible sur toutes les pages.
- **Version mobile** dédiée et installable sur l'écran d'accueil.

Les données sont stockées dans **Turso (libSQL)** en connexion directe : les mêmes données sur tous les appareils, y compris à distance via Tailscale. Sans Turso, Ariane utilise un fichier SQLite local.

---

## Démarrer

```bash
npm install     # Installation des dépendances (une seule fois)
```

Crée un fichier `.env.local` (voir `.env.example`) :

```env
# Mot de passe d'accès au site (obligatoire)
ARIANE_PASSWORD=un_mot_de_passe

# Base de données Turso Cloud
TURSO_DATABASE_URL=libsql://<votre-base>.turso.io
TURSO_AUTH_TOKEN=votre_token_turso

# Sans les variables Turso : base SQLite locale (data/ariane.db par défaut)
# ARIANE_DB=data/ariane.db

# Optionnel : transcription paléographique par IA
# (la clé peut aussi être saisie directement dans la visionneuse d'actes)
GEMINI_API_KEY=AIzaSy...
# ou OPENAI_API_KEY=sk-...
# ou une clé Groq (gsk_...) saisie dans la visionneuse
```

Lance le serveur de développement :

```bash
npm run dev     # http://localhost:3000 (accessible aussi via le réseau local ou Tailscale)
```

Pour la version de production :
```bash
npm run build && npm start
```

Toutes les pages sont protégées par le mot de passe `ARIANE_PASSWORD` (page `/login`, vérification dans `src/proxy.ts`).

---

## Fonctionnalités

### 1. La fiche personne
**Une personne est une carte à remplir.** Onze cases principales — identité, naissance (date / lieu / acte), mariage (date / lieu / acte), décès (date / lieu / acte), parents — auxquelles s'ajoutent les conjoints et les enfants rattachés.
- **Édition sur place** : un clic sur une case en pointillés permet de la saisir directement (Entrée enregistre, Échap annule). Les modifications s'affichent immédiatement, sans rechargement.
- **Avancement** : la colonne de droite montre la liste de contrôle des critères (rempli, manquant ou dispensé), le statut de recherche et la racine Sosa.
- **Rappels** : un commentaire ou une chose à faire peut être attaché à une fiche ; il remonte sur l'accueil dans « À faire sur vos fiches » jusqu'à ce qu'il soit coché.
- **Sources et liens utiles** : notes, sources et recherche Geneanet préremplie avec les critères de la fiche.
- **Navigation** : `J` / `K` (ou un glissement du doigt sur téléphone) pour passer à la fiche suivante ou précédente.
- **Création** : la page « Nouvelle fiche » demande l'identité, le sexe, la naissance et le statut de vie.

### 2. Visionneuse haute résolution d'actes d'archives
Chaque case d'acte (naissance, mariage, décès) dispose d'une visionneuse plein écran :
- **Téléchargement automatique** : quand on enregistre le lien d'un acte, l'image est téléchargée et mise en cache dans `data/actes/`. Changer le lien supprime l'ancienne image et télécharge la nouvelle ; le menu `…` de la case permet aussi de relancer le téléchargement.
- **Portails pris en charge** : Ille-et-Vilaine, Mayenne (IIIF), Corrèze, Seine-Maritime, Manche, Gironde (IIIF Ligeo), portails Archinoë (17, 22, 49, 56…), Google Drive et liens directs vers une image ou un PDF. Les sites protégés sont contournés par un navigateur headless (Puppeteer).
- **Outils d'examen** : zoom progressif (molette, boutons ou pincement), déplacement, rotation à 90°, filtres de luminosité, de contraste et d'inversion pour les encres pâlies.
- **Carnet à portée de main** : le bouton « Carnet » de la visionneuse ouvre le carnet sans quitter l'acte, y compris en plein écran.
- **Téléchargement en masse** : `npm run actes:download` rapatrie en local tous les actes d'un profil.

### 3. Transcription paléographique par IA
Intégrée à la visionneuse, elle s'appuie sur les modèles de vision (Google Gemini, OpenAI, Groq, avec secours local Tesseract) :
- **Transcription intégrale** du texte d'époque (registres paroissiaux, état civil) avec résolution des abréviations.
- **Analyse structurée** : événement, date, paroisse ou commune, officiants et témoins.
- **Parents** : repérage des mentions de décès (*feu*, *feue*, *défunt*) et de leurs dates et lieux, fréquents dans les actes de mariage ; déduction de l'année de naissance à partir des âges.
- **Patronymes en MAJUSCULES** (`TUAL`, `LE BARON`, `MARTIN`).
- **Report dans la fiche** : une vue de comparaison avant / après permet de choisir les informations à enregistrer dans la fiche de la personne et dans celles de ses parents.

### 4. Complétion adaptative & dispenses d'actes
- **Personnes vivantes** (`is_living`) : dispense automatique des critères de décès (date, lieu, acte), mention `(vivant)`.
- **Célibataires / sans union** (`is_unmarried`) : dispense automatique des critères de mariage.
- **Actes introuvables ou inaccessibles** : le menu `…` de la case d'acte propose « Dispenser cet acte », avec un motif (archives lacunaires, registres détruits, délai de communicabilité de 75/100 ans), pour ne pas pénaliser la fiche.
- **Statut « Complet (lacunes) »** : quand un acte est dispensé, la date et le lieu correspondants le sont aussi s'ils ne sont pas connus.
- **Barème** : 11 critères de base (`src/lib/completion.ts`).

### 5. Arbre
- **Liens orthogonaux** façon Geneanet entre les générations, cartes nettes à tous les niveaux de zoom.
- **Animation** : en sélectionnant une carte, l'arbre se recompose en vague autour d'elle ; la personne choisie est recentrée.
- **Panneau d'options repliable** sur le côté : personne au centre, retour à la racine Sosa, nombre de générations d'ascendants (1 à 5), descendance (aucune, enfants, petits-enfants), affichage de la fratrie. Sur téléphone, ces options passent dans un tiroir.

### 6. Racine Sosa (G1)
- Le « de cujus » porte le numéro 1. Il est rappelé sur l'accueil, marqué **G1** sur sa fiche et dans l'arbre.
- Pour changer de racine : « Définir comme racine (G1) » dans la colonne de droite d'une fiche, ou dans les Réglages du profil.
- Numérotation Sosa ascendante automatique (père = $2n$, mère = $2n+1$), qui alimente le suivi par génération de la page Statistiques ($n$ ancêtres trouvés sur $2^{g-1}$ attendus).

### 7. Palette de commandes & raccourcis clavier
- **Palette** : `Ctrl K` (`⌘ K` sur Mac), `Alt K` ou `/` hors champ de saisie ouvrent la palette : fiches, pages et actions (créer une fiche, changer de thème, de profil). Sans saisie, elle propose les fiches récemment consultées.
- **Recherche multi-termes** tolérante : noms, prénoms, formes composées comme `(LE) BARON`, années, communes ou numéros Sosa (`16`, `#16`).
- **Raccourcis** : `J` / `K` fiche suivante / précédente, `Ctrl B` replier la barre latérale, `Ctrl .` ouvrir ou replier le carnet.

### 8. Normalisation des dates et des lieux
- **Dates** : `19/11/1882`, `19 nov 1882`, `1882-11-19` deviennent `19 novembre 1882` ; `v1880` et `~1880` deviennent `vers 1880` ; `<1900` devient `avant 1900` ; `>1925` devient `après 1925`.
- **Lieux** : le champ propose d'abord les communes déjà utilisées dans le profil, puis celles de `geo.api.gouv.fr` (`Commune, Département, France`). Hors ligne, les suggestions locales restent disponibles.

### 9. Carnet
Un bloc-notes par profil, ancré en bas de l'écran sur toutes les pages, comme une fenêtre de messagerie : replié, ce n'est qu'un onglet ; un clic sur l'en-tête (ou `Ctrl .`) le fait monter ou descendre, et la page reste utilisable derrière. Tout s'enregistre pendant la frappe et se retrouve sur tous les appareils. Deux raccourcis : insérer un lien vers la page en cours (qui devient une pastille cliquable) et la date du jour. Sur téléphone, il s'ouvre depuis l'icône de la barre du haut et se replie en pastille au-dessus des onglets.

### 10. Version mobile
Sous 1024 px de large, Ariane bascule dans une interface pensée pour le téléphone :
- **Barre d'onglets** en bas (Accueil, Personnes, Arbre, Tâches, Plus), masquée pendant la saisie ; le tiroir « Plus » donne la carte, la parenté, les statistiques, les réglages, le thème et les profils.
- **Barre du haut contextuelle** : retour sur les sous-pages, titre qui apparaît au défilement, recherche plein écran.
- **Tiroirs** à la place des fenêtres : ils montent du bas et se referment en les tirant vers le bas.
- **Personnes** en liste compacte avec index A–Z à faire glisser sur le bord droit ; bouton flottant pour créer une fiche.
- **Fiche** : glissement du doigt pour passer d'une fiche à l'autre ; actions dans le menu « ⋯ ».
- **Visionneuse d'actes** : glisser pour déplacer, pincer pour zoomer, double toucher pour zoomer ou revenir à l'ensemble.
- **Installable** sur l'écran d'accueil (manifeste et icônes) : Ariane s'ouvre alors en plein écran, comme une application.

---

## Pages de l'application

| Page | Rôle |
|---|---|
| `/p/<profil>` | Tableau de bord : chiffres clés, « À faire sur vos fiches », alertes (incohérences, racine Sosa), fiches presque terminées, répartition par statut, modifications récentes |
| `/p/<profil>/personnes` | Toutes les fiches en grille, en liste triée par nom avec index alphabétique, ou en tableau par statut ; filtres (statut, commune, siècle, génération, branche) et vues enregistrées |
| `/p/<profil>/personnes/<id>` | La fiche : état civil, actes et visionneuse, transcription IA, famille, notes, sources, rappels, avancement |
| `/p/<profil>/personnes/nouvelle` | Création d'une fiche |
| `/p/<profil>/arbre` | Arbre interactif centré sur une personne, avec panneau d'options repliable |
| `/p/<profil>/carte` | Carte Leaflet des communes et des événements de la famille |
| `/p/<profil>/parente` | Calculateur de parenté : ancêtres communs, chaîne de transmission, degrés civil et canonique |
| `/p/<profil>/taches` | Tâches de recherche (cases à cocher, annulation), pistes générées automatiquement et liens utiles |
| `/p/<profil>/statistiques` | Suivi des générations Sosa, complétion globale, couverture géographique, morceaux d'arbre isolés |
| `/p/<profil>/reglages` | Profil, racine Sosa, apparence, exports GEDCOM (Geneanet) et JSON, suppression du profil |

---

## Statuts

Les fiches se répartissent en cinq statuts, toujours affichés avec leur libellé :
- **Pas commencé** (gris) : fiche créée sans recherche active.
- **En recherche** (bleu) : recherches documentaires en cours.
- **Bloqué** (rose / rouge) : recherche arrêtée faute de sources.
- **Complet** (vert) : tous les faits et actes renseignés (100 %).
- **Complet (lacunes)** (sarcelle) : recherche aboutie avec des dispenses d'actes justifiées.

Sur la page Personnes, l'affichage « Tableau » (ou `/p/<profil>/personnes?vue=kanban`) range les fiches en colonnes par statut ; il suffit de faire glisser une fiche pour changer son statut.

---

## Exports & sauvegardes

- **Export GEDCOM 5.5.1** pour Geneanet, avec options de personnalisation (page Réglages).
- **Export JSON** complet et lisible du profil (page Réglages).
- **Export CSV** des fiches filtrées à l'écran (menu `…` de la page Personnes).
- **Morceaux d'arbre** : la page Statistiques recense les sous-arbres que rien ne relie au tronc principal, avec un lien vers la personne la plus récente de chacun pour faciliter le raccordement.
- **Base locale** : sans Turso, le fichier `data/ariane.db` contient toutes les données (facile à copier ou archiver).

---

## Direction artistique

Interface sobre et typographique conçue pour de longues sessions de travail :
- **Structure** : barre latérale repliable (profil, recherche, navigation, outils, thème ; bouton de repli en bas à gauche) et plan de travail en panneau ; barre d'onglets et tiroirs sur mobile.
- **Thèmes** : clair, sombre ou selon le système ; jetons de couleur définis dans `src/app/globals.css`.
- **Couleur d'accent** au choix dans les Réglages (violet, indigo, rose, cuivre, graphite) : elle porte les actions principales, la sélection et les avatars.
- **Avatars génératifs** : chaque personne reçoit un petit motif graphique (24 motifs : points, rayures, cibles, fleurs, vagues…) en nuances de la couleur d'accent, à la place des initiales (`src/components/Orb.tsx`).
- **Couleurs de sens** : les statuts de recherche et la jauge de complétion ont leurs propres teintes, toujours doublées d'un libellé ou d'un compte.
- **Composants** : icônes au trait embarquées (`src/components/icons.tsx`), dialogues natifs accessibles, menus au clavier, messages de confirmation et confirmation avant toute suppression.
- **Typographie** : **Inter** pour l'interface (chiffres tabulaires pour les années et compteurs), **Geist Mono** pour les raccourcis clavier.
- **Lisibilité** : taille de l'interface réglable de 90 % à 120 % dans les Réglages, sans zoom de page.

---

## Scripts

| Commande | Action |
|---|---|
| `npm run dev` | Serveur de développement, en écoute réseau sur `0.0.0.0:3000` |
| `npm run build` | Compile l'application pour la production |
| `npm start` | Démarre l'application compilée |
| `npm run lint` | Vérifie le code avec ESLint |
| `npm run deploy` | Déploie sur le VPS (voir ci-dessous) |
| `npm run actes:download` | Télécharge en local tous les actes référencés dans la base |
| `npm run import -- <fichier.csv>` | Importe un export de base Notion au format CSV |
| `npm run verify -- <fichier.csv>` | Compare la complétion recalculée avec les pourcentages Notion |
| `npm run audit -- <fichier.csv>` | Analyse la connectivité de l'arbre et détecte les branches isolées |
| `npm run migrate:status` | Convertit les statuts hérités de Notion vers ceux du dashboard |
| `npm run migrate:turso` | Transfère la base SQLite locale vers Turso |
| `npm run db:save` | Point de contrôle et sauvegarde de la base locale |

---

## Déploiement

`npm run deploy` (`scripts/deploy.mjs`) :
1. commite les modifications locales en attente (`chore(deploy): auto-deploy <date>`) ;
2. pousse la branche `master` vers le dépôt du VPS (`git push vps master`) ;
3. lance sur le VPS `npm run build` puis `pm2 restart ariane`.

Le script ne lance jamais `npm install` sur le VPS : une nouvelle dépendance doit y être installée à la main. Pour garder un historique lisible, mieux vaut faire un vrai commit avant de déployer.

Historique : le tag `antigravity-final` marque le dernier état de la version développée avec Antigravity ; la refonte réalisée avec Claude Code commence au commit suivant.

---

## Structure du projet

```
src/
├── app/                      # Next.js App Router & Server Actions
│   ├── actions.ts            # Mutations de données (édition, actes, rappels, carnet, liens familiaux)
│   ├── api/
│   │   ├── actes/            # Distribution des images d'archives en local
│   │   ├── communes/         # Recherche et autocomplétion des lieux
│   │   ├── ocr/              # Analyse IA et transcription paléographique
│   │   └── profils/          # Exports (JSON, GEDCOM)
│   ├── login/                # Page de connexion
│   ├── manifest.ts           # Manifeste de l'application installable
│   └── p/[slug]/             # Routes du profil (accueil, personnes, arbre, carte, parenté, tâches, stats, réglages)
├── components/
│   ├── ActSlot.tsx           # Case d'acte (saisie du lien, téléchargement, dispense)
│   ├── ActViewerModal.tsx    # Visionneuse, filtres, gestes tactiles et report de la transcription
│   ├── AppShell.tsx          # Barre latérale, raccourcis globaux, carnet
│   ├── CommandPalette.tsx    # Palette de commandes (Ctrl K)
│   ├── FamilyTree.tsx        # Arbre interactif
│   ├── MobileChrome.tsx      # Barre du haut et barre d'onglets mobiles
│   ├── Notebook.tsx          # Carnet ancré en bas de l'écran
│   ├── Orb.tsx               # Avatars génératifs
│   ├── PersonExplorer.tsx    # Page Personnes : filtres, vues grille / liste / tableau
│   ├── PersonReminders.tsx   # Rappels d'une fiche et bloc de l'accueil
│   ├── ui.tsx                # Primitives d'interface (boutons, badges, cartes, jauges)
│   └── icons.tsx             # Jeu d'icônes au trait
├── lib/
│   ├── act-downloader.ts     # Téléchargement d'actes par portail d'archives (Puppeteer si besoin)
│   ├── transcription-parser.ts # Structuration des retours de transcription
│   ├── completion.ts         # Calcul de complétion et dispenses
│   ├── db.ts                 # Connexion Turso / libSQL ou SQLite local
│   ├── queries.ts            # Requêtes SQL
│   ├── theme.ts              # Thème, couleur d'accent et taille de l'interface
│   ├── use-media.ts          # Détection mobile, clavier virtuel et défilement
│   └── types.ts              # Types TypeScript
└── proxy.ts                  # Protection par mot de passe
data/
├── ariane.db                 # Base SQLite locale (sans Turso)
└── actes/                    # Cache des images d'actes
```
