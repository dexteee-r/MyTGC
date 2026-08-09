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

## Chercher

### Filtrer par date de sortie exacte
Toujours bloqué, et vérifié cette fois : **aucune date nulle part** dans punk-records —
ni dans les cartes, ni dans l'index, ni dans le manifeste. Le tri « Plus récentes » livré
s'appuie sur `pack_id`, qui suit l'ordre de parution (OP-01 = 569101, OP-16 = 569116).
Une vraie date demanderait une seconde source.

---

## Scan

### Choisir la technologie de reconnaissance sur mobile
Recherche faite, voir `RECHERCHE-SCAN.md`. Conclusion : ne pas remplacer l'algorithme.
Le premier des trois chantiers — ne pas envoyer les images sans carte — est fait.

Restent les deux autres :

**Dire pourquoi le scan a raté.** `ScanMiss` gère cinq causes dans l'interface, le
serveur n'en renvoie qu'une (détecté ou pas). Le pipeline sait plus que ça : netteté du
contour, variance de luminance, saturation des hautes lumières. Renvoyer `light`, `blur`
ou `glare` transformerait un échec muet en consigne.

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

---

## Déjà connu, plus ancien

- Réinitialisation de mot de passe (demande un SMTP)
- Prix et valeur totale de la collection (demande une source de prix ; le prix saisi
  à la main sur les recherchées est déjà là)
- Scan hors ligne
- Statistiques de collection
- Build iOS via CI
- Renommer le dépôt et les dossiers `MyTGC` → `MyTCG`
