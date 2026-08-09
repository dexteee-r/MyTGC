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

### Filtrer par date de sortie
**Bloqué côté données.** Il n'y a aucune date en base : `cards` ne porte ni date de
sortie ni date d'extension, et l'import depuis punk-records n'en récupère pas. Il faut
d'abord vérifier si la source expose une date par extension, l'ajouter au schéma et à
l'import, puis seulement filtrer. Sans ça il n'y a rien à trier.

En attendant, le code d'extension est un proxy correct : `OP-01` est antérieur à
`OP-15`. Un tri « extension décroissante » donnerait 90 % du bénéfice tout de suite.

### Filtrer sur plusieurs raretés à la fois
Aujourd'hui `rarity` est une valeur unique côté API comme côté écran. Il faut passer le
paramètre en liste (`rarity=Rare&rarity=SuperRare`), adapter la requête SQL en `IN`, et
faire passer les pastilles de « une seule active » à « plusieurs actives ». Même travail
pour la couleur, tant qu'on y est.

### Trois cartes par ligne
Aujourd'hui deux. Le nombre de colonnes est calculé dans `CardGrid`. À faire avec
l'option d'affichage ci-dessous plutôt que comme une valeur en dur — c'est la même
décision.

### Choisir l'affichage depuis le panneau de filtres
Deux ou trois par ligne, éventuellement une vue liste. Se range dans la feuille de
filtres. Le chemin est tracé : `users.default_language` a montré comment une préférence
persiste côté compte, et le mécanisme `LATE_COLUMNS` fait la migration tout seul.
Ajouter `users.grid_columns` suit exactement le même patron.

### Ajouter aux recherchées au survol
Sur navigateur, survoler une carte de la grille fait apparaître un bouton qui la met
dans les recherchées sans ouvrir sa fiche. Souris uniquement — sur mobile il n'y a pas
de survol, et la fiche reste le chemin. À câbler dans `CardTile`, avec le même appel
que le bouton de la fiche carte.

### Recherche par tirage : `Ace & Newgate (ST22-001) (V.1)`
Il faut que taper un nom propose les tirages, avec leur code et leur version. La donnée
existe : une carte porte déjà plusieurs `printings`, et `ambiguous_printing` sait dire
quand ils sont indiscernables. Ce qui manque est l'affichage — une liste de suggestions
sous le champ plutôt qu'une grille filtrée — et la numérotation `(V.1)` / `(V.2)`, qui
n'est pas en base et devrait se déduire de l'ordre des tirages d'un même code.

### Recherche par nom de carte
Partiellement là : `q` cherche déjà dans le nom et dans le code. Ce qui manque est la
tolérance — accents, casse, et surtout les noms japonais, qui n'ont pas d'espaces et
que `LIKE '%…%'` ne découpe pas. À regarder : `FTS5`, que SQLite embarque déjà.

---

## Recherchées / Primes

### Les mêmes filtres que Chercher
Rareté, couleur, édition, et l'affichage. La liste est courte aujourd'hui, donc c'est
surtout utile une fois qu'elle grossit — à faire après les filtres de Chercher, en
partageant le même composant de feuille plutôt qu'en le dupliquant.

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

---

## Déjà connu, plus ancien

- Réinitialisation de mot de passe (demande un SMTP)
- Prix et valeur totale de la collection (demande une source de prix ; le prix saisi
  à la main sur les recherchées est déjà là)
- Scan hors ligne
- Statistiques de collection
- Build iOS via CI
- Renommer le dépôt et les dossiers `MyTGC` → `MyTCG`
