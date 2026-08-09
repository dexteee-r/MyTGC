# Reconnaissance de cartes en mobile — état de l'art et décision

Recherche demandée avant d'écrire quoi que ce soit sur le scan. Conclusion en tête :
**l'algorithme actuel est le bon et il ne faut pas le remplacer.** Ce qui mérite du
travail est ailleurs, et le détail est plus bas.

---

## Ce que fait MyTCG aujourd'hui, mesuré

| | |
|---|---|
| Détection | OpenCV, Canny + score de contour (forme, centrage, taille, rectangularité), puis redressement perspectif en 600×838 |
| Empreinte | pHash calculé **séparément sur R, G et B**, 192 bits, distance de Hamming |
| Recadrage | `ART_BOX` sur l'illustration haute, pour sortir le filigrane `SAMPLE` du champ |
| Seuil | distance max 52, marge de confiance 12 — calibrés sur photos réelles |
| Où | entièrement côté serveur |
| Latence mesurée | **médiane 122 ms** aller-retour, sur 8 scans en local (min 117, max 157) |
| Poids envoyé | ~3 Mo par photo brute, ~250 Ko par image de flux (1100 px, JPEG q82) |
| Réponse | 885 octets |
| Index | 9 447 cartes hachées, **332 Ko bruts** |

Résultat du gate : 100 % de détection, 75 % d'exactitude sur le numéro, **0 mauvaise
réponse**. Les bonnes identifications tombent entre 14 et 50 de distance, les mauvaises
entre 58 et 62, sans recouvrement.

---

## Ce que fait le reste du monde

### Le pHash par canal de couleur est l'état de l'art amateur, et il est bien choisi

Les implémentations publiques sérieuses de reconnaissance de cartes convergent toutes
sur la même chose : détection par contours + transformation perspective + hachage
perceptuel comparé en distance de Hamming. Le
[détecteur MTG de T. Mikonen](https://tmikonen.github.io/quantitatively/2020-01-01-magic-card-detector/)
normalise en CLAHE, segmente par seuillage, redresse en quadrilatère, puis compare des
pHash pré-calculés — et retient une identification quand la plus petite distance est à
plus de quatre écarts-types sous la moyenne. C'est exactement notre pipeline, avec un
critère statistique là où nous avons un seuil calibré.

Le raffinement par canal que nous utilisons est documenté comme un vrai gain :
[Alexander Miles](https://www.alexander-miles.com/?p=507) rapporte que concaténer un
pHash par canal R, G et B apporte « une amélioration nette sur l'ensemble du corpus »
par rapport au hachage en niveaux de gris, précisément parce qu'il sépare des cartes de
mise en page identique et de couleur différente — le cas One Piece par excellence, où
six couleurs structurent tout le jeu.

### Un réseau de neurones n'apporte presque rien de plus

Le point le plus utile de la recherche, et le plus contre-intuitif : les travaux
publiés sur le sujet rapportent qu'**un réseau de neurones combiné au pHash n'améliore
pas significativement les résultats par rapport au pHash seul**
([Moss Machines](https://kairicollections.github.io/Moss-Machines-Magic-the-Gathering-sorting/)).
La raison est simple : le problème n'est pas la reconnaissance mais la segmentation. Une
carte correctement détourée est triviale à identifier ; une carte mal détourée est
perdue quelle que soit la méthode qui suit.

### Les faiblesses connues du pHash sont les nôtres

Deux, et elles sont documentées partout :

**La sensibilité au cadrage.** Trop de bordure ou pas assez dans le candidat segmenté et
la comparaison échoue. C'est le mode d'échec dominant, plus que l'éclairage.

**La lumière faible.** Quand l'éclairage est mauvais, la distance ne suffit plus à
départager, et les erreurs rapportées sont des confusions entre cartes qui n'ont rien à
voir. C'est le cas que notre marge de confiance de 12 attrape : plutôt que de se
tromper, on refuse.

### Les systèmes commerciaux sont dans le nuage, et pas plus rapides

[Ximilar](https://www.ximilar.com/blog/build-your-own-trading-card-game-identifier-with-our-api/),
qui couvre One Piece parmi d'autres jeux, tourne en API REST, annonce « environ une
seconde » par image et renvoie en plus des attributs — holographique ou non, alphabet
utilisé. Nos 122 ms locales sont huit fois plus rapides. Pour du scan en rafale, notre
architecture est meilleure que la leur, à condition de rester sur le réseau local ou un
tunnel court.

### ORB / SIFT : rotation-invariants, mais résolvent un problème qu'on n'a pas

L'appariement de points d'intérêt (ORB, SIFT, SURF) est cité pour sa robustesse à la
rotation et à l'échelle. Notre transformation perspective rend déjà le candidat
canonique en 600×838 : la rotation est absorbée avant le hachage. Payer un appariement
de descripteurs sur 9 447 références pour une invariance qu'on obtient gratuitement
serait un mauvais échange.

---

## Le mobile : embarqué ou serveur ?

C'est la vraie question, et elle est plus ouverte que celle de l'algorithme.

### Ce qui est possible aujourd'hui

- **ONNX Runtime via Capacitor** existe comme plugin, avec chargement de modèle,
  préparation d'image et inférence de tenseurs sur `.onnx`.
- **TensorFlow Lite** est le chemin Android, **Core ML** le chemin iOS, et
  [ONNX est le seul qui évite de choisir un écosystème](https://booleaninc.com/blog/mobile-ai-frameworks-onnx-coreml-tensorflow-lite/).
- **OpenCV.js en WebAssembly** tourne dans le navigateur : environ **2× plus rapide que
  asm.js et 20× plus rapide que du JavaScript pur**. Mais les mesures sur mobile sont
  très dispersées — un même navigateur peut être **3× plus lent** d'un téléphone à
  l'autre, et la phase de détection tourne entre **3 Hz et 12 Hz** selon l'appareil.

### Le fait qui change la discussion

**L'index tient dans 332 Ko.** 9 447 cartes × 24 octets de hachage plus l'identifiant.
Comprimé, moins de 300 Ko — l'équivalent d'**une seule illustration de carte**.

Autrement dit, la recherche n'est pas le problème : une table de 9 447 entrées comparée
en XOR + popcount se parcourt en quelques millisecondes sur n'importe quel téléphone. Ce
qui coûte, c'est **détecter et redresser la carte**, pas la retrouver.

Ça inverse la façon de poser la question. Il ne s'agit pas de « porter la
reconnaissance sur mobile » — il s'agit de décider où tourne OpenCV.

### Les trois architectures possibles

**A — Tout serveur (aujourd'hui).** 122 ms, aucun code à maintenir en double, une seule
vérité sur le seuil et le pipeline. Coût : chaque image de flux part sur le réseau, et
il n'y a pas de scan hors ligne. C'est ce que `PROJECT_CONTEXT.md` §3 a acté.

**B — Détection embarquée, reconnaissance serveur.** Le téléphone détecte le
quadrilatère et n'envoie que le rectangle redressé de 600×838 — quelques dizaines de Ko
au lieu de 250. Surtout, il **n'envoie rien du tout quand il n'y a pas de carte dans le
cadre**, ce qui est la majorité des images d'une session de scan en continu. Gain réel
sur la batterie, le réseau et la charge du N95, sans dupliquer la reconnaissance.

**C — Tout embarqué.** Scan hors ligne, latence nulle. Coût : un second pipeline de
détection et de hachage à maintenir en parallèle du Python, avec le risque que les deux
divergent — et une divergence de hachage ne se voit pas, elle se traduit juste par des
identifications qui ratent. Plus la synchronisation de l'index à chaque nouvelle
extension.

### Recommandation

**B, et pas maintenant.** L'architecture A fonctionne et donne 0 mauvaise réponse ; la
remplacer serait une régression de risque pour un gain que personne n'a demandé. B est
la bonne cible quand le scan hors ligne remontera dans les priorités, et il se construit
sans toucher à la reconnaissance.

Si B se fait un jour, le chemin est OpenCV.js en WASM côté client pour la seule
détection, avec repli sur l'envoi de l'image brute quand le WASM n'est pas disponible ou
que l'appareil est trop lent — mesurable, puisque la détection donne son propre temps.

---

## Ce qui mériterait du travail avant tout ça

Par ordre de gain réel, et aucun ne demande de changer d'algorithme.

**1. Ne pas envoyer les images sans carte.** Aujourd'hui le scanner en continu envoie
une image toutes les 1,2 s dès que la vue est stable, qu'il y ait une carte devant
l'objectif ou pas. Un test de contour grossier côté client couperait la majorité des
requêtes inutiles. C'est le point B en version minimale, et le moins cher.

**2. Dire pourquoi ça a raté.** `ScanMiss` gère déjà cinq causes dans l'interface mais
le serveur n'en renvoie qu'une : détecté ou pas. Le pipeline sait plus que ça — netteté
du contour, variance de luminance, saturation des hautes lumières. Renvoyer `light`,
`blur` ou `glare` transformerait un échec muet en consigne. C'est du travail de backend,
pas de vision.

**3. Le filigrane, encore.** `ART_BOX` sort le `SAMPLE` du champ. Vérifier qu'il est
bien calibré sur les cartes récentes, dont la mise en page a bougé.

**4. Rien ne réglera l'édition.** Une carte japonaise et sa version internationale ont
la même illustration : aucune technologie de reconnaissance visuelle ne peut les
distinguer, et Ximilar lui-même renvoie l'alphabet comme un attribut séparé plutôt que
comme une identification. Le sélecteur d'édition explicite reste la seule réponse
correcte. C'est déjà ce que fait l'app, et il ne faut pas essayer de « faire mieux ».

---

## Sources

- [Magic Card Detector — T. Mikonen](https://tmikonen.github.io/quantitatively/2020-01-01-magic-card-detector/)
- [Recognizing Cards – Effective Comparisons with Hashing — Alexander Miles](https://www.alexander-miles.com/?p=507)
- [Moss Machines — MTG sorting & recognition](https://kairicollections.github.io/Moss-Machines-Magic-the-Gathering-sorting/)
- [tcg-scanner — tranhd95](https://github.com/tranhd95/tcg-scanner)
- [Build Your Own TCG Identifier — Ximilar](https://www.ximilar.com/blog/build-your-own-trading-card-game-identifier-with-our-api/)
- [Mobile AI Frameworks in 2025: ONNX to CoreML & TensorFlow Lite](https://booleaninc.com/blog/mobile-ai-frameworks-onnx-coreml-tensorflow-lite/)
- [OpenCV.js in Action: Live Webcam Filters and Effects](https://opencv.org/blog/opencv-js-real-time-webcam-filters/)
- [Measuring OpenCV.js performance with Wasm execution](https://sedici.unlp.edu.ar/bitstream/handle/10915/89186/Documento_completo.pdf-PDFA.pdf?sequence=1&isAllowed=y)
- [Efficient Pose Tracking from Natural Features in Standard Web Browsers](https://arxiv.org/pdf/1804.08424)
