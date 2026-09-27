// Maison Sora — démo de réservation avec acompte Stripe + Supabase
require("dotenv").config();
const express = require("express");
const path = require("path");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BASE_URL = "http://localhost:3000",
  PORT = 3000,
} = process.env;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

if (!stripe) console.warn("⚠️  STRIPE_SECRET_KEY manquante : le paiement est désactivé.");
if (!supabase) console.warn("⚠️  Supabase non configuré : les créneaux ne sont pas enregistrés.");

// ---------- Données de la démo ----------
const SERVICES = [
  { id: "massage-60", name: "Massage relaxant", duration: 60, price: 120, emoji: "🌿",
    description: "Un massage complet pour relâcher les tensions du dos, de la nuque et des épaules." },
  { id: "reflexo-45", name: "Réflexologie plantaire", duration: 45, price: 95, emoji: "🦶",
    description: "Stimulation des zones réflexes des pieds pour un profond sentiment de détente." },
  { id: "soin-pieds-30", name: "Soin des pieds", duration: 30, price: 70, emoji: "✨",
    description: "Bain, gommage et hydratation pour des pieds doux et reposés." },
];
const DEPOSIT_RATE = 0.3; // acompte de 30 %
const SLOTS = ["09:00", "10:00", "11:00", "13:30", "14:30", "15:30", "16:30", "17:30"];
const ACTIVE_STATUSES = ["pending", "paid"];

const depositOf = (service) => Math.round(service.price * DEPOSIT_RATE);

const app = express();

// ---------- Webhook Stripe (doit recevoir le corps brut, avant express.json) ----------
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.sendStatus(400);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature webhook invalide :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;
  const bookingId = session.metadata && session.metadata.booking_id;

  try {
    if (supabase && bookingId) {
      if (event.type === "checkout.session.completed") {
        await supabase.from("bookings").update({ status: "paid" }).eq("id", bookingId);
        console.log(`✅ Réservation ${bookingId} payée`);
      } else if (event.type === "checkout.session.expired") {
        await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
        console.log(`⌛ Réservation ${bookingId} expirée, créneau libéré`);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- API ----------
app.get("/api/services", (_req, res) => {
  res.json(SERVICES.map((s) => ({ ...s, deposit: depositOf(s) })));
});

app.get("/api/slots", async (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return res.status(400).json({ error: "Date invalide" });

  let taken = [];
  if (supabase) {
    const { data, error } = await supabase
      .from("bookings")
      .select("time")
      .eq("date", date)
      .in("status", ACTIVE_STATUSES);
    if (error) return res.status(500).json({ error: "Impossible de lire les créneaux" });
    taken = data.map((b) => b.time.slice(0, 5));
  }

  res.json(SLOTS.map((time) => ({ time, available: !taken.includes(time) })));
});

app.post("/api/checkout", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Paiement non configuré (clé Stripe manquante)." });

  const { serviceId, date, time, name, email } = req.body || {};
  const service = SERVICES.find((s) => s.id === serviceId);

  if (!service || !SLOTS.includes(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date || ""))
    return res.status(400).json({ error: "Réservation invalide." });
  if (!name || !/^\S+@\S+\.\S+$/.test(email || ""))
    return res.status(400).json({ error: "Merci d'indiquer un nom et un e-mail valides." });

  // 1) On bloque le créneau dans Supabase (statut « pending »)
  let bookingId = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("bookings")
      .insert({ service_id: service.id, service_name: service.name, date, time,
                customer_name: name, customer_email: email,
                price_chf: service.price, deposit_chf: depositOf(service), status: "pending" })
      .select("id")
      .single();
    if (error) {
      // 23505 = violation de l'index unique : le créneau vient d'être pris
      const msg = error.code === "23505" ? "Ce créneau vient d'être réservé, choisissez-en un autre." : "Erreur base de données.";
      return res.status(409).json({ error: msg });
    }
    bookingId = data.id;
  }

  // 2) On crée la session de paiement Stripe Checkout
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "chf",
          unit_amount: depositOf(service) * 100,
          product_data: {
            name: `Acompte — ${service.name}`,
            description: `Rendez-vous le ${date} à ${time} (${service.duration} min)`,
          },
        },
      }],
      metadata: { booking_id: bookingId || "", service_id: service.id, date, time },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // le créneau est libéré après 30 min
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?cancelled=1`,
    });

    if (supabase && bookingId)
      await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", bookingId);

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    if (supabase && bookingId)
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
    res.status(500).json({ error: "Impossible de créer le paiement." });
  }
});

app.get("/api/booking", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Paiement non configuré." });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    const service = SERVICES.find((s) => s.id === session.metadata.service_id);

    // Filet de sécurité : si le webhook n'est pas configuré, on confirme ici aussi
    if (supabase && session.payment_status === "paid" && session.metadata.booking_id)
      await supabase.from("bookings").update({ status: "paid" }).eq("id", session.metadata.booking_id);

    res.json({
      paid: session.payment_status === "paid",
      service: service ? service.name : "",
      date: session.metadata.date,
      time: session.metadata.time,
      deposit: session.amount_total / 100,
      email: session.customer_email,
    });
  } catch {
    res.status(404).json({ error: "Réservation introuvable." });
  }
});

app.listen(PORT, () => console.log(`🌿 Maison Sora démarré sur ${BASE_URL}`));
