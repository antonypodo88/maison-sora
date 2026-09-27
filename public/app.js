// Logique de la page de réservation
const state = { services: [], service: null, date: "", time: "" };
const $ = (id) => document.getElementById(id);
const chf = (n) => `${n} CHF`;

function showAlert(message, type = "error") {
  const el = $("alert");
  el.textContent = message;
  el.className = `alert ${type === "info" ? "info" : ""}`;
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });
}

// ----- Étape 1 : les soins -----
async function loadServices() {
  const res = await fetch("/api/services");
  state.services = await res.json();
  $("services").innerHTML = state.services.map((s) => `
    <button type="button" class="service" data-id="${s.id}">
      <div class="service-emoji">${s.emoji}</div>
      <h3>${s.name}</h3>
      <p>${s.description}</p>
      <div class="service-meta"><span>${s.duration} min</span><strong>${chf(s.price)}</strong></div>
    </button>`).join("");

  document.querySelectorAll(".service").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".service").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.service = state.services.find((s) => s.id === btn.dataset.id);
      updateSummary();
    })
  );
}

// ----- Étape 2 : date et créneaux -----
function setupDate() {
  const input = $("date");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  input.min = tomorrow.toISOString().slice(0, 10);

  input.addEventListener("change", () => {
    const day = new Date(`${input.value}T12:00:00`).getDay();
    state.time = "";
    if (day === 0) {
      state.date = "";
      $("slots").innerHTML = "";
      $("date-hint").textContent = "Nous sommes fermés le dimanche, choisissez un autre jour.";
    } else {
      state.date = input.value;
      $("date-hint").textContent = "Choisissez un horaire :";
      loadSlots();
    }
    updateSummary();
  });
}

async function loadSlots() {
  $("slots").innerHTML = '<p class="hint">Chargement…</p>';
  const res = await fetch(`/api/slots?date=${state.date}`);
  if (!res.ok) return showAlert("Impossible de charger les créneaux.");
  const slots = await res.json();

  $("slots").innerHTML = slots.map((s) =>
    `<button type="button" class="slot" data-time="${s.time}" ${s.available ? "" : "disabled"}>${s.time}</button>`
  ).join("");

  document.querySelectorAll(".slot").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".slot").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.time = btn.dataset.time;
      updateSummary();
    })
  );
}

// ----- Étape 3 : récapitulatif et paiement -----
function updateSummary() {
  const s = state.service;
  $("sum-service").textContent = s ? s.name : "—";
  $("sum-date").textContent = state.date ? formatDate(state.date) : "—";
  $("sum-time").textContent = state.time || "—";
  $("sum-price").textContent = s ? chf(s.price) : "—";
  $("sum-deposit").textContent = s ? chf(s.deposit) : "—";
  $("pay").disabled = !(s && state.date && state.time);
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pay = $("pay");
  pay.disabled = true;
  pay.textContent = "Redirection vers le paiement…";

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: state.service.id,
        date: state.date,
        time: state.time,
        name: $("name").value.trim(),
        email: $("email").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.location.href = data.url; // page de paiement Stripe
  } catch (err) {
    showAlert(err.message || "Une erreur est survenue.");
    if (state.date) loadSlots();
    pay.textContent = "Payer l'acompte";
    updateSummary();
  }
});

// ----- Démarrage -----
if (new URLSearchParams(location.search).has("cancelled"))
  showAlert("Paiement annulé : votre créneau sera libéré. Vous pouvez recommencer quand vous voulez.", "info");

loadServices();
setupDate();
