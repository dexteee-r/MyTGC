# Backlog

Ce qui est demandé et pas encore fait. Une ligne par chose, avec ce qu'elle implique
réellement — plusieurs de ces demandes touchent le backend, et le savoir avant de
commencer évite de découvrir en cours de route qu'il manque une donnée.

Ce fichier est la source de vérité. Ce qui est fait en sort et part dans un commit.

---

## En cours

**La refonte « L'Horizon », écran par écran.** Livrée dans `../renfonte-ui/livraison/`.
Faits et validés : connexion, classeur, extensions, scanner, chercher, collection, mur
d'extension, recherchées. **Restent : la fiche carte, le compte.**

---

## Scan

### Choisir la technologie de reconnaissance sur mobile
Recherche faite, voir `RECHERCHE-SCAN.md`. Conclusion : ne pas remplacer l'algorithme.
Le premier des trois chantiers — ne pas envoyer les images sans carte — est fait.

Reste le dernier :

**Détection embarquée.** Le point B de la recherche, pour le scan hors ligne. À faire
quand celui-ci remontera dans les priorités.

---

## Fait

- **Favicon.** L'éclair violet du scaffold Vite est remplacé par la marque de l'app :
  le soleil sur l'horizon, dessiné, lisible à 16 px.
- **Export CSV.** Sur l'écran Compte. Point-virgule et BOM UTF-8, parce que le fichier
  s'ouvrira dans un Excel français.
- **Édition par défaut.** Retenue sur le compte (`users.default_language`), plus
  réinitialisée à chaque rechargement.
- **Filtre d'édition** dans le panneau, avec « Les deux » — le catalogue contient chaque
  carte deux fois et chercher un nom à travers les deux est le cas normal.
- **Plusieurs raretés et plusieurs couleurs** à la fois. Paramètre répété côté API,
  `IN` et `OR` côté SQL.
- **Tri** par code, par extension la plus récente, ou A → Z.
- **2 ou 3 cartes par ligne**, retenu sur le compte (`users.grid_columns`).
- **Recherche par mots** : chaque mot doit apparaître, dans n'importe quel ordre.
  « newgate ace » trouve « Ace & Newgate ».
- **Marqueur de version** (V.1, V.2, R.1) sur les tirages alternatifs, lu depuis le
  suffixe de l'identifiant. Quatre tuiles identiques deviennent distinguables.
- **Les mêmes filtres sur Recherchées**, via le même composant.
- **Suggestions au fil de la frappe** : `Kid & Killer — EB01-003 (V.2) · INT`, avec les
  flèches et Entrée. Aucune requête en plus : ce sont les premières lignes de la
  recherche déjà en cours, montrées dans une autre forme.
- **Ajout aux recherchées au survol**, souris uniquement.
- **Barre de navigation en haut** sur la version navigateur, centrée, pleine largeur.
- **Porte sur les images sans carte** : le scanner en continu n'envoie plus une image
  quand le cadre est vide. Seuil volontairement bas — sauter une vraie carte coûte plus
  cher qu'envoyer une image vide.
- **Installable depuis Safari** : manifeste, icônes 180/192/512 tirées d'un seul SVG,
  barre d'état translucide et marges de sécurité. Plein écran, sans barre d'adresse.
- **Statistiques de collection** sur le carnet de bord : répartition par édition et par
  rareté, en barres. Le serveur les calculait déjà à chaque appel et personne ne les
  affichait.
- **Le scan dit pourquoi il a raté** : trop sombre, reflet, flou, ou carte inconnue du
  catalogue. Mesuré côté serveur sur l'image déjà décodée, et seulement sur le chemin
  d'échec. Les cinq états de `ScanMiss` sont enfin tous atteignables.
- **Filtrer/trier par date de sortie.** `backend/app/release_dates.py` — 115 dates
  (EN + JP, 58 extensions chacune), sourcées à la main sur les archives produits
  officielles de Bandai. Codée en dur par `pack_id`, pas par `pack_code` : EN et JP ne
  sortent pas une extension à la même date. Colonne `cards.release_date`, tri
  « Plus récentes » sur Chercher et Recherchées. À faire à chaque nouvelle extension :
  ajouter sa ligne, sinon elle atterrit avec les extensions sans code.
- **Valeur estimée de la collection.** Cardmarket et TCGplayer refusent tous les deux
  les nouvelles demandes d'API — ce n'est pas une question de profil, Cardmarket écrit
  noir sur blanc « we are not accepting applications ». Les prix viennent donc de
  tcgcsv.com (miroir quotidien de TCGplayer, sans clé), convertis en euros au taux BCE
  du jour. `import_prices.py`, à lancer sur le serveur, une fois par jour.
  Ce sont des prix **américains**, pas Cardmarket, et l'écran le dit. Les tirages
  alternatifs ne sont cotés que si les deux sources sont d'accord sur leur nombre :
  un alt art vaut ~30× la carte normale, un mauvais appariement fausserait tout.
  ~92 % des cartes de base sont cotées.
- **Prix d'achat sur la fiche carte** + **total dépensé** sur le carnet de bord. Le
  backend (colonne, endpoints, `acquisition_total` dans `/collection/stats`) existait
  déjà sans UI dessus. Ajoutés : le champ sur la fiche carte (même geste que le prix des
  recherchées, saisi à la main), et le total sur le compte, affiché seulement s'il y a
  quelque chose à montrer.

---

## Déjà connu, plus ancien

- Réinitialisation de mot de passe (demande un SMTP)
- Scan hors ligne
- **Build iOS natif** — bloqué par macOS, et payant pour installer sur un vrai
  iPhone (99 €/an). L'app s'installe désormais depuis Safari, ce qui couvre les deux
  seules raisons d'être natif : `getUserMedia` fait tourner le scan, et le jeton de
  renouvellement est déjà dans un cookie httpOnly côté web. À rouvrir seulement si
  quelque chose manque à l'usage.
- Renommer le dépôt et les dossiers `MyTGC` → `MyTCG`
