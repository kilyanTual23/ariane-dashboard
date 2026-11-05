# Ariane — dashboard de recherches généalogiques

Application web pour recenser, visualiser et accélérer ses recherches généalogiques :
- **Profils indépendants** : un arbre et un espace de travail dédiés par profil.
- **Fiches personnes réactives** : onze cases éditables sur place, calcul de complétion dynamique et mises à jour optimistes de l'interface.
- **Visionneuse haute résolution d'actes d'archives** : affichage local plein écran, zoom fluide, filtres de lisibilité et téléchargement automatique.
- **Moteur de transcription paléographique IA** : transcription fidèle des écritures anciennes (XVIe–XXe s.) et extraction automatique des entités généalogiques (dates, lieux, filiation, mentions de décès des parents).
- **Navigation & exploration** : arbre interactif, carte géographique Leaflet, calculateur de parenté, liste de tâches intelligente et recherche globale instantanée.

Base de données connectée en temps réel au cloud via **Turso (libSQL)** avec réplica local embarqué : synchronisation instantanée multi-appareils, résilience hors-ligne et accès à distance fluide (y compris via Tailscale).

---

## Démarrer

```bash
npm install     # Installation des dépendances (une seule fois)
```

Crée un fichier `.env.local` (voir `.env.example`) avec les clés d'accès Turso et, optionnellement, une clé d'IA pour la paléographie :

```env
# Base de données Turso Cloud
TURSO_DATABASE_URL=libsql://ariane-db-kilyantual23.aws-eu-west-1.turso.io
TURSO_AUTH_TOKEN=votre_token_turso

# Optionnel : Moteur de transcription paléographique par IA
# (Peut aussi être saisi directement dans la visionneuse d'actes)
GEMINI_API_KEY=AIzaSy...
# ou OPENAI_API_KEY=sk-...
# ou GROQ_API_KEY=gsk_...
```

Lance le serveur de développement :

```bash
npm run dev     # http://localhost:3000 (accessible aussi via votre réseau local ou Tailscale)
```

Pour la version de production optimisée :
```bash
npm run build && npm start
```

---

## Fonctionnalités clés

### 1. La fiche personne & saisie en place
**Une personne est une carte à remplir.** Onze cases principales — identité, naissance (date / lieu / acte), mariage (date / lieu / acte), décès (date / lieu / acte), parents — auxquelles s'ajoutent les conjoints et les enfants rattachés.
- **Édition instantanée** : un clic sur une case en pointillés permet de la saisir sur place (Entrée enregistre, Échap annule).
- **Zéro latence** : les modifications s'appuient sur des mises à jour optimistes de l'interface pour une réactivité immédiate sans rechargement.

### 2. Visionneuse haute résolution d'actes d'archives
Chaque case d'acte (naissance, mariage, décès) dispose d'une visionneuse dédiée plein écran :
- **Téléchargement automatique et stockage local** : lors de la saisie d'un lien d'archives (portail départemental ou URL d'image), le fichier est automatiquement téléchargé et mis en cache dans `data/actes/`.
- **Contournement des protections WAF** : automatisation headless via Puppeteer pour récupérer de façon transparente les images sur les sites protégés (notamment les Archives départementales de la Seine-Maritime et de la Manche).
- **Outils d'examen de documents** : zoom progressif fluide (molette ou boutons), déplacement pan par glisser-déposer, rotation à 90°, et filtres d'image (luminosité, contraste, inversion négatif/positif noir & blanc) pour déchiffrer les encres passées ou les parchemins sombres.
- **Téléchargement en masse** : la commande `npm run actes:download` permet de rapatrier en local l'intégralité des actes d'un profil.

### 3. Moteur de transcription paléographique IA
Intégré directement à la visionneuse d'actes, le module de paléographie assistée par IA exploite les modèles vision modernes (Google Gemini, OpenAI, Groq, avec secours local Tesseract) :
- **Transcription intégrale** : restitution fidèle du texte d'époque (registres paroissiaux, état civil) avec résolution des abréviations.
- **Analyse généalogique structurée** : détection automatique de l'événement, de la date précise, de la paroisse/commune, des officiants et témoins.
- **Détection fine des parents & statuts** : identification immédiate des mentions de décès des parents (*feu*, *feue*, *défunt*), ainsi que de leurs dates et lieux de décès souvent mentionnés dans les actes de mariage.
- **Règle absolue des patronymes** : standardisation automatique de tous les noms de famille en MAJUSCULES (`TUAL`, `LE BARON`, `MARTIN`).
- **Enregistrement en 1 clic** : un formulaire complet d'injection généalogique permet de vérifier et d'enregistrer instantanément les informations dans la fiche de l'individu et dans celles de ses parents sans saisie manuelle fastidieuse.

### 4. Complétion adaptative & dispenses d'actes
Le calcul de complétion reflète fidèlement la réalité de la recherche :
- **Personnes vivantes** (`is_living`) : dispense automatique des critères de décès (date, lieu, acte), mention `(vivant)`.
- **Célibataires / sans union** (`is_unmarried`) : dispense automatique des critères de mariage (date, lieu, acte).
- **Actes introuvables ou inaccessibles** : le menu `…` de la case d'acte propose « Dispenser cet acte », avec un motif légitime (archives lacunaires, registres détruits, délai de communicabilité de 75/100 ans), pour ne pas pénaliser la fiche. La liste de contrôle de la fiche montre chaque critère rempli, manquant ou dispensé.
- **Statut « Complet (lacunes) »** : lorsqu'un acte est ignoré, la date et le lieu correspondants sont automatiquement dispensés s'ils ne sont pas connus, permettant à la carte d'être considérée comme terminée.

### 5. Palette de commandes & raccourcis clavier
- **Palette universelle** : `Ctrl K` (`⌘ K` sur Mac), `Alt K` ou la touche `/` hors champ de saisie ouvrent la palette : fiches, pages et actions (créer une fiche, changer de thème, de profil).
- **Moteur multi-termes** : recherche tolérante prenant en compte simultanément noms, prénoms, orthographes composées avec parenthèses comme `(LE) BARON`, années, communes ou numéros Sosa (`16`, `#16`). Sans saisie, la palette propose les fiches récemment consultées.
- **Navigation au clavier** : flèches et `Entrée` dans la palette ; `J` / `K` pour passer à la fiche suivante ou précédente ; `Ctrl B` pour replier la barre latérale.

### 6. Normalisation automatique des dates et des lieux
- **Dates unifiées** : `19/11/1882`, `19 nov 1882`, `1882-11-19` sont réécrits en `19 novembre 1882` ; `v1880` et `~1880` en `vers 1880` ; `<1900` en `avant 1900` ; `>1925` en `après 1925`.
- **Lieux géo-référencés** : le champ propose en priorité les communes déjà utilisées dans le profil, puis s'appuie sur `geo.api.gouv.fr` (`Commune, Département, France`). En mode hors-ligne, les suggestions locales restent pleinement opérationnelles.

---

### Carnet

Un bloc-notes par profil, ancré en bas de l'écran sur toutes les pages, comme une fenêtre de messagerie : replié, ce n'est qu'un onglet ; un clic sur l'en-tête (ou `Ctrl .`) le fait monter ou descendre, et la page reste utilisable derrière. Tout s'enregistre pendant la frappe et se retrouve sur tous les appareils. Deux raccourcis : insérer un lien vers la page en cours (qui devient une pastille cliquable) et la date du jour. Sur téléphone, il s'ouvre depuis l'icône de la barre du haut et se replie en pastille au-dessus des onglets.

### Version mobile

Sous 1024 px de large, Ariane bascule dans une interface pensée pour le téléphone :
- **Barre d'onglets** en bas (Accueil, Personnes, Arbre, Tâches, Plus), masquée pendant la saisie ; le tiroir « Plus » donne la carte, la parenté, les statistiques, les réglages, le thème et les profils.
- **Barre du haut contextuelle** : retour sur les sous-pages, titre qui apparaît au défilement, recherche plein écran.
- **Tiroirs** à la place des fenêtres : ils montent du bas et se referment en les tirant vers le bas.
- **Personnes** en liste compacte avec index A–Z à faire glisser sur le bord droit ; bouton flottant pour créer une fiche.
- **Fiche** : on passe à la suivante ou à la précédente d'un glissement du doigt ; actions dans le menu « ⋯ ».
- **Visionneuse d'actes** : glisser pour déplacer, pincer pour zoomer, double toucher pour zoomer ou revenir à l'ensemble.
- **Installable** sur l'écran d'accueil (manifeste et icônes) : Ariane s'ouvre alors en plein écran, comme une application.

## Navigation et pages de l'application

| Page | Rôle |
|---|---|
| `/p/<profil>` | Tableau de bord : chiffres clés, alertes (incohérences, racine Sosa), fiches presque terminées, pistes, modifications récentes |
| `/p/<profil>/personnes` | Toutes les fiches en grille, en liste triable ou en tableau par statut ; filtres et vues enregistrées mémorisés |
| `/p/<profil>/personnes/<id>` | La fiche individuelle : état civil, actes et visionneuse HD, transcription IA, famille, notes, sources, avancement |
| `/p/<profil>/personnes/nouvelle` | Création d'une fiche : identité, sexe, naissance et statut de vie |
| `/p/<profil>/arbre` | Navigation dans l'arbre : descendance à gauche, ascendance dynamique à droite (3 à 6 générations) |
| `/p/<profil>/carte` | Carte géographique interactive Leaflet des communes et événements de la famille |
| `/p/<profil>/parente` | Calculateur de parenté : ancêtres communs, chaîne de transmission et degrés civil / canonique |
| `/p/<profil>/taches` | Tâches de recherche (cases à cocher, annulation), pistes générées automatiquement et liens utiles |
| `/p/<profil>/statistiques` | Suivi des générations Sosa (G1), taux de complétion global et couverture géographique |
| `/p/<profil>/reglages` | Profil, racine Sosa (G1), apparence, exports GEDCOM et JSON, suppression du profil |

---

### 7. Racine Sosa (G1) et suivi généalogique
- Le « de cujus » porte le numéro 1. Il est rappelé en permanence en haut de l'accueil, marqué **G1** sur sa fiche et dans l'arbre.
- Le bouton **« Revenir au G1 »** permet de se recentrer instantanément dans l'arbre depuis n'importe quelle branche.
- Pour changer de racine : action « Définir comme racine (G1) » dans la colonne de droite d'une fiche, ou dans les réglages du profil.
- Numérotation Sosa ascendante automatique (père = $2n$, mère = $2n+1$), alimentant le suivi par génération sur la page Statistiques ($n$ ancêtres trouvés sur $2^{g-1}$ attendus).

---

## Cycle de vie & Statuts

Les fiches se répartissent en cinq statuts clairement identifiés :
- **Pas commencé** (gris) : fiche créée sans recherche active.
- **En recherche** (bleu) : recherches documentaires en cours.
- **Bloqué** (rose / rouge) : recherche arrêtée faute de sources ou blocage généalogique.
- **Complet** (vert) : ensemble des faits et actes renseignés (100 %).
- **Complet (lacunes)** (sarcelle) : recherche exhaustive aboutie avec dispenses légitimes d'actes manquants.

### La vue Tableau
Sur la page Personnes, l'affichage « Tableau » (ou `/p/<profil>/personnes?vue=kanban`) organise les fiches en colonnes selon leur statut : **Pas commencé · En recherche · Bloqué · Complet**. Il suffit de faire glisser une fiche pour mettre à jour son état.

---

## Morceaux d'arbre & Sauvegardes

- **Morceaux d'arbre** : la page Statistiques recense les sous-arbres isolés que rien ne relie au tronc principal. Chaque morceau pointe vers sa personne la plus récente pour faciliter le raccordement.
- **Sauvegarde locale** : le fichier `data/ariane.db` contient l'ensemble des données locales (facilement copiable ou archivable).
- **Export JSON** : la page Réglages génère un export JSON complet et lisible de l'intégralité du profil.
- **Export CSV** : le menu `…` de la page Personnes exporte en CSV les fiches filtrées à l'écran.
- **Barème de complétion** : calculé sur 11 critères de base (`src/lib/completion.ts`), avec prise en compte dynamique des personnes vivantes, des personnes non mariées et des actes ignorés.

---

## Direction artistique

Interface sobre et typographique conçue pour de longues sessions de travail :
- **Structure** : barre latérale repliable (navigation, profil, recherche, thème) et plan de travail en panneau ; tiroir sur mobile.
- **Palette monochrome** : jetons de couleur définis dans `src/app/globals.css` pour les thèmes clair et sombre ; l'encre porte les actions principales.
- **Couleur réservée au sens** : les statuts de recherche et la jauge de complétion sont les seules teintes, toujours doublées d'un libellé ou d'un compte.
- **Composants** : icônes au trait embarquées (`src/components/icons.tsx`), dialogues natifs accessibles, menus au clavier, messages de confirmation et confirmations avant toute suppression.
- **Typographie** : **Inter** pour l'interface (chiffres tabulaires pour les années et compteurs), **Geist Mono** pour les raccourcis clavier.
- **Lisibilité** : taille de l'interface réglable de 90 % à 120 % dans les Réglages, sans zoom de page.

---

## Scripts et outils en ligne de commande

| Commande | Action |
|---|---|
| `npm run dev` | Démarre le serveur Next.js en écoute réseau sur `0.0.0.0:3000` |
| `npm run build` | Compile l'application pour la production |
| `npm start` | Démarre l'application compilée |
| `npm run actes:download` | Télécharge en local tous les actes référencés dans la base |
| `npm run import -- <fichier.csv>` | Importe un export de base Notion au format CSV |
| `npm run verify -- <fichier.csv>` | Compare la complétion recalculée avec les pourcentages Notion |
| `npm run audit -- <fichier.csv>` | Analyse la connectivité de l'arbre et détecte les branches isolées |
| `npm run migrate:turso` | Transfère la base SQLite locale vers le cloud Turso |
| `npm run db:save` | Réalise un point de contrôle et une sauvegarde locale |

---

## Structure du projet

```
src/
├── app/                  # Architecture Next.js App Router & Server Actions
│   ├── actions.ts        # Mutations de données (édition, transcription, liens familiaux)
│   ├── api/
│   │   ├── actes/        # Distribution sécurisée des images d'archives en local
│   │   ├── communes/     # API de recherche et d'autocomplétion des lieux
│   │   └── ocr/          # Moteur d'analyse IA et transcription paléographique
│   └── p/[slug]/         # Routes du profil (accueil, personnes, arbre, carte, parenté, stats)
├── components/           # Composants réutilisables
│   ├── ActSlot.tsx       # Gestionnaire d'acte (saisie, téléchargement, statut)
│   ├── ActViewerModal.tsx# Visionneuse haute résolution, filtres et injection IA
│   ├── AppShell.tsx      # Barre latérale, barre mobile et raccourcis globaux
│   ├── CommandPalette.tsx# Palette de commandes (Ctrl K)
│   ├── PersonExplorer.tsx# Page Personnes : filtres, vues grille / liste / tableau
│   ├── ui.tsx            # Primitives d'interface (boutons, badges, cartes, jauges)
│   └── icons.tsx         # Jeu d'icônes au trait
└── lib/
    ├── act-downloader.ts # Téléchargement d'actes et contournement WAF Puppeteer
    ├── transcription-parser.ts # Analyse et structuration des retours paléographiques
    ├── completion.ts     # Règles de calcul de complétion et dispenses
    ├── db.ts             # Connexion Turso / libSQL et gestion du réplica local
    ├── queries.ts        # Requêtes de lecture SQL haute performance
    └── types.ts          # Typages TypeScript
data/
├── ariane.db             # Base de données SQLite locale / réplica embarqué
└── actes/                # Dossier de cache des images d'actes haute résolution
```
