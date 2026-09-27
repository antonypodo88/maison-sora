# Maison Sora — Réservation de soins avec acompte

Application web de démonstration : un cabinet de bien-être **fictif** où l'on choisit un soin et un créneau, puis où l'on paie un acompte de 30 % en ligne.

**Stack :** Node.js · Express · Stripe Checkout · Supabase (PostgreSQL) · déploiement sur Render

## Fonctionnalités

- Catalogue de soins avec prix et durée
- Choix de la date (fermé le dimanche) et des créneaux disponibles en temps réel
- Paiement sécurisé de l'acompte avec **Stripe Checkout** (en CHF)
- Enregistrement des réservations dans **Supabase**
- Pas de double réservation : un index unique en base bloque les créneaux déjà pris
- **Webhook Stripe** : la réservation passe en « payée » après le paiement, et le créneau est libéré si le paiement n'aboutit pas dans les 30 minutes
- Design responsive, adapté au mobile

> Projet de démonstration : les paiements sont en mode test, aucun vrai débit.

---

## Installation en local

### 1. Installer le projet
```bash
npm install
cp .env.example .env
```

### 2. Supabase (5 min)
1. Crée un projet gratuit sur [supabase.com](https://supabase.com).
2. Va dans **SQL Editor → New query**, colle le contenu de `supabase.sql` et clique sur **Run**.
3. Va dans **Project Settings → API** et copie dans `.env` :
   - `Project URL` → `SUPABASE_URL`
   - `service_role` (clé secrète) → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Stripe (mode test)
1. Sur [dashboard.stripe.com](https://dashboard.stripe.com), active le **mode test** (interrupteur en haut à droite).
2. **Développeurs → Clés API** : copie la clé secrète `sk_test_...` dans `STRIPE_SECRET_KEY`.
3. Webhook en local (facultatif) : installe la [Stripe CLI](https://docs.stripe.com/stripe-cli), puis :
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```
   Copie le `whsec_...` affiché dans `STRIPE_WEBHOOK_SECRET`.

### 4. Lancer
```bash
npm run dev
```
Ouvre http://localhost:3000 et paie avec la carte de test `4242 4242 4242 4242`.

---

## Mise en ligne sur Render

1. Pousse le projet sur GitHub. Le `.gitignore` exclut déjà le fichier `.env`.
2. Sur [render.com](https://render.com) : **New → Web Service**, puis choisis ton dépôt.
   - Build command : `npm install`
   - Start command : `npm start`
3. Dans **Environment**, ajoute les mêmes variables que dans `.env`, avec `BASE_URL=https://ton-app.onrender.com`.
4. Dans Stripe, **Développeurs → Webhooks → Ajouter un endpoint** :
   - URL : `https://ton-app.onrender.com/api/webhook`
   - Événements : `checkout.session.completed` et `checkout.session.expired`
   - Copie le secret `whsec_...` dans la variable `STRIPE_WEBHOOK_SECRET` sur Render.

---

## Structure

```
server.js          API Express : services, créneaux, paiement, webhook
supabase.sql       Table des réservations + index anti double réservation
public/
  index.html       Page de réservation
  success.html     Confirmation après paiement
  app.js           Logique du front (vanilla JS)
  style.css        Design
```
