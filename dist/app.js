'use strict';

/* ---- Config ----
   Desde el 20/11/2026 hay dos modalidades (igual que en netlify/functions/_shared.mjs):
   - Crea tu SIMO: sábados 10:00–14:00, 4 h, 74,99 €, 8 plazas.
   - Customiza tu SIMO: viernes y sábados 17:00–19:30, 2 h 30 min, 54,99 €, 20 plazas.
   Antes del 20/11: formato antiguo (Crea tu SIMO, viernes y sábados 17:00–20:00, 54,99 €, 8 plazas). */
const MIN_DATE = '2026-10-23';
const MAX_DATE = '2026-12-31';
const CAMBIO = '2026-11-20';
const SIN_TALLER = ['2026-12-25'];
const CERRADAS = ['2026-10-31', '2026-11-13', '2026-11-14']; // cerradas a mano: salen como completas
const MODALIDADES = {
  crea: { nombre: 'Crea tu SIMO', leyenda: 'Crea tu SIMO: sábados de 10:00 a 14:00 · grupos de 8' },
  customiza: { nombre: 'Customiza tu SIMO', leyenda: 'Customiza tu SIMO: viernes y sábados de 17:00 a 19:30 · grupos de 20' }
};
const PRECIO_BASE = { crea: 7499, customiza: 5499 };   // para el total antes de elegir día
const CAPACIDAD_BASE = { crea: 8, customiza: 20 };
const CONTACTO = {
  instagram: 'https://www.instagram.com/simo.bysimone/',
  tiktok: 'https://www.tiktok.com/@simone.eppi',
  email: ''                          // pendiente de confirmar
};

function sesionesDe(fecha) {
  if (fecha < MIN_DATE || fecha > MAX_DATE || SIN_TALLER.includes(fecha)) return [];
  const dow = new Date(fecha + 'T12:00:00').getDay();
  if (fecha < CAMBIO) {
    if (dow !== 5 && dow !== 6) return [];
    return [{ modalidad: 'crea', hora: '17:00', horario: '17:00–20:00', precio: 5499, capacidad: 8 }];
  }
  const out = [];
  if (dow === 6) out.push({ modalidad: 'crea', hora: '10:00', horario: '10:00–14:00', precio: 7499, capacidad: 8 });
  if (dow === 5 || dow === 6) out.push({ modalidad: 'customiza', hora: '17:00', horario: '17:00–19:30', precio: 5499, capacidad: 20 });
  return out;
}
function sesion(fecha, mod) { return sesionesDe(fecha).find(x => x.modalidad === mod) || null; }
function entradaDe(fecha) {
  return new Date(fecha + 'T12:00:00').getDay() === 6 ? 'C/ San Martín 5' : 'C/ Hileras 18';
}

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

document.getElementById('year').textContent = String(new Date().getFullYear());

/* ---- Contactos del footer ---- */
if (CONTACTO.instagram) document.getElementById('link-instagram').href = CONTACTO.instagram;
if (CONTACTO.tiktok) document.getElementById('link-tiktok').href = CONTACTO.tiktok;
if (CONTACTO.email) { const a = document.getElementById('link-email'); a.href = 'mailto:' + CONTACTO.email; a.textContent = CONTACTO.email; }

/* ---- Galería: oculta fotos opcionales si el archivo aún no existe ---- */
document.querySelectorAll('#gallery-grid img').forEach(img => {
  img.addEventListener('error', () => {
    const fig = img.closest('figure');
    if (fig) fig.hidden = true;
  });
});

/* ---- Fechas ---- */
function iso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const today = new Date(); today.setHours(0, 0, 0, 0);
const nowY = today.getFullYear(), nowM = today.getMonth();
let monthOffset = 0;
let selectedDate = null;
let modalidad = 'crea';
let availability = {}; // 'YYYY-MM-DD|modalidad' -> plazas ya reservadas

function libres(fecha, mod = modalidad) {
  const ses = sesion(fecha, mod);
  if (CERRADAS.includes(fecha)) return 0;
  return ses ? Math.max(0, ses.capacidad - (availability[fecha + '|' + mod] || 0)) : 0;
}

const calendarDays = document.getElementById('calendar-days');
const monthLabel = document.getElementById('month-label');
const dateSelection = document.getElementById('date-selection');
const sessionInput = document.getElementById('session-date');
const spotsNote = document.getElementById('spots-note');
const legendText = document.getElementById('legend-text');
const monthNames = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

async function fetchAvailability(from, to) {
  try {
    const res = await fetch(`/api/disponibilidad?desde=${from}&hasta=${to}`);
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(r => {
      const mod = r.modalidad || (r.fecha < CAMBIO ? 'crea' : 'customiza');
      availability[r.fecha + '|' + mod] = r.reservadas;
    });
    if (selectedDate) selectDate(selectedDate, true);
    else renderCalendar();
  } catch { /* sin backend: todo disponible */ }
}

function renderCalendar() {
  const base = new Date(nowY, nowM + monthOffset, 1);
  const y = base.getFullYear(), m = base.getMonth();
  monthLabel.textContent = monthNames.format(base);
  calendarDays.replaceChildren();

  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstDow; i++) {
    const pad = document.createElement('span');
    pad.className = 'cal-empty';
    pad.setAttribute('aria-hidden', 'true');
    calendarDays.append(pad);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = iso(y, m, d);
    const past = new Date(y, m, d) < today;
    const ses = sesion(key, modalidad);
    const workshop = !!ses && !past;
    const free = libres(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(d);
    btn.dataset.date = key;
    if (workshop && free > 0) {
      btn.className = 'available';
      btn.setAttribute('aria-label', `${fmtLong.format(new Date(y, m, d))}, ${ses.horario}, ${free} plazas libres`);
      if (selectedDate === key) btn.classList.add('selected');
      btn.addEventListener('click', () => selectDate(key));
    } else {
      btn.disabled = true;
      btn.className = workshop ? 'full' : 'empty';
      if (workshop) btn.setAttribute('aria-label', `${fmtLong.format(new Date(y, m, d))}, completo`);
    }
    calendarDays.append(btn);
  }

  const lastOffset = (2026 - nowY) * 12 + 11 - nowM; // diciembre 2026 es el último mes con talleres
  document.getElementById('prev-month').disabled = monthOffset === 0;
  document.getElementById('next-month').disabled = monthOffset >= Math.max(0, lastOffset);
}

function selectDate(key, keepPeople = false) {
  const ses = sesion(key, modalidad);
  if (!ses || libres(key) <= 0) { clearDate(); return; }
  selectedDate = key;
  sessionInput.value = key;
  const [y, m, d] = key.split('-').map(Number);
  const free = libres(key);
  dateSelection.textContent = `${MODALIDADES[modalidad].nombre} · ${fmtLong.format(new Date(y, m - 1, d))} · ${ses.horario} · Casa de las Alajas, entrada por ${entradaDe(key)} · quedan ${free} ${free === 1 ? 'plaza' : 'plazas'}`;
  fillPeople(free);
  spotsNote.hidden = false;
  spotsNote.textContent = `Máximo ${free} ${free === 1 ? 'plaza' : 'plazas'} disponibles en esta sesión.`;
  updateTotal();
  renderCalendar();
}

function clearDate() {
  selectedDate = null;
  sessionInput.value = '';
  dateSelection.textContent = 'Elige un día marcado en el calendario.';
  spotsNote.hidden = true;
  fillPeople(CAPACIDAD_BASE[modalidad]);
  updateTotal();
  renderCalendar();
}

document.getElementById('prev-month').addEventListener('click', () => { if (monthOffset > 0) { monthOffset--; renderCalendar(); } });
document.getElementById('next-month').addEventListener('click', () => { monthOffset++; renderCalendar(); });

/* ---- Personas + total ---- */
const people = document.getElementById('people');
const totalEl = document.getElementById('total');
const payTotal = document.getElementById('pay-total');

function fillPeople(max) {
  const prev = Number(people.value) || 1;
  people.replaceChildren();
  for (let i = 1; i <= Math.max(1, max); i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i} ${i === 1 ? 'persona' : 'personas'}`;
    people.append(o);
  }
  people.value = String(Math.min(prev, Math.max(1, max)));
}
function precioActual() {
  const ses = selectedDate && sesion(selectedDate, modalidad);
  return ses ? ses.precio : PRECIO_BASE[modalidad];
}
function updateTotal() {
  const total = money.format(Number(people.value || 1) * precioActual() / 100);
  totalEl.textContent = total;
  payTotal.textContent = total;
}
document.getElementById('people-minus').addEventListener('click', () => {
  people.value = String(Math.max(1, Number(people.value) - 1));
  updateTotal();
});
document.getElementById('people-plus').addEventListener('click', () => {
  people.value = String(Math.min(people.options.length, Number(people.value) + 1));
  updateTotal();
});
people.addEventListener('change', updateTotal);

/* ---- Modalidad ---- */
function setModalidad(mod) {
  modalidad = mod === 'customiza' ? 'customiza' : 'crea';
  document.querySelectorAll('input[name="modalidad"]').forEach(r => { r.checked = r.value === modalidad; });
  const aviso = modalidad === 'crea' && iso(nowY, nowM, today.getDate()) < CAMBIO ? ' · hasta el 19/11, viernes y sábados de 17:00 a 20:00' : '';
  legendText.textContent = MODALIDADES[modalidad].leyenda + aviso;
  if (selectedDate && sesion(selectedDate, modalidad) && libres(selectedDate) > 0) selectDate(selectedDate);
  else clearDate();
}
document.querySelectorAll('input[name="modalidad"]').forEach(r => r.addEventListener('change', () => setModalidad(r.value)));
document.querySelectorAll('[data-reservar]').forEach(a => a.addEventListener('click', () => setModalidad(a.dataset.reservar)));

/* ---- Toast ---- */
const toast = document.getElementById('toast');
let toastTimer = null;
function showToast(msg, ms = 6000) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
}

/* ---- Submit → Stripe Checkout ---- */
const payButton = document.getElementById('pay-button');
document.getElementById('booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedDate) { showToast('Elige una sesión primero.'); return; }
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const nPeople = Number(people.value);
  payButton.disabled = true;
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: selectedDate, modalidad, personas: nPeople, nombre: name, email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido iniciar el pago.');
    window.location.href = data.url;
  } catch (err) {
    if (err.message === 'STRIPE_NO_CONFIGURADO') {
      showToast('El pago todavía no está activado: falta configurar la cuenta de Stripe.');
    } else if (err.message === 'SIN_PLAZAS') {
      showToast('Esa sesión ya no tiene plazas suficientes. Elige otra.');
      renderCalendar();
    } else {
      showToast(err.message);
    }
    payButton.disabled = false;
  }
});

/* ---- Init ---- */
setModalidad(new URLSearchParams(location.search).get('taller') === 'customiza' ? 'customiza' : 'crea');
fetchAvailability(iso(nowY, nowM, 1), MAX_DATE);
