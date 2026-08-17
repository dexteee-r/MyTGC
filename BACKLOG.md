# Backlog

Ce qui est demandé et pas encore fait. Une ligne par chose, avec ce qu'elle implique
réellement — plusieurs de ces demandes touchent le backend, et le savoir avant de
commencer évite de découvrir en cours de route qu'il manque une donnée.

Ce fichier est la source de vérité. Ce qui est fait en sort et part dans un commit.

---

## En cours

**Vers une V1 complète.** Liste longue proposée le 2026-08-16, traitée une tâche à la
fois avec validation avant de passer à la suivante. Voir plus bas ce qui est déjà fait.

Restent, dans l'ordre convenu :
- **Tri par prix sur Chercher, Recherchées et Collection**, croissant/décroissant.
  Demandé le 2026-08-16, à traiter par écran plutôt qu'en un seul mécanisme partagé —
  chacun pose une question différente sur *quel* prix :
  - **Chercher** : un seul prix possible, `Card.market_price`. Le tri est côté
    serveur aujourd'hui (`/cards?sort=`), paginé sur 9 447 cartes — un tri client ne
    marcherait pas, il faut un nouveau cas `price` dans `SORTS` (backend) et l'ajouter
    à `Sort` dans `Filters.tsx`.
  - **Recherchées** : deux prix distincts — `WishlistEntry.price` (saisi à la main,
    « vu à ») et `card.market_price` (la cote). Trier « par prix » sans préciser
    lequel serait ambigu ; probablement deux options de tri séparées, pas une.
  - **Collection** : deux prix aussi — `card.market_price` (valeur actuelle) et
    `acquisition_price` (payé), et la quantité s'en mêle : trier par prix unitaire ou
    par valeur totale de la pile (quantité × prix) ? Cette question rejoint celle déjà
    tranchée pour Doubles (possédées vs échangeables) — probablement la même réponse.
  Aucune de ces pages ne trie aujourd'hui sur une colonne absente en base ou non
  chargée, donc rien de bloquant côté données ; c'est uniquement une question de
  conception à trancher avant de coder, comme demandé.
- Passe d'accessibilité (clavier, focus visibles, contrastes) — en dernier, une fois
  que le reste ne bougera plus

Deux tâches ajoutées en cours de route, à faire après la liste ci-dessus :
- **Nettoyer le projet** : code mort, fichiers inutiles. Fait le 2026-08-17, voir
  « Fait » — les scripts d'analyse et de calibration sous `backend/scripts/`
  passés en revue un par un : `migrate_multiuser.py` supprimé (migration one-shot
  déjà jouée), les six autres (`analyze_separability.py`, `calibrate_threshold.py`,
  `composite_eval.py`, `gate_eval.py`, `synthetic_eval.py`,
  `measure_watermark.py`) gardés — ce sont des outils de mesure qu'on rejouerait
  légitimement si le catalogue grossit, si le pipeline de reconnaissance change,
  ou si le seuil doit être recalibré.
- **Passe de lisibilité/maintenabilité** sur tout le code, zone par zone, adossée aux
  tests existants plutôt qu'en un seul balayage. Pas commencée.

**Anomalie trouvée en cours de route, toujours pas corrigée** : les extensions sans
code imprimé (les Promos) sont liées par leur `pack_id` numérique, que l'écran
Extensions passe ensuite à `/cards` comme si c'était un `pack_code` — leur page se
charge donc vide. La tâche "Objectif d'extension" a contourné le symptôme (le bouton
« Définir comme objectif » ne s'affiche que si `setSize > 0`, donc jamais sur une page
déjà cassée) sans toucher à la cause.

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

- **Nettoyer le projet.** Cherché plutôt que supposé : un
  export compté une seule fois dans tout l'arbre (sa propre déclaration) est
  mort, et un handler FastAPI jamais `include_router()`-é ne répond à rien,
  quel que soit le nombre de fois où son nom apparaît. Huit exports frontend
  jamais réimportés supprimés — quatre icônes (`HomeIcon`, `LayersIcon`,
  `BoxIcon`, `CameraOffIcon`, `PlusIcon` — reste `CameraIcon`, la seule
  utilisée), `Rule` et `Tally` dans `ui.tsx`, et `COLOR_SWATCHES` dans
  `types.ts` — ce dernier avec un commentaire qui prétendait encore servir
  « aux puces de filtre et aux points sur une carte », remplacé depuis par
  `CARD_COLOR`/`CARD_COLORS` sans que le premier n'ait jamais été retiré.
  Trouvé aussi côté serveur, plus sérieux qu'un simple oubli :
  `backend/app/history.py`, un module entier avec son propre `APIRouter`,
  jamais monté sur l'app (`main.py` ne l'importe pas et a sa propre
  implémentation de `/search-history`, authentifiée). Le sien ne l'était
  pas — `save_search(query, user_id)` prenait `user_id` en paramètre brut,
  avec en commentaire « en production, extraire user_id du token JWT » —
  et écrivait dans `data/mytcg.db` en dur plutôt que par la connexion
  centralisée de `db.py`. Mort, mais le genre de mort qui aurait été une
  faille le jour où quelqu'un l'aurait monté par réflexe. Supprimé.
  189 tests serveur et 95 tests client toujours verts après coup, aucun
  fichier retrouvé orphelin après un second passage sur les exports restants.
  Les sept scripts de `backend/scripts/` jamais appelés par l'app passés en
  revue un par un plutôt que devinés : six sont des outils de mesure qu'on
  rejouerait légitimement (catalogue qui grossit, pipeline qui change, seuil
  à recalibrer), gardés. Le septième, `migrate_multiuser.py`, était une
  migration one-shot mono-compte → multi-comptes déjà jouée — le schéma
  actuel ne produit plus jamais la forme qu'il migre, donc plus rien ne peut
  légitimement le rappeler. Supprimé avec l'instruction du README qui y
  renvoyait, plutôt que laissée à pointer vers un fichier qui n'existe plus.
- **Écran d'erreur générique et `ErrorBoundary`.** `Adrift` existait déjà sur 5
  écrans pour les échecs réseau, mais rien n'attrapait un plantage de rendu —
  une exception levée pendant que React peint videait tout l'onglet, sans
  rien à l'écran pour en sortir. Deux boîtes plutôt qu'une : une par écran,
  posée à l'intérieur du `<main>` déjà `key={pathname}` de `Shell`, qui se
  réinitialise donc tout seul dès qu'on change d'onglet — un plantage sur le
  Classeur n'emporte jamais la barre de navigation ; et une autour de toute
  l'app dans `App()`, filet de dernier recours pour un plantage qui
  arriverait avant même que `Shell` existe. Le repli réutilise `Adrift` tel
  quel plutôt qu'un composant à part — même boîte affaissée, même bouton
  Réessayer, un titre et un texte différents suffisent. Rien de ce qui est
  attrapé ne part vers un service tiers : juste la console, cohérent avec ce
  que Mentions légales promet déjà (« aucun service tiers chargé dans la
  page »).
  Vérifié en conditions réelles, pas seulement en test : une exception
  ajoutée exprès en tête de `Home.tsx`, rechargée dans le vrai navigateur —
  l'écran de repli s'affiche, la barre de navigation reste utilisable, changer
  d'onglet vers Collection l'affiche normalement (la boîte ne s'était pas
  propagée plus haut), revenir au Classeur fait retomber sur le même repli
  tant que la cause n'est pas corrigée. Exception retirée, le Classeur
  s'affiche de nouveau normalement. 95 tests frontend (4 nouveaux sur
  `ErrorBoundary`, dont un cassé exprès sur le bouton Réessayer pour confirmer
  qu'un test le rattrape), typecheck, lint et build propres.
- **Page d'aide.** La maquette dessinait une troisième rangée « Aide » sans
  contenu défini. Demandé : un mode d'emploi des fonctionnalités moins
  évidentes, plus un contact — pas une FAQ dictée au mot près, donc rédigée à
  partir de ce que le code fait réellement plutôt que d'un script fourni.
  Scan, objectif d'extension, Doubles, notes et date d'ajout modifiables,
  liens de partage, provenance des cotes, appareils connectés — chacun en
  quelques phrases, sans reprendre ce qui s'explique déjà à l'écran au moment
  où ça arrive : un échec de scan dit déjà pourquoi sur place (`CAUSE` dans
  `ui.tsx`), donc la page dit qu'il le fait plutôt que de recopier les quatre
  raisons, qui auraient pu diverger de cette page sans que rien ne le
  signale. Vérifié dans le code plutôt que supposé : `import_prices.py`
  n'écrit des prix que pour `language = 'en'` — les cartes japonaises n'ont
  donc jamais de cote, un fait qui n'était nulle part ailleurs dans l'app et
  qui mérite de l'être puisqu'il surprend. Contact repris du même e-mail que
  Mentions légales.
  Route `/help`, rangée « Aide » ajoutée au Carnet de bord à la suite des
  deux déjà réelles (export, mentions légales) — le commentaire d'en-tête
  d'`Account.tsx`, qui affirmait encore que ces deux-là « ne menaient nulle
  part », était déjà faux avant cette tâche et corrigé au passage.
  Vérifié avec un compte jetable : la rangée mène à la page, le lien mailto
  pointe au bon endroit, contenu rendu sans rien de cassé. Compte et
  invitation supprimés ensuite.
- **Premier lancement.** Vérifié avec un compte tout neuf plutôt que supposé :
  Classeur, Collection et Recherchées avaient déjà chacun un message et un
  bouton d'action pour un état vide (« Classeur vide », « Rien de rangé pour
  le moment », « Aucun avis affiché ») — le problème décrit dans le backlog
  n'existait plus. La seule vraie anomalie : sur un Classeur entièrement vide
  (rien de commencé, aucun objectif fixé), le bouton « Scanner une carte »
  apparaissait deux fois d'affilée, celui du message vide et celui du bas de
  page, l'un sous l'autre sans rien entre les deux. Le second s'efface
  maintenant exactement dans ce cas, et reste dès qu'un intercalaire est
  entamé ou qu'un objectif est fixé — cassé exprès (condition remplacée par
  `true`) pour confirmer qu'un test le rattrape, confirmé, rétabli.
  Vérifié avec un compte jetable : un seul bouton sur un classeur vide, les
  deux reviennent à un état normal (une seule occurrence, pas de « Classeur
  vide ») dès qu'une carte y est rangée. Compte et invitation supprimés
  ensuite.
- **Nom affiché, modifiable après coup.** Déjà proposé (facultatif) à
  l'inscription et déjà accepté par le serveur en PATCH — `ProfileUpdate` avait
  le champ depuis le début, rien ne l'exposait après la création du compte.
  Champ ajouté au Carnet de bord, bouton « Enregistrer » désactivé tant que la
  saisie, une fois les espaces en trop retirés, ne diffère pas du nom déjà en
  place — un nom réduit à des espaces ne compte pas comme un changement, pas
  plus qu'un nom identique renvoyé sans y toucher. Le champ part du nom déjà
  en base, qui pour un compte sans nom choisi est déjà l'avant-arobase de
  l'e-mail (comportement du serveur depuis toujours, à l'inscription). Même
  champ que celui lu par les liens de partage publics (`owner_name` sur
  `SharedCollection`/`SharedWishlist`) — le changer ici change aussi ce qu'un
  lien montre à un inconnu.
  Vérifié avec un compte jetable : champ pré-rempli à l'ouverture, bouton
  désactivé tant que rien ne change, activé après une saisie, valeur relue
  identique après un rechargement complet de la page — donc bien persistée
  côté serveur, pas seulement dans l'état local. Compte et invitation de test
  supprimés ensuite.
- **Appareils connectés.** `refresh_tokens.user_agent` était en base depuis la
  construction des sessions, jamais relu par personne. Une session affichée est
  la ligne encore active d'une famille de jetons — la rotation révoque le jeton
  précédent à chaque renouvellement, donc au plus une ligne par famille n'est
  jamais révoquée à un instant donné, et lister ces lignes revient exactement à
  lister les appareils connectés sans avoir à regrouper par famille soi-même.
  Révoquer une session ne coupe qu'un appareil : la portée est la ligne
  choisie, pas le compte entier, et un test dédié le vérifie en gardant les
  deux jetons de rafraîchissement en main pour prouver que l'autre survit.
  Même garde que `revoke_invite` : un identifiant qui n'appartient pas au
  compte appelant répond 404, jamais un 403 qui confirmerait que la ligne
  existe chez quelqu'un d'autre.
  Le `user_agent` brut est illisible sur un écran censé aider à repérer un
  appareil inconnu — devine « Chrome sur Windows » plutôt que d'afficher la
  chaîne complète, avec les jetons les plus spécifiques testés en premier
  (Edge et CriOS contiennent aussi "Chrome/" et "Safari/"). Aucune bibliothèque
  ajoutée pour ça, une poignée de `includes()`.
  Vérifié avec un vrai compte jetable : inscrit par navigateur, une deuxième
  connexion simulée en curl avec un user-agent iPhone pour obtenir un second
  appareil, la liste affiche bien les deux, « Cet appareil » sur le bon, la
  révocation du second le retire de la liste sans toucher au premier — confirmé
  aussi côté serveur en retentant un rafraîchissement avec l'ancien jeton
  (refusé) puis avec celui de l'appareil resté connecté (accepté). Compte et
  invitation de test supprimés ensuite, base revenue à l'identique.
- **Lien de partage public en lecture seule, collection et recherchées.** Deux
  colonnes en base (`share_collection_token`, `share_wishlist_token`), un jeton
  par ressource plutôt qu'un seul pour le compte — activer l'une n'active jamais
  l'autre. Gardé en clair, pas haché comme un jeton de renouvellement ou un code
  d'invitation : ceux-là sont des secrets à usage unique montrés une fois puis
  jamais revus, celui-ci doit pouvoir être rappelé et raffiché par le compte qui
  l'a créé aussi longtemps que le partage reste actif. Ce que la vue publique
  reçoit n'est pas `CollectionEntry`/`WishlistEntry` mais une forme dédiée,
  volontairement plus étroite : jamais `acquisition_price`, jamais les notes,
  jamais `alert_threshold` — le prix constaté (« vu à ») reste sur les
  recherchées, c'est une information utile à qui regarde le lien, pas une donnée
  privée du compte.
  Trois bugs trouvés en écrivant, tous corrigés avant tout commit :
  1. SQLite refuse `ALTER TABLE ADD COLUMN ... UNIQUE` — l'unicité vit dans un
     index séparé plutôt que dans la colonne.
  2. Cet index ne peut pas non plus vivre dans `schema.sql` : sur une base déjà
     existante, ce script tourne avant que les colonnes soient ajoutées par la
     migration qui suit, donc un index dessus à cet endroit échoue avec
     « no such column » sur la base même qu'il est censé mettre à jour. Déplacé
     dans `db.py`, après l'ajout des colonnes.
  3. Le plus sérieux : `DELETE /collection/share` et `DELETE /wishlist/share`
     étaient masqués par les routes `DELETE /collection/{entry_id}` et
     `DELETE /wishlist/{entry_id}`, déclarées avant elles. Starlette fait
     correspondre le gabarit du chemin avant que FastAPI ne tente de convertir
     `entry_id` en entier — `share` correspond au gabarit `{entry_id}` en premier
     et la vraie route n'est jamais atteinte, avec un 422 silencieux à la place
     d'un 404 propre. Repéré par trois tests qui vérifiaient l'effet réel d'une
     révocation plutôt que le seul code retourné par l'appel. Corrigé en plaçant
     les routes de partage avant les routes paramétrées de même profondeur.
  Vérifié en conditions réelles dans le navigateur, sur les deux ressources :
  lien copié, ouvert dans un onglet sans session, réponse réseau inspectée pour
  confirmer l'absence de `acquisition_price`/`notes`/`alert_threshold`, partage
  désactivé puis lien revisité — « Lien introuvable » dans les deux cas. 173
  tests serveur, 81 tests client, tous verts.
- **Note libre par carte, et date d'acquisition modifiable.** Même migration,
  faites ensemble comme demandé : `collection.notes` (texte libre, comme les
  recherchées) et `date_added` devenu éditable sur l'endpoint qui ne faisait que le
  poser à la création. Le serveur refuse une date dans le futur — pas encore
  possédée est une prétention, pas une correction — et refuse un format qui n'est
  pas une vraie date ISO.
  Piège trouvé en écrivant l'UI : `.t-code` met le texte en capitales, très bien
  pour l'invite « Ajouter une note », faux pour la note une fois écrite par la
  personne — même erreur déjà commise sur la page Légale, cette fois repérée avant
  de la commettre et fixée par un test dédié plutôt qu'un coup d'œil.
  Vérification compliquée par l'environnement du volet navigateur : `blur` et `Tab`
  simulés n'y déclenchaient aucun gestionnaire React, ni sur ce composant ni sur un
  bouton sans rapport (« Retirer un exemplaire », testé sans effet). Plutôt que de
  s'acharner sur un problème d'environnement, la logique a été vérifiée dans jsdom
  via `userEvent.tab()`, qui simule un vrai déplacement de focus — quatre tests,
  cassés exprès un par un (chaîne vide au lieu de `null`, capitales sur la note),
  tous rattrapés puis rétablis.
- **Valeur de la collection dans le temps.** Même graphique que la courbe par
  carte, réutilisé tel quel — `ValuePoint` a la même forme utile que `PricePoint`
  (`captured_at` + un nombre), donc `Collection.tsx` transforme simplement l'un en
  l'autre à l'appel plutôt que de dupliquer le composant. La règle qui compte,
  posée en base : `date_added <= captured_at`. Sans elle, un compte tout neuf
  verrait des mois de « valeur » pour des cartes qu'il ne possédait pas encore —
  chaque relevé de prix compte ce qui est possédé aujourd'hui, mais seulement à
  partir du jour où c'est entré dans le classeur. Cassé exprès pour vérifier qu'un
  seul test le rattrape (celui qui teste exactement cette règle), confirmé, rétabli.
  Ce que la règle ne corrige pas et ne peut pas corriger : rien ne garde trace
  d'une carte revendue ou d'une quantité baissée, donc un point ancien peut
  surestimer ce qui était vraiment détenu ce jour-là. Dit dans le dialogue
  d'explication plutôt que caché. N'apparaît que sous « Tout » — un total agrégé
  sous le filtre « Doubles » afficherait un chiffre qui ne correspond pas à la
  liste juste en dessous. Vérifié avec une carte semée sur trois dates à prix
  connus : les trois valeurs (6,40 €, 7 €, 7,56 €) retrouvées exactes au survol,
  absent sous Doubles comme prévu, base restaurée à l'identique après.
- **Courbe de prix d'une carte sur la fiche.** `GET /cards/{id}/prices` expose enfin
  l'historique complet — jusqu'ici seul le dernier relevé sortait du serveur, jamais
  la série. Graphique construit selon la méthode de charting du projet : une seule
  série dans le temps est une ligne + aire, une seule teinte, celle déjà réservée aux
  chiffres (`--accent-numeral`) — rien de nouveau inventé côté couleur. Aucune
  légende, aucun repère de fin : la cote actuelle est déjà affichée en grand
  au-dessus, la courbe raconte la trajectoire, pas le chiffre une deuxième fois.
  Espacé par le **temps réellement écoulé** entre relevés, pas par leur rang — un
  espacement par index aurait aplati un vrai trou dans les données (l'import ignore
  un cycle plutôt que d'écrire un chiffre périmé) comme si de rien n'était. Survol
  tactile et souris avec repère + infobulle. La géométrie est extraite en fonction
  pure et testée : inversion des axes et espacement par index cassés exprès pour
  confirmer que les tests les rattrapent, tous deux passés au rouge puis rétablis.
  Vérifié sur une vraie carte avec des points semés à prix connus, coordonnées
  calculées à la main et retrouvées exactes dans le DOM. Bug de ma part en cours de
  route : une édition a coupé la classe `Card` en deux dans `models.py` — repéré
  immédiatement par la suite de tests complète (139 → 39 échecs), jamais par le
  nouveau fichier de tests pris seul, qui passait déjà.
- **Doubles.** Sélecteur Tout / Doubles sur `Collection.tsx`, entièrement côté
  client — la collection est déjà chargée en entier pour chaque écran, rien à
  ajouter côté serveur. Deux totaux, décidés par l'utilisateur plutôt que devinés :
  « possédées » compte tous les exemplaires, « échangeables » ne compte que le
  surplus, un exemplaire de chaque restant toujours dans le classeur. Testé en
  cassant le calcul exprès (quantité complète au lieu de quantité − 1) pour confirmer
  que les tests le rattrapent, et vérifié sur une carte semée à 3 exemplaires à prix
  réel : 11,34 € possédées, 7,56 € échangeables.
- **Explication de la page Collection.** Un bouton d'information ouvre le
  fonctionnement de la page — médaillon de quantité, Tout/Doubles, tri, provenance
  des prix. Demandé centré plutôt qu'en feuille : nouveau composant `Dialog`,
  distinct de `Sheet` plutôt qu'une variante dessus, avec la logique commune (Échap,
  verrouillage du défilement, thème) extraite dans un hook partagé pour que les deux
  ne dérivent pas. Vérifié que `Sheet` fonctionne toujours à l'identique ailleurs
  (panneau de filtres de Chercher) après l'extraction.
- **Objectif d'extension.** Un bouton sur la fiche extension (`PackDetail.tsx`) fixe
  quelle extension est l'objectif du Classeur ; il n'apparaît que sur une page dont le
  décompte est réel (`setSize > 0`), pour ne jamais proposer l'action sur l'anomalie
  Promos ci-dessus. En base, `users.goal_pack_code` / `goal_language` avancent
  toujours ensemble — le serveur refuse (422) qu'on envoie l'un sans l'autre, et
  refuse (404) un code qui n'existe pas, sans rien appliquer à moitié.
  Sur le Classeur, l'objectif s'affiche en tête, avant les intercalaires classés
  automatiquement, et sort de cette liste classée pour ne pas s'y répéter. Bug trouvé
  en testant plutôt qu'en lisant : une fois l'objectif la seule extension entamée,
  « Intercalaires en cours » affichait « Classeur vide » juste en dessous d'une carte
  qui montre 1/174 — la condition regardait la liste classée, jamais le vrai total.
  Corrigé : la section s'efface plutôt que de contredire ce qui est déjà affiché.
  Vérifié avec un compte à deux extensions actives : chacune n'apparaît qu'une fois,
  ni dans les deux endroits ni nulle part.
- **Bouton « voir le mot de passe »** sur l'écran de connexion et d'inscription (un
  seul composant gère les deux modes). `type="button"` pour ne jamais soumettre le
  formulaire par erreur, état retenu par carte non requis puisqu'il s'agit d'une
  bascule d'affichage, pas d'une préférence.
- **Vue « manquantes » par extension, avec tri par avancement.** La vue existait déjà
  (`PackDetail.tsx`, filtre « Manquantes » côté serveur) — ce qui manquait vraiment
  était le tri « Presque finies » sur l'écran Extensions. Les extensions déjà
  terminées coulent en bas plutôt qu'en tête : trier par simple ratio décroissant
  aurait mis le 100 % avant le 95 %, l'inverse de la question posée. Tri et famille
  sont retenus le temps de la session (variable de module, comme `Search.tsx`) : sans
  ça, ouvrir une extension puis revenir remettait tout à zéro, exactement au moment où
  le tri sert. Le contrôle est épinglé hors du bandeau de familles qui défile, pour
  rester atteignable quand une cinquième famille apparaîtra.
- **Tout envoyer aux recherchées en un geste.** `POST /wishlist/bulk` plutôt qu'une
  boucle de 150 appels sur `POST /wishlist` : ce dernier traite un ré-ajout comme une
  édition et aurait écrasé silencieusement la priorité, le prix et les notes déjà
  saisis sur les cartes déjà listées. Le nouvel endpoint n'insère jamais par-dessus
  une ligne existante, et répond `manquantes / ajoutées / déjà présentes` pour que le
  message affiché ne mente jamais — vérifié avec une carte témoin (priorité, prix,
  note) qui ressort intacte après l'appel, et un second appui qui annonce correctement
  n'avoir rien ajouté.
- **Mentions légales.** La rangée que la maquette dessinait et qui ne menait nulle
  part mène maintenant à `/legal`, joignable **sans compte** : l'écran de connexion est
  la seule page que le public voit, et une mention légale qui exige un compte n'en est
  pas une. Le routeur enveloppe donc les deux états.
  Rien n'y est copié d'un modèle : ce que le schéma garde vraiment, le fait que le scan
  décode l'image en mémoire sans jamais l'écrire, le vrai nom du cookie et ses vrais
  attributs, et les 30 jours de rétention des sauvegardes — parce que la suppression
  est immédiate en base et pas dans les sauvegardes, et le taire aurait été faux.
  En l'écrivant j'ai trouvé un défaut : `search_history` n'avait pas de clé étrangère,
  donc supprimer un compte laissait ses recherches derrière. Corrigé avant d'écrire la
  phrase qui prétendait le contraire, avec un test qui compte les lignes des quatre
  tables avant et après.
- **Le vrai logo.** Le soleil qui se lève sur la mer, cinq cartes en éventail pour
  rayons — un classeur qui se remplit est un soleil qui monte. Dessiné par le designer
  d'après `renfonte-ui/BRIEF-LOGO.md`, posé en `icon.svg` (512, plein bord) et
  `favicon.svg` (64, coins arrondis). Le favicon n'est pas le grand réduit : à 16 px le
  trait d'horizon tombe à un demi-pixel et sort gris-olive, il est épaissi et un des
  deux reflets saute. Les cinq cartes, elles, passent la réduction sans retouche —
  vérifié en rastérisant à 16 et 32 px, pas supposé. Les trois PNG sont désormais
  générés par `frontend/scripts/make_icons.py` au lieu d'être faits à la main.
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
- **Refonte « L'Horizon » : la fiche carte et le compte**, les deux derniers écrans.
  Fiche carte : le compteur de quantité devient le seul contrôle en grand et reste
  affiché même à zéro — ajouter une carte était un menu déroulant plus un bouton,
  c'est-à-dire le geste le plus fréquent rendu le plus lourd. Le sélecteur d'état
  descend sous le compteur et n'apparaît qu'une fois la carte possédée ; il est
  désormais modifiable après coup, sinon le retirer du bouton d'ajout aurait fait
  perdre la fonction. Halo réservé aux Secret Rare, ligne « Couleur », retour en
  toutes lettres.
  Compte : titré « Carnet de bord » avec l'e-mail au-dessus, ligne d'explication sous
  l'édition par défaut, export en rangée. Les deux autres rangées de la maquette
  (mentions légales, aide) restent dehors tant qu'elles ne mènent nulle part.
- **Valeur estimée de la collection.** Cardmarket et TCGplayer refusent tous les deux
  les nouvelles demandes d'API — ce n'est pas une question de profil, Cardmarket écrit
  noir sur blanc « we are not accepting applications ». Les prix viennent donc de
  tcgcsv.com (miroir quotidien de TCGplayer, sans clé), convertis en euros au taux BCE
  du jour. `import_prices.py`, à lancer sur le serveur, tous les 3 jours (cron dans le
  README). Rien ne casse s'il ne tourne pas : les prix restent figés au dernier relevé.
  Ce sont des prix **américains**, pas Cardmarket, et l'écran le dit. Les tirages
  alternatifs ne sont cotés que si les deux sources sont d'accord sur leur nombre :
  un alt art vaut ~30× la carte normale, un mauvais appariement fausserait tout.
  ~92 % des cartes de base sont cotées.
  **Cote affichée carte par carte**, sous le nom sur la fiche. Le premier jet ne
  sortait que le total sur le compte : le prix existait en base et ne se voyait nulle
  part. Quand il n'y a pas de cote, la fiche dit laquelle des deux raisons s'applique
  — un blanc se lit comme une fonction cassée, c'est exactement ce qui s'est passé.
- **Prix d'achat sur la fiche carte** + **total dépensé** sur le carnet de bord. Le
  backend (colonne, endpoints, `acquisition_total` dans `/collection/stats`) existait
  déjà sans UI dessus. Ajoutés : le champ sur la fiche carte (même geste que le prix des
  recherchées, saisi à la main), et le total sur le compte, affiché seulement s'il y a
  quelque chose à montrer.

---

## Déjà connu, plus ancien

- Réinitialisation de mot de passe (demande un SMTP)
- Alertes de seuil (brancher `alert_threshold`, resté mort en base). Passée le
  2026-08-16 dans la liste V1 — pastille dans l'app en attendant un SMTP restait
  possible sans e-mail, mais écartée quand même à ce stade.
- Plus fortes variations de la semaine (collection et recherchées). Passée le
  2026-08-16, aucun blocage particulier, juste écartée pour l'instant.
- Plus-value par carte (prix payé contre cote actuelle). Passée le 2026-08-16,
  même sort, aucun blocage particulier.
- Numéro de version et journal des changements, dans le Carnet de bord. Passée
  le 2026-08-16, aucun blocage particulier, juste écartée pour l'instant.
- Scan hors ligne
- **Build iOS natif** — bloqué par macOS, et payant pour installer sur un vrai
  iPhone (99 €/an). L'app s'installe désormais depuis Safari, ce qui couvre les deux
  seules raisons d'être natif : `getUserMedia` fait tourner le scan, et le jeton de
  renouvellement est déjà dans un cookie httpOnly côté web. À rouvrir seulement si
  quelque chose manque à l'usage.
- Renommer le dépôt et les dossiers `MyTGC` → `MyTCG`
