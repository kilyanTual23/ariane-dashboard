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
- **Ajout rapide en langage naturel (NLP)** : sur la page d'ajout d'une personne, un champ libre analyse directement des phrases en français (*« Kilyan TUAL né le 23 octobre 2004 à Fougères, marié à Julie Robert… »*) et pré-remplit toute la carte en un clic.

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
- **Actes introuvables ou inaccessibles** : le bouton `Ø Ignorer` permet d'indiquer un motif légitime (archives lacunaires, registres détruits, délai de communicabilité de 75/100 ans) pour ne pas pénaliser la fiche.
- **Statut « Complet (lacunes) »** : lorsqu'un acte est ignoré, la date et le lieu correspondants sont automatiquement dispensés s'ils ne sont pas connus, permettant à la carte d'être considérée comme terminée.

### 5. Recherche globale multi-mots & raccourcis clavier
- **Raccourci universel** : `Alt + K` (ou `Ctrl + Shift + K`, ou la touche `/` hors champ de saisie) ouvre instantanément la recherche globale.
- **Moteur multi-termes** : recherche tolérante prenant en compte simultanément noms, prénoms, orthographes composées avec parenthèses comme `(LE) BARON`, années, communes ou numéros SOSA.
- **Navigation au clavier** : sélection des résultats aux flèches, touche `Entrée` pour ouvrir directement la fiche sélectionnée ou basculer vers la vue Cartes filtrée.

### 6. Normalisation automatique des dates et des lieux
- **Dates unifiées** : `19/11/1882`, `19 nov 1882`, `1882-11-19` sont réécrits en `19 novembre 1882` ; `v1880` et `~1880` en `vers 1880` ; `<1900` en `avant 1900` ; `>1925` en `après 1925`.
- **Lieux géo-référencés** : le champ propose en priorité les communes déjà utilisées dans le profil, puis s'appuie sur `geo.api.gouv.fr` (`Commune, Département, France`). En mode hors-ligne, les suggestions locales restent pleinement opérationnelles.

---

## Navigation et pages de l'application

| Page | Rôle |
|---|---|
| `/p/<profil>` | Accueil, dernière fiche consultée, synthèse de recherche et pistes prioritaires |
| `/p/<profil>/personnes` | Vue Cartes : grille filtrable (statuts, Sosa, critères manquants) ou vue Kanban par colonnes |
| `/p/<profil>/personnes/<id>` | La fiche individuelle : cases d'actes, visionneuse HD, transcription IA, famille, notes |
| `/p/<profil>/arbre` | Navigation dans l'arbre : descendance à gauche, ascendance dynamique à droite (3 à 6 générations) |
| `/p/<profil>/carte` | Carte géographique interactive Leaflet des communes et événements de la famille |
| `/p/<profil>/parente` | Calculateur de parenté : ancêtres communs, chaîne de transmission et degrés civil / canonique |
| `/p/<profil>/taches` | Liste de travail manuelle et pistes générées automatiquement |
| `/p/<profil>/statistiques` | Suivi des générations Sosa (G1), taux de complétion global et couverture géographique |
| `/p/<profil>/reglages` | Choix du de cujus (G1), liens d'archives et export JSON intégral |

---

### 7. Racine Sosa (G1) et suivi généalogique
- Le « de cujus » porte le numéro 1. Il est rappelé en permanence en haut de l'accueil, marqué **G1** sur sa fiche et dans l'arbre.
- Le bouton **« ↩ Revenir au G1 »** permet de se recentrer instantanément dans l'arbre depuis n'importe quelle branche.
- Pour changer de racine : action « définir comme G1 » sur n'importe quelle carte ou dans les réglages du profil.
- Numérotation Sosa ascendante automatique (père = $2n$, mère = $2n+1$), alimentant le suivi par génération sur la page Statistiques ($n$ ancêtres trouvés sur $2^{g-1}$ attendus).

---

## Cycle de vie & Statuts

Les cartes se répartissent en cinq statuts clairement identifiés :
- **Pas commencé** (gris) : fiche créée sans recherche active.
- **En recherche** (indigo) : recherches documentaires en cours.
- **Bloqué** (rose / rouge) : recherche arrêtée faute de sources ou blocage généalogique.
- **Complet** (vert émeraude) : ensemble des faits et actes renseignés (100 %).
- **Complet (lacunes)** : recherche exhaustive aboutie avec dispenses légitimes d'actes manquants.

### La vue Kanban
Accessible via `/p/<profil>/personnes?vue=kanban`, elle organise les personnes en colonnes selon leur statut : **Pas commencé · En recherche · Bloqué · Complet · Classées**. Il suffit de faire glisser une carte pour mettre à jour son état. La déposer dans « Classées » marque la fiche comme archivée et synchronisée.

### Suivi et report sur Geneanet
Une carte complète ou bloquée affiche un bandeau invitant à reporter ses données sur son arbre en ligne (Geneanet). Un clic sur « C'est reporté, archiver » estampille la carte d'un marqueur ✓ et la classe définitivement.

Le script de synchronisation permet de vérifier automatiquement la cohérence entre Ariane et un export GEDCOM :
```bash
npm run geneanet -- "chemin/export.ged" --profil "Mon Profil"             # Mode simulation
npm run geneanet -- "chemin/export.ged" --profil "Mon Profil" --appliquer # Validation et archivage
```

---

## Morceaux d'arbre & Sauvegardes

- **Morceaux d'arbre** : la page Chiffres recense les sous-arbres isolés que rien ne relie au tronc principal. Chaque morceau pointe vers sa personne la plus récente pour faciliter le raccordement.
- **Sauvegarde locale** : le fichier `data/ariane.db` contient l'ensemble des données locales (facilement copiable ou archivable).
- **Export JSON** : la page Réglages génère un export JSON complet et lisible de l'intégralité du profil.
- **Export CSV** : la table des personnes exporte instantanément en CSV la sélection filtrée à l'écran.
- **Barème de complétion** : calculé sur 11 critères de base (`src/lib/completion.ts`), avec prise en compte dynamique des personnes vivantes, des personnes non mariées et des actes ignorés.

---

## Direction artistique

Interface sobre et typographique conçue pour de longues sessions de travail :
- **Palette monochrome** : surface claire (`#ffffff` / `#f7f8fa`) ou sombre (`#141519` / `#0c0d10`), filets légers à 7-8 % d'opacité.
- **Couleur réservée au sens** : vert pour la complétion, indigo pour les recherches en cours, ambre pour les alertes, rose pour les blocages.
- **Accessibilité** : contrastes testés pour la vision des couleurs (deuteranope, protanope, tritanope) avec mention textuelle systématique des statuts.
- **Typographie** : **DM Sans** pour l'interface courante, **JetBrains Mono** pour les repères chronologiques, années et ratios chiffrés.

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
| `npm run geneanet -- <export.ged>` | Rapproche les individus avec un export GEDCOM Geneanet |
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
│   ├── TopBar.tsx        # Barre de navigation et raccourcis globaux
│   ├── PersonGrid.tsx    # Grille de cartes et filtres avancés
│   └── QuickSearch.tsx   # Moteur de recherche globale multi-tokens
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
