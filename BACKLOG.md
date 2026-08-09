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

### Suggestions au fil de la frappe
Reste à faire. Taper un nom montre aujourd'hui une grille filtrée ; la demande était une
liste de suggestions sous le champ, du style `Ace & Newgate (ST22-001) (V.1)`. Le libellé
existe déjà (`printingLabel` dans `components/Edition.tsx`) et la recherche par mots
fonctionne — il manque le composant de liste déroulante et la navigation au clavier.

### Filtrer par date de sortie exacte
Toujours bloqué, et vérifié cette fois : **aucune date nulle part** dans punk-records —
ni dans les cartes, ni dans l'index, ni dans le manifeste. Le tri « Plus récentes » livré
s'appuie sur `pack_id`, qui suit l'ordre de parution (OP-01 = 569101, OP-16 = 569116).
Une vraie date demanderait une seconde source.

---

## Scan

### Choisir la technologie de reconnaissance sur mobile
Recherche faite, voir `RECHERCHE-SCAN.md`. Conclusion : ne pas remplacer
l'algorithme. Trois chantiers utiles y sont listés, dont « ne pas envoyer les images
sans carte », qui est le moins cher et le plus rentable. Décision à prendre avant
d'écrire quoi que ce soit.

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

---

## Déjà connu, plus ancien

- Réinitialisation de mot de passe (demande un SMTP)
- Prix et valeur totale de la collection (demande une source de prix ; le prix saisi
  à la main sur les recherchées est déjà là)
- Scan hors ligne
- Statistiques de collection
- Build iOS via CI
- Renommer le dépôt et les dossiers `MyTGC` → `MyTCG`
