# Récupérer les dernières cartes sorties

Guide pour faire apparaître une nouvelle extension (booster, deck de départ, EB, PRB)
dans l'app, sans aide. Rien ne le fait tout seul : contrairement aux prix, le catalogue
n'a pas de timer. Tant que tu ne lances pas ces étapes, la nouvelle extension n'existe
ni dans la recherche ni dans le scan.

Il y a **deux bases séparées** : celle de ton PC (dev) et celle du serveur (prod). Chaque
étape se refait aux deux endroits.

Les commandes détaillées de la prod sont dans `deploy/README.md`, section « Catalogue
updates ». Ce guide est le chemin court, dans l'ordre.

---

## Avant de commencer : la source a-t-elle les cartes ?

Les cartes viennent du dépôt `punk-records` (communauté). Il est parfois en retard de
quelques jours sur une sortie. Vérifie d'abord :

```bash
cd backend/data/punk-records
git pull
git log -1 --date=short --format="%ad %s"
```

Si le dernier commit date d'avant la sortie, attends : relancer le pipeline ne ferait
rien. Pour les cartes **DON!!**, la source est autre (optcgapi.com), voir l'étape 4.

## 1. Dev (ton PC)

Depuis la racine du dépôt :

```bash
cd backend/data/punk-records && git pull && cd ../../..
py backend/scripts/import_catalogue.py
py backend/scripts/import_don_cards.py
py backend/scripts/download_images.py --workers 8
py backend/scripts/compute_phashes.py --region art --all
```

L'ordre compte : le catalogue d'abord, les DON!! ensuite (elles se rattachent aux
extensions déjà en base), puis les images, puis les empreintes de scan.

Si `backend/data/punk-records` n'existe pas :

```bash
git clone --depth 1 https://github.com/buhbbl/punk-records.git backend/data/punk-records
```

Puis **redémarre l'API de dev** : le scan charge le catalogue une seule fois au
démarrage.

## 2. Date de sortie (dans le code, à committer)

`import_catalogue.py` ne connaît pas les dates de sortie. Sans elle, la nouvelle
extension n'est pas bien triée par date. Ajoute-la dans
`backend/app/release_dates.py`, dans le bloc anglais « Booster Packs » :

```python
"569117": "2026-08-28",   # exemple : OP-17
```

La clé est l'identifiant `pack_id` de punk-records (pas le code `OP-17`). Pour le
trouver, regarde ce que le script a importé :

```bash
py -c "import sqlite3;c=sqlite3.connect('backend/data/mytcg.db');print(c.execute(\"select pack_id,pack_code,language from cards where release_date is null group by pack_id\").fetchall())"
```

Ne devine pas une date : laisse-la de côté si elle n'est pas confirmée (c'est ce qui a
été fait pour la date japonaise d'OP-17).

Ensuite : commit, push sur `main`. Le serveur récupère le code tout seul en 5 minutes
(attends que la CI soit verte).

## 3. Prod (le serveur)

À faire **après** le déploiement du code de l'étape 2. En SSH sur la machine :

```bash
sudo -u mytcg bash -c '
export MYTCG_DATA_DIR=/var/lib/mytcg
if [ -d "$MYTCG_DATA_DIR/punk-records" ]; then
  cd "$MYTCG_DATA_DIR/punk-records" && git pull
else
  git clone --depth 1 https://github.com/buhbbl/punk-records.git "$MYTCG_DATA_DIR/punk-records"
fi
cd /opt/mytcg/app
.venv/bin/python backend/scripts/import_catalogue.py
.venv/bin/python backend/scripts/import_don_cards.py
.venv/bin/python backend/scripts/download_images.py --workers 8
.venv/bin/python backend/scripts/compute_phashes.py --region art --all
'
sudo systemctl restart mytcg-api
```

Pièges déjà rencontrés :
- **Ne fais pas `source /etc/mytcg/mytcg.env`** : le fichier a déjà eu des fins de ligne
  Windows qui cassent le shell. `MYTCG_DATA_DIR` posé à la main suffit.
- **Ne l'oublie jamais** : sans `MYTCG_DATA_DIR`, le script écrit dans une base vide à
  l'intérieur du dépôt et affiche quand même un message de succès.
- Le dossier `punk-records` peut ne pas exister sur le serveur : c'est normal, le `else`
  ci-dessus le clone.
- **Le redémarrage est obligatoire** (`systemctl restart mytcg-api`).

## 4. Cartes DON!! seulement

`punk-records` n'a aucune carte DON!!. Elles viennent d'optcgapi.com, en anglais
seulement. Si seules des DON!! ont changé, inutile de refaire le catalogue :

```bash
py backend/scripts/import_don_cards.py
py backend/scripts/download_images.py --workers 8
py backend/scripts/compute_phashes.py --region art --all
```

(sur le serveur, mêmes commandes avec le préfixe de l'étape 3, puis le restart).
DON-011 n'a pas d'image et n'en aura pas : la source n'en fournit pas.

## 5. Vérifier que ça a marché

Sur `/health` (en dev `http://localhost:8000/health`, en prod le même chemin sur le
domaine de l'app ; l'accès direct au serveur est restreint par une ACL Nginx) :
- `catalogue` : le décompte du dernier import `punk-records` seulement. **Il ne compte
  pas les DON!!**, donc il restera 187 en dessous du total. Ce n'est pas un bug.
- `cards_total` : le vrai nombre de cartes en base, par langue. C'est lui qui doit monter
  du nombre de cartes de la nouvelle extension.
- `hashed_cards` : doit rattraper `cards_total`. Sinon, `compute_phashes.py` n'a pas fini.

Puis dans l'app : la nouvelle extension apparaît sur Extensions, et une de ses cartes
est trouvable sur Chercher avec son image.

## 6. Les prix

Rien à faire à la main. Les timers de prix (`mytcg-prices` pour l'anglais,
`mytcg-prices-jp` pour le japonais) tournent tous les 3 jours. Les cartes de la nouvelle
extension auront un prix au passage suivant, souvent un peu plus tard après la sortie
(TCGplayer et yuyu-tei doivent d'abord les lister).

---

## Si quelque chose cloche

| Symptôme | Cause probable |
|---|---|
| Extension absente après l'import | `punk-records` pas encore à jour, refais `git pull` plus tard |
| Cartes présentes mais sans image | `download_images.py` a échoué en partie, relance-le (il reprend où il s'est arrêté) |
| Cartes visibles mais le scan ne les trouve pas | `compute_phashes.py` pas lancé, ou API pas redémarrée |
| Prod à l'ancien total après l'import | API pas redémarrée, ou import fait sans `MYTCG_DATA_DIR` |
| Extension mal placée dans le tri par date | Date manquante dans `release_dates.py` |
| `/health.catalogue` ne bouge pas après un import DON!! seul | Normal, voir l'étape 5 |
