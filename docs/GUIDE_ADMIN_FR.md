# Guide d’administration — Cook for Friends

**Version :** 1.0 (brouillon pour révision du client) · **Dernière mise à jour :** 2026-11-10

Ce guide s’adresse à l’équipe de Cook for Friends. Il explique, étape par étape, comment gérer les cours, les séances, les clients et les réglages du site **sans l’aide d’un développeur**. Aucune connaissance technique n’est nécessaire.

**Règle d’or :** tout se gère dans l’administration du site (`/admin`). Vous n’avez **jamais** besoin d’ouvrir Stripe pour gérer vos cours, vos prix ou vos remboursements (voir la section 16).

## Table des matières

1. Premiers pas
2. Cours
3. Séances (cours en personne)
4. Leçons, matériel et vidéo
5. Codes promo
6. Crédits
7. Participants
8. Annulations et remboursements
9. Liste d’attente
10. Commentaires
11. Commandes et reçus
12. Réglages du site
13. Pages et blocs
14. Courriels automatiques
15. Certificats
16. Ce qu’il ne faut jamais faire dans Stripe, dépannage et FAQ
17. Glossaire

> **Menu de gauche.** L'administration est rangée en cinq groupes : **Catalogue**, **Ventes**, **Clients**, **Apprentissage** et **Paramètres**. Chaque section ci-dessous indique où trouver l’écran.

---

## 1. Premiers pas

### Se connecter
1. Ouvrez l’adresse de l’administration de votre site, suivie de `/admin`.
2. Entrez votre courriel et votre mot de passe.
3. Pour vous déconnecter, utilisez le menu de votre compte en bas du menu de gauche.

Les clients n’ont pas accès à l’administration : ils utilisent leur propre espace « Mon compte ».

### Rôles : Administrateur et Personnel
Dans **Paramètres → Personnel**, chaque personne a un **Rôle** :

| Rôle | Ce que la personne peut faire |
|---|---|
| **Administrateur** | Tout, y compris modifier les réglages du site, la politique d’annulation, créer des comptes du personnel et supprimer des éléments. |
| **Personnel** | Gérer les cours, séances, leçons, codes promo, participants, commentaires et présences. Ne peut pas modifier la politique d’annulation ni les réglages du site. |

Seul un administrateur peut créer un compte du personnel ou changer un rôle.

### Changer la langue de l’interface
Cliquez sur votre compte (en bas du menu de gauche), puis choisissez la **langue** (français ou anglais). Cela ne change que l’affichage de l’administration, pas le site public.

### Langue du contenu (français et anglais)
Les textes du site existent en deux langues. Les champs traduisibles (titre, résumé, description, etc.) ont un sélecteur de langue en haut de l’écran de modification.

1. Remplissez **d’abord le français** (langue par défaut).
2. Passez à l’anglais avec le sélecteur de langue et remplissez les mêmes champs.
3. Si un champ anglais est laissé vide, le site affiche automatiquement le texte français à la place. Rien ne casse, mais la page anglaise sera en français.

> N'oubliez pas d’enregistrer avant de changer de langue de contenu.

---

## 2. Cours

**Où :** Catalogue → Cours.

### Créer un cours
1. Cliquez sur **Créer**.
2. Remplissez les champs ci-dessous, puis enregistrez.

| Champ | À quoi il sert |
|---|---|
| **Titre** (obligatoire) | Le nom du cours, tel qu’affiché sur le site. |
| **Format** (obligatoire) | **En personne** (avec des séances à des dates précises) ou **En ligne** (avec des leçons accessibles après l’achat). |
| **Résumé** | Une ou deux phrases pour la liste des cours. |
| **Description** | Le texte complet de la page du cours. |
| **Niveau** | **Débutant**, **Intermédiaire** ou **Avancé**. |
| **Durée (minutes)** | Durée totale indiquée sur la page. |
| **Prix (cents, taxes en sus)** | Le prix **avant taxes**, voir l’encadré ci-dessous. |
| **Image principale** | La photo de couverture. |
| **Galerie** | Photos supplémentaires. |
| **Leçons (ordonnées)** | Cours **en ligne** seulement : les leçons, dans l’ordre d’affichage. |
| **Matériel** | Fichiers (recettes, PDF) rattachés au cours. |
| **Certificat de réussite** | Cochez pour émettre un certificat à la fin (cours en ligne, voir la section 15). |
| **SEO** | Titre, description et image utilisés par Google et lors des partages sur les réseaux. Facultatif mais recommandé. |
| **Statut** | Voir « Brouillon, publié, archivé » ci-dessous. |

> **Attention au prix.** Le champ **Prix (cents, taxes en sus)** se saisit **en cents**, et non en dollars. Exemples : 4 500 = 45,00 $ ; 12 000 = 120,00 $. Dans la liste des cours, le montant s’affiche en dollars pour que vous puissiez vérifier. Le prix est toujours **avant taxes** : la TPS et la TVQ sont ajoutées au paiement.

### Brouillon, publié, archivé
- **Brouillon** : le cours n’est pas visible sur le site. Utilisez cet état pour préparer le cours.
- **Publié** : le cours est visible et peut être acheté.
- **Archivé** : le cours est retiré du site, mais son historique (commandes, participants) est conservé. Pour retirer un cours, **archivez-le** plutôt que de le supprimer.

Les cours ont aussi un système de versions : vous pouvez enregistrer un brouillon de vos changements sans toucher à la version publiée, puis publier quand vous êtes prêt.

### Synchronisation automatique avec Stripe
Quand vous publiez un cours ou que vous changez son **Titre**, son **Résumé**, son **Prix** ou son **Statut**, le site met à jour automatiquement Stripe (le service de paiement). Vous n’avez rien à faire.

Dans la colonne de droite d’un cours, le champ **Stripe Sync Status** (affiché en anglais ; champ technique : `stripeSyncStatus`) indique l’état. Un second champ, **Stripe Sync Error**, contient le message d’erreur :

| État affiché | Signification | Quoi faire |
|---|---|---|
| **En attente** | La mise à jour est en cours (quelques minutes au plus). | Patientez, puis rechargez la page. |
| **Synchronisé** | Tout est à jour. Le cours peut être acheté. | Rien. |
| **Erreur** | La mise à jour a échoué. Un message explique la cause dans **Stripe Sync Error**. | 1) Ouvrez le cours et cliquez sur **Enregistrer** de nouveau (cela relance la synchronisation). 2) Attendez quelques minutes et rechargez. 3) Si l’erreur revient, contactez le développeur en lui transmettant le message d’erreur. |

> **Ne modifiez jamais le prix dans Stripe.** Le prix est géré uniquement ici. Un prix changé directement dans Stripe sera ignoré, voire écrasé, et créera de la confusion.

> **Les achats déjà faits ne changent pas.** Si vous modifiez un prix, seules les nouvelles commandes utilisent le nouveau prix.

---

## 3. Séances (cours en personne)

**Où :** Catalogue → Séances. Une séance est une date précise d’un cours **en personne**.

### Créer une séance
1. Cliquez sur **Créer**.
2. Choisissez le **Cours**. Seuls les cours **en personne** sont acceptés.
3. Indiquez le **Début** et la **Fin** (la fin doit être après le début). Les heures sont celles de **Montréal** (fuseau de l’Est) ; le site gère lui-même l’heure d’été.
4. Remplissez le **Lieu** : nom, adresse, ville, code postal et lien de carte (facultatif).
5. Au besoin, choisissez un **Niveau (remplace celui du cours)**.
6. Indiquez la **Capacité** : le nombre maximal de places (minimum 1).
7. Ajoutez des **Notes** si nécessaire (apportez un tablier, allergies, etc.).
8. Enregistrez. Le **Statut** est **Planifiée** par défaut.

### Places restantes
Au bas de l’écran d’une séance, la section **Participants** (section 7) affiche :
- **Capacité** : le total des places ;
- **Confirmés** : les places payées ;
- **Réservations en cours** : les places retenues pendant qu’un client paie (voir « place retenue » au glossaire) ;
- **Disponibles** : ce qu’il reste à vendre.

Une place retenue est libérée automatiquement si le client ne paie pas dans le délai (voir la section 12).

### Statuts d’une séance
**Planifiée**, **Annulée**, **Terminée**.

### Annuler une séance
Si vous devez annuler une date entière :
1. Ouvrez la séance et passez le **Statut** à **Annulée**, puis enregistrez.
2. Pour chaque participant, un remboursement doit être traité. **Voir « À vérifier » à la fin de ce guide** : le changement de statut ne rembourse pas, à ce jour, automatiquement les participants ni ne les avise.

---

## 4. Leçons, matériel et vidéo

**Où :** Catalogue → Leçons et Catalogue → Matériel. Les leçons servent aux cours **en ligne**.

### Créer une leçon
1. Catalogue → Leçons → **Créer**.
2. Choisissez le **Cours** (en ligne).
3. Indiquez le **Titre** (obligatoire) et l’**Ordre** (0, 1, 2… : la plus petite valeur apparaît en premier).
4. Rédigez le **Contenu** (texte de la leçon).
5. Ajoutez du **Matériel** si besoin.
6. Enregistrez. Ensuite, ouvrez le cours et ajoutez la leçon dans **Leçons (ordonnées)**.

### Ajouter une vidéo
Dans la leçon, le bloc **Vidéo** gère le téléversement.

1. **Enregistrez d’abord la leçon.** Sinon, le message « Enregistrez la leçon avant de téléverser une vidéo. » s’affiche.
2. Cliquez sur **Téléverser** et choisissez le fichier vidéo.
3. Une barre de **progression** s’affiche (« Téléversement »). Ne fermez pas la page pendant ce temps.
4. Le statut passe ensuite à **En préparation** (« Traitement en cours, la page se met à jour automatiquement »), puis à **Prête**.

| Statut | Signification |
|---|---|
| **Aucune vidéo** | Rien n’a été téléversé. |
| **En préparation** | La vidéo est en cours de traitement. |
| **Prête** | La vidéo est disponible. La **Durée** s’affiche. |
| **En erreur** | Le traitement a échoué : cliquez sur **Remplacer** et téléversez de nouveau. |

- **Remplacer** : téléverse une nouvelle vidéo à la place de l’ancienne.
- **Prévisualiser** : génère un lien de lecture temporaire pour vérifier la vidéo avant de publier (le message indique son heure d’expiration ; cliquez sur **Ouvrir**).
- Si le message « Aucun fournisseur vidéo n’est configuré. » apparaît, contactez le développeur.

> **Note sur la vidéo.** Tant que le compte du service vidéo (Mux) n’est pas relié, le site utilise un mode de **démonstration** : les vidéos ne sont pas de vraies vidéos de production. La mise en service de la vidéo réelle est une décision du client encore ouverte (voir « Décisions ouvertes »).

### Matériel (PDF, recettes)
Catalogue → Matériel → **Créer** : **Titre**, **Fichier** (obligatoire), **Type** (**Recette**, **PDF** ou **Autre**) et **Langue du fichier** (Français ou English). Rattachez ensuite le matériel à un cours ou à une leçon via le champ **Matériel**. Seuls les clients ayant accès au cours peuvent télécharger ces fichiers.

### Leçons d’aperçu
Cochez **Aperçu gratuit** sur une leçon pour la rendre visible à tout client **connecté**, même sans achat. Il n’existe pas d’aperçu pour les visiteurs non connectés (ils doivent d’abord créer un compte).

---

## 5. Codes promo

**Où :** Ventes → Codes promo.

### Créer un code
1. Cliquez sur **Créer**.
2. Remplissez les champs :

| Champ | Explication |
|---|---|
| **Code** | Ce que le client tape (ex. : BIENVENUE10). Chaque code est unique. |
| **Kind** (type) | **Pourcentage** ou **Montant (cents)**. |
| **Value** (valeur) | Pour un pourcentage : de 1 à 100. Pour un montant : en **cents** (500 = 5,00 $). |
| **Max Redemptions** (limite d’utilisation) | Nombre total d’utilisations permises. Vide = illimité. |
| **Expires At** (expiration) | Date limite. Vide = n’expire pas. |
| **Applies To** (s’applique à) | Les cours visés. Vide = tous les cours. |
| **Active** (actif) | Décochez pour désactiver le code sans le supprimer. |

> Les noms de ces champs s’affichent pour l’instant en anglais dans l’administration. Les équivalents français sont indiqués entre parenthèses.

3. Enregistrez. Le code est transmis automatiquement à Stripe ; les champs `stripeCouponId` et `stripePromotionCodeId` à droite sont remplis par le système, ne les modifiez pas.

### Désactiver un code
Ouvrez le code, décochez **Active** et enregistrez. Les commandes passées ne sont pas touchées.

### Codes à 100 %
Un code de **100 %** est permis : la commande est alors à 0 $, sans paiement, et le client reçoit quand même sa confirmation, ses places et ses accès. Utilisez-les avec soin :
- Mettez toujours une **limite d’utilisation** (par exemple 1 pour une invitation) ;
- Mettez une **date d’expiration** ;
- Limitez-le aux cours visés dans **Applies To** ;
- Ne l’affichez jamais publiquement.

Seul un administrateur peut supprimer un code ; le personnel peut en créer et en désactiver.

---

## 6. Crédits

Un **crédit** est un code promo **personnel**, à usage unique, créé automatiquement quand une annulation donne droit à un crédit (voir la section 8). Il est envoyé par courriel au client.

- Il se présente sous la forme `CFF-CR-` suivi de 8 caractères.
- Il vaut un **montant fixe** (le montant de la place annulée).
- Il est valable **365 jours** et s’utilise **une seule fois**.
- Pour le voir : Ventes → Codes promo, puis cherchez « CFF-CR- ». Le champ **Personal For** (réservé à) indique à quel client il appartient.
- Vous pouvez aussi **créer un crédit manuellement** (geste commercial) : créez un code de type **Montant (cents)**, limite d’utilisation 1, et choisissez le client dans **Personal For**.

> La durée de 365 jours est la valeur par défaut retenue ; elle n’est pas modifiable dans l’administration. Confirmation finale du client attendue.

---

## 7. Participants

**Où :** ouvrez une séance (Catalogue → Séances). Le bloc **Participants** apparaît au bas de l’écran.

### Ce que vous voyez
Pour chaque place confirmée : **Nom**, **Courriel**, **Téléphone**, **Notes alimentaires**, **Commande**, **Réservé par**, **Présence**.

- **Invité** : une place achetée par quelqu’un d’autre. La colonne **Réservé par** montre le nom et le courriel de la personne qui a payé. Un acheteur peut réserver jusqu’à 4 places par achat (voir la section 12).
- **Annulés / remboursés** : les places annulées ou remboursées sont regroupées à part, avec la mention **Annulée** ou **Remboursée**.
- Si personne n’est inscrit : « Aucun participant confirmé pour le moment. »

### Exporter la liste (CSV)
Cliquez sur **Exporter CSV**. Le fichier s’ouvre dans Excel (version française) avec les accents corrects. Pratique pour imprimer une feuille de présence ou prévenir les allergies à l’avance.

### Marquer la présence
La colonne **Présence** offre trois choix : **À confirmer**, **Présent** et **Absent**. Le choix se fait **à partir du jour du cours** ; avant, le menu affiche « Disponible le jour du cours ». Le choix s’enregistre tout de suite ; en cas d’échec, le message « Échec de l’enregistrement. » apparaît : réessayez.

---

## 8. Annulations et remboursements

### La politique d’annulation
**Où :** Paramètres → Politique d’annulation (modifiable par un administrateur seulement).

La politique est une liste de **Paliers**. Chaque palier a :
- **Heures minimum avant la séance** ;
- **Résultat** : **Remboursement**, **Crédit** ou **Aucun** ;
- **Pourcentage** (de 0 à 100) de la place qui est remboursée ou créditée.

Les paliers doivent être classés **du plus grand nombre d’heures au plus petit**, sans doublon.

**Valeurs par défaut** (utilisées tant qu’aucun palier n’est saisi) :

| Quand le client annule | Résultat |
|---|---|
| **72 heures ou plus** avant la séance | **Remboursement** de 100 % |
| **Entre 24 et 72 heures** avant | **Crédit** de 100 % (code personnel valable 365 jours) |
| **Moins de 24 heures** avant | **Aucun** remboursement ni crédit |

> Ces paliers sont les valeurs par défaut du site. La politique définitive est une décision du client encore ouverte : tant qu’elle n’est pas confirmée, la page publique « Politique d’annulation » doit être rédigée pour correspondre exactement à ces paliers.

La case **Le client peut annuler lui-même** (cochée par défaut) permet au client d’annuler sa place depuis « Mon compte → Mes séances ». Décochée, les clients doivent vous contacter.

### Annulation par le client
Le client annule **sa propre place** depuis **Mon compte → Mes séances**. Le système applique les paliers ci-dessus, selon le temps restant, puis :
- **Remboursement** : Stripe rembourse la carte automatiquement ;
- **Crédit** : un code personnel est envoyé par courriel ;
- **Aucun** : la place est annulée sans montant.

Le client reçoit un courriel de confirmation. Seule la personne qui a **acheté** peut annuler une place ; le remboursement ou le crédit lui revient, même si la place était pour un invité. L'invité est prévenu de l’annulation. Un client ne peut plus annuler après le début de la séance.

### Remboursement partiel par place
Chaque place d’une commande a sa propre part du total (taxes et rabais compris). Annuler une seule place rembourse (ou crédite) **seulement la part de cette place**. Les restes de division sont attribués à la première place.

### Délais Stripe
Un remboursement apparaît sur la carte du client habituellement en **5 à 10 jours ouvrables**, selon sa banque. Ce délai ne dépend pas de nous. Le montant remboursé est inscrit dans la commande (**Remboursements**).

### Annulation faite par le personnel
Voir « À vérifier » à la fin de ce guide : il n’y a pas, à ce jour, de bouton « Annuler cette place » dans l’administration.

---

## 9. Liste d’attente

**Où :** Clients → Liste d’attente.

### Comment ça fonctionne
1. Quand une séance est complète, le site propose aux visiteurs de s’inscrire à la liste d’attente avec leur courriel.
2. Quand une place se libère (annulation, réservation expirée), le site avise par courriel les **3 premières personnes** en attente, dans l’ordre d’inscription. Ce nombre est le réglage **Personnes notifiées (liste d’attente)** (voir la section 12).
3. **La première personne qui paie obtient la place.** Aucune place n’est mise de côté pour une personne en particulier.
4. Chaque personne n’est avisée **qu’une seule fois** par séance.

### Statuts d’une inscription
**En attente**, **Notifié**, **Converti** (la personne a acheté), **Expiré**, **Retiré**.

Le courriel envoyé s’intitule « Une place s’est libérée », dans la langue de la personne.

---

## 10. Commentaires

**Où :** Apprentissage → Commentaires.

Les clients ayant accès à une leçon peuvent y laisser un commentaire. **Aucun commentaire n’est publié sans votre approbation.**

### Modérer
1. Ouvrez Apprentissage → Commentaires.
2. Filtrez sur le statut **En attente**.
3. Ouvrez un commentaire, lisez-le, puis choisissez le **Statut** :
   - **Approuvé** : le commentaire devient visible et l’auteur reçoit un courriel « Votre commentaire est publié » ;
   - **Rejeté** : le commentaire reste invisible.
4. Enregistrez.

Le nom affiché publiquement est le **prénom et l’initiale du nom** de l’auteur. Le personnel **ne peut pas répondre** aux commentaires sur le site ; la modération est la seule action disponible.

---

## 11. Commandes et reçus

**Où :** Ventes → Commandes (et Ventes → Inscriptions pour chaque place).

### Consulter une commande
Chaque commande a un **Numéro** (format CFF-000123), le courriel et la langue du client, le **Statut**, les articles, les montants et les remboursements.

| Statut | Signification |
|---|---|
| **En attente** | Le paiement n’est pas terminé. |
| **Payée** | Paiement reçu. |
| **Remboursée** | Remboursée en totalité. |
| **Partiellement remboursée** | Une ou plusieurs places ont été remboursées. |
| **Annulée** | Commande annulée (par exemple, plus de place disponible au moment du paiement : le client est remboursé automatiquement). |

Les montants (sous-total, rabais, TPS, TVQ, total) sont affichés en cents, en dollars canadiens.

Seuls les administrateurs peuvent modifier une commande ; en pratique, ne la modifiez pas à la main.

### Reçus et factures
Le client retrouve ses reçus dans **Mon compte → Reçus**. La facture PDF est celle produite par Stripe.

### TPS et TVQ
Les taxes sont calculées automatiquement au paiement **une fois les numéros de TPS et de TVQ et le code de taxe fournis par le client et activés** par le développeur. Tant que ce n’est pas fait, les reçus n’indiquent pas la TPS ni la TVQ. C'est une décision du client encore ouverte.

---

## 12. Réglages du site

**Où :** Paramètres → Réglages du site (administrateur seulement).

| Réglage | Rôle | Valeur par défaut |
|---|---|---|
| **Lien communauté** | Adresse de votre communauté (groupe, Discord, etc.). **Si vous laissez le champ vide, le lien est masqué sur le site.** | Vide (masqué) |
| **Places max. par achat** | Nombre maximal de places qu’un client peut acheter en une fois (de 1 à 10). Les cours en ligne se vendent toujours à l’unité. | 4 |
| **Durée de réservation (min)** | Temps pendant lequel une place est retenue pendant le paiement. | 15 minutes |
| **Personnes notifiées (liste d’attente)** | Combien de personnes sont avisées quand une place se libère. | 3 |
| **Rappels (heures avant)** | Quand envoyer les rappels avant une séance. | 48 et 24 heures |
| **Courriel de contact** | Adresse de contact affichée aux clients. | — |
| **Pages légales** | Les pages **Conditions**, **Confidentialité** et **Annulation**, choisies parmi vos pages (section 13). | — |

> Le lien communauté est à fournir par le client. Tant qu’il est vide, aucun bouton communauté n’apparaît.

---

## 13. Pages et blocs

**Où :** Catalogue → Pages.

Une page est faite d’une **Mise en page** : une suite de blocs que vous ajoutez, déplacez et supprimez.

| Bloc | Utilité |
|---|---|
| **Bannière** | Grande image d’accueil avec titre, sous-titre et bouton. |
| **Galerie** | Une série de photos, avec un titre. |
| **Témoignages** | Citations de clients (citation, auteur, rôle). |
| **Appel à l’action** | Titre, texte et bouton pour inviter à agir (ex. : « Réserver »). |
| **Texte riche** | Texte libre mis en forme. |

### Modifier la page d’accueil
Ouvrez la page d’accueil (adresse `accueil` en français, `home` en anglais), modifiez ou réordonnez les blocs, remplissez le français puis l’anglais, et enregistrez. Comme pour les cours, une page peut rester en **brouillon** tant qu’elle n’est pas prête.

### Politique de confidentialité (Loi 25)
Créez une page « Politique de confidentialité » (français et anglais), publiez-la, puis choisissez-la dans **Réglages du site → Pages légales**. Le texte doit être fourni ou validé par le client ; c’est une obligation de la Loi 25 du Québec.

### Produits
Catalogue → Produits : fiches de produits qui renvoient vers une boutique externe (**Lien boutique externe**). Le **Prix affiché (texte)** est un simple texte, le site ne vend pas ces produits.

### Images
Catalogue → Médias : téléversez vos images et remplissez toujours le **Texte alternatif** (accessibilité et référencement).

---

## 14. Courriels automatiques

Le site envoie ces courriels tout seul, dans la **langue préférée du client**. Vous n’avez rien à envoyer à la main.

| Courriel | Quand |
|---|---|
| Lien de connexion | Quand un client demande à se connecter (« Votre lien de connexion Cook for Friends »). |
| Confirmation de commande | Après un paiement réussi (« Confirmation de commande # »). |
| Confirmation d’inscription / invitation | À chaque participant, y compris les invités (« Vous êtes invité(e) à un cours »). |
| Rappel | 48 heures et 24 heures avant la séance, à l’acheteur et aux invités. |
| Place disponible | Aux personnes de la liste d’attente (section 9). |
| Place annulée | Confirmation de l’annulation (avec le code de crédit, le cas échéant). |
| Remboursement traité | Quand un remboursement est émis. |
| Remboursement (cours complet) | Si la séance s’est remplie pendant le paiement : commande remboursée automatiquement. |
| Certificat | Quand un certificat est émis (section 15). |
| Commentaire publié | Quand vous approuvez un commentaire. |

Les rappels sont envoyés toutes les heures par un traitement automatique. Si des rappels n’arrivent pas, voir la section 16.

---

## 15. Certificats

**Où :** Apprentissage → Certificats (lecture ; seuls les administrateurs peuvent modifier).

- Un certificat est émis **automatiquement** quand un client termine toutes les leçons d’un cours **en ligne** dont la case **Certificat de réussite** est cochée. Les cours en personne n’émettent pas de certificat.
- Le client reçoit un courriel et peut télécharger le PDF dans son compte.
- Chaque certificat a un **code de vérification**. Toute personne peut le vérifier sur la page publique de vérification des certificats du site, en entrant ce code (utile pour un employeur).
- Un seul certificat par client et par cours. Il conserve le nom du client et le titre du cours tels qu’ils étaient à l’émission.

---

## 16. Ce qu’il ne faut jamais faire dans Stripe, dépannage et FAQ

### Ne jamais faire dans Stripe
- Ne **créez, modifiez ou archivez aucun produit ou prix** : tout vient du site.
- Ne **créez pas de coupons ni de codes promo** dans Stripe : utilisez Ventes → Codes promo.
- Ne **remboursez pas** une place directement dans Stripe : le site ne le saurait pas (commande et place resteraient « payées »). Voir la section 8.
- Ne supprimez pas de clients ni de paiements.
- Ne modifiez pas les « webhooks » ni les clés.

La seule raison d’aller dans Stripe est la configuration initiale des taxes, faite une fois avec le développeur.

### Dépannage

**Mon cours n’apparaît pas sur le site.**
1. Le **Statut** est-il **Publié** ? (pas Brouillon ni Archivé)
2. Cours en personne : existe-t-il au moins une séance **Planifiée** à venir ?
3. Le champ **Stripe Sync Status** est-il **Synchronisé** ? Sinon, voir la section 2.
4. Les textes anglais sont-ils remplis ? (sinon la page anglaise apparaît en français)

**Un client dit ne pas avoir reçu de courriel.**
1. Demandez-lui de vérifier ses courriels indésirables.
2. Vérifiez l’adresse dans Clients → Clients et dans la commande (faute de frappe fréquente).
3. Vérifiez que la commande est **Payée**.
4. S'il manque seulement le lien de connexion, il peut en redemander un.
5. Si le problème persiste, contactez le développeur avec le numéro de commande.

**Un client a payé mais n’a pas accès au cours.**
1. Ventes → Commandes : la commande est-elle **Payée** ?
2. Clients → Droits d’accès : existe-t-il un droit d’accès pour ce client et ce cours ? Vérifiez les champs d’expiration (vide = sans expiration).
3. Si le paiement est bien reçu mais qu’il n’y a pas de droit d’accès, contactez le développeur avec le numéro de commande.
4. Pour un cadeau ou un geste commercial, un administrateur peut créer un droit d’accès de type **Manuel**.

**Un client a payé deux fois.**
Repérez les deux commandes dans Ventes → Commandes. Contactez le développeur pour rembourser la commande en double ; ne le faites pas dans Stripe.

**Un client voit « complet » mais une place s’est libérée.**
La place est peut-être retenue pendant le paiement de quelqu’un d’autre (15 minutes). Elle sera libérée si la personne ne paie pas.

**Les rappels n’arrivent pas.**
Contactez le développeur : le traitement horaire des rappels est peut-être à vérifier.

---

## 17. Glossaire

| Terme du guide | Terme technique | Explication |
|---|---|---|
| **Droit d’accès** | entitlement | Ce qui autorise un client à voir un cours (acheté, cadeau, manuel, abonnement). Sans droit d’accès, pas d’accès. |
| **Place retenue** (réservation en cours) | seat hold | Place mise de côté pendant qu’un client paie (15 minutes par défaut). |
| **Séance** | session | Une date précise d’un cours en personne. |
| **Inscription** | enrollment | Une place confirmée pour une personne à une séance. |
| **Stripe Sync Status** | stripeSyncStatus | État de la mise à jour automatique d’un cours vers Stripe. |
| **Palier** | tier | Une règle de la politique d’annulation (heures, résultat, pourcentage). |
| **Crédit** | credit code | Code promo personnel à usage unique issu d’une annulation. |
| **Code promo** | discount code | Code de rabais saisi par le client au paiement. |
| **Brouillon / Publié / Archivé** | draft / published / archived | États de visibilité d’un cours, d’une page ou d’un produit. |
| **Bloc** | block | Élément réutilisable d’une page (bannière, galerie, etc.). |
| **Texte alternatif** | alt text | Description d’une image pour l’accessibilité. |
| **Webhook** | webhook | Message automatique de Stripe vers le site (vous n’avez pas à y toucher). |
| **CSV** | CSV | Fichier de tableau qui s’ouvre dans Excel. |
| **Loi 25** | — | Loi québécoise sur la protection des renseignements personnels. |

---

## À vérifier avant la diffusion

Ces points viennent de l’état actuel du site ; ils sont à confirmer avec le client ou le développeur.

### Décisions ouvertes du client
- Paliers définitifs de la politique d’annulation et texte de la page publique (valeurs par défaut décrites en section 8).
- Compte vidéo Mux : tant qu’il n’est pas relié, la vidéo est en mode démonstration.
- Lien communauté (section 12).
- Numéros de TPS et de TVQ (section 11).
- Texte de la politique de confidentialité en français et en anglais (Loi 25).

### Fonctions absentes de l’administration à ce jour
- Annulation d’une place par le personnel (bouton) : l’action existe côté technique mais n’a pas d’écran.
- Annulation d’une séance : passer le statut à **Annulée** ne rembourse ni n’avise automatiquement les participants.
- Marquer la **Présence** : à partir du jour du cours seulement.

### Libellés à vérifier après W3-11 (CI e2e) et W3-10 (revue de sécurité)
Ces libellés ont été relevés dans le code au commit fd244d3. Les libellés **français** ci-dessous sont fiables ; ceux qui suivent sont à revalider si une autre tâche les modifie :
- Champs **sans libellé français** (affichés par Payload en anglais) : Codes promo (**Code**, **Kind**, **Value**, **Max Redemptions**, **Expires At**, **Applies To**, **Active**, **Personal For**), cours (**Stripe Sync Status**, **Stripe Sync Error**), séances (**Lieu** : sous-champs en anglais), commandes (champs de montants).
- Libellés d'écran « Mon compte » cités : **Mes séances**, **Reçus** (fr.json, section `portal.nav`).
- Texte des messages de la vidéo et de la présence (composants d'administration).
