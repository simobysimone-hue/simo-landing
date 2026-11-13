// Lógica compartida de las funciones SIMO para Netlify (sin estado local:
// Stripe es la fuente de verdad de reservas, plazas e idempotencia de correo).
import nodemailer from 'nodemailer';

export const ADMIN_PASSWORD = 'SIMO2026';
export const MIN_DATE = '2026-10-23';
export const MAX_DATE = '2026-12-31';

/* ---- Modalidades y calendario ----
   Desde el 20/11/2026 hay dos modalidades:
   - Crea tu SIMO: sábados 10:00–14:00, 4 h, 74,99 €, 8 plazas.
   - Customiza tu SIMO: viernes y sábados 17:00–19:30, 2 h 30 min, 54,99 €, 20 plazas.
   Antes del 20/11 se mantiene el formato antiguo (Crea tu SIMO, 17:00–20:00, 54,99 €). */
export const CAMBIO = '2026-11-20';
export const SIN_TALLER = ['2026-12-25'];
/* Sesiones cerradas a mano para nuevas reservas (salen como completas). */
export const CERRADAS = ['2026-10-31', '2026-11-13', '2026-11-14'];
export const MODALIDADES = {
  crea: { nombre: 'Crea tu SIMO' },
  customiza: { nombre: 'Customiza tu SIMO' }
};

export function lugarDe(fecha) {
  const dow = new Date(fecha + 'T12:00:00').getDay();
  return dow === 6
    ? 'Casa de las Alajas · entrada por C/ San Martín 5, Madrid'
    : 'Casa de las Alajas · entrada por C/ Hileras 18, Madrid';
}

/* Sesiones de un día (sin comprobar si es pasado). */
export function sesionesDe(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
  if (fecha < MIN_DATE || fecha > MAX_DATE || SIN_TALLER.includes(fecha)) return [];
  const dow = new Date(fecha + 'T12:00:00').getDay();
  if (fecha < CAMBIO) {
    if (dow !== 5 && dow !== 6) return [];
    return [{ modalidad: 'crea', hora: '17:00', horario: '17:00–20:00', duracion: '3 h', precio: 5499, capacidad: 8 }];
  }
  const out = [];
  if (dow === 6) out.push({ modalidad: 'crea', hora: '10:00', horario: '10:00–14:00', duracion: '4 h', precio: 7499, capacidad: 8 });
  if (dow === 5 || dow === 6) out.push({ modalidad: 'customiza', hora: '17:00', horario: '17:00–19:30', duracion: '2 h 30 min', precio: 5499, capacidad: 20 });
  return out;
}

export function sesion(fecha, modalidad) {
  return sesionesDe(fecha).find(s => s.modalidad === modalidad) || null;
}

/* Modalidad de un pago. Los pagos antiguos no la guardan: hasta el 19/11 eran Crea tu SIMO;
   las reservas antiguas de diciembre se cuentan en la sesión de tarde (Customiza) de ese día. */
export function modalidadDePago(meta) {
  if (meta?.modalidad === 'crea' || meta?.modalidad === 'customiza') return meta.modalidad;
  return (meta?.fecha || '') < CAMBIO ? 'crea' : 'customiza';
}

const KEY = () => process.env.STRIPE_SECRET_KEY || '';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export function isValidWorkshopDate(s, modalidad) {
  const ses = sesion(String(s || ''), modalidad);
  if (!ses || CERRADAS.includes(s)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(s + 'T12:00:00') >= today;
}

export async function stripePost(endpoint, params) {
  const body = new URLSearchParams();
  const add = (k, v) => {
    if (v == null) return;
    if (typeof v === 'object') { for (const [k2, v2] of Object.entries(v)) add(`${k}[${k2}]`, v2); return; }
    body.append(k, String(v));
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe HTTP ${res.status}`);
  return data;
}

export async function stripeGet(endpoint) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${KEY()}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe HTTP ${res.status}`);
  return data;
}

/* Plazas reservadas de una sesión (fecha + modalidad) = suma de los Charges exitosos con esa fecha y modalidad.
   En live, los cobros son Charges, no PaymentIntents. */
export async function plazasReservadas(fecha, modalidad) {
  try {
    const charges = await stripeGet(`charges?limit=100`);
    const seen = new Set();
    let total = 0;
    for (const ch of charges.data || []) {
      if (ch.status !== 'succeeded') continue;
      if (ch.amount_refunded) continue;
      const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
      if (!piId || seen.has(piId)) continue;
      seen.add(piId);
      const pi = await stripeGet(`payment_intents/${piId}`);
      if (pi.metadata?.fecha !== fecha) continue;
      if (modalidadDePago(pi.metadata) !== modalidad) continue;
      total += Number(pi.metadata?.personas || 0);
    }
    return total;
  } catch (e) {
    console.error('Búsqueda de plazas falló:', e.message);
    return 0;
  }
}

/* Correo de confirmación (solo se envía una vez: marca el PI con emailed=1) */
const MAIL_USER = process.env.GMAIL_USER || '';
const MAIL_PASS = process.env.GMAIL_APP_PASSWORD || '';
const mailer = MAIL_USER && MAIL_PASS
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: MAIL_USER, pass: MAIL_PASS } })
  : null;

export async function enviarConfirmacion({ session, piId }) {
  if (!mailer) { console.log('Email omitido: falta GMAIL_APP_PASSWORD'); return false; }
  if (piId) {
    try {
      const pi = await stripeGet(`payment_intents/${piId}`);
      if (pi.metadata?.emailed === '1') return false; // ya enviado
    } catch { /* seguimos */ }
  }
  const fecha = session.metadata?.fecha;
  const personas = Number(session.metadata?.personas || 0);
  const nombre = session.metadata?.nombre || '';
  const email = session.customer_email || session.customer_details?.email || '';
  if (!fecha || !email) return false;
  const d = new Date(fecha + 'T12:00:00');
  const fechaLarga = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const modalidad = modalidadDePago(session.metadata);
  const ses = sesion(fecha, modalidad) || { horario: session.metadata?.hora || '', precio: 0 };
  const taller = MODALIDADES[modalidad].nombre;
  const WORKSHOP_HOURS = ses.horario;
  const LUGAR = lugarDe(fecha);
  const total = ((session.amount_total ?? personas * ses.precio) / 100).toFixed(2).replace('.', ',');
  const incluye = modalidad === 'customiza'
    ? 'Incluye todos los materiales necesarios, ademas de vino ilimitado y picoteo. Antes del taller te escribiremos para que elijas tu bolso base.'
    : 'Todo incluido: materiales, maquinas, guias, patrones, vino ilimitado y picoteo.';
  await mailer.sendMail({
    from: `"SIMO" <${MAIL_USER}>`,
    to: email,
    subject: 'Tu plaza en el taller SIMO esta confirmada',
    text: `Hola ${nombre}:\n\nTu plaza esta confirmada.\n\nTaller: ${taller}\nFecha: ${fechaLarga}\nHorario: ${WORKSHOP_HOURS}\nLugar: ${LUGAR}\nPlazas: ${personas}\nTotal pagado: ${total} EUR\n\n${incluye}\n\nNos vemos en el taller.\nSIMO · Madrid`,
    html: `<div style="font-family:Georgia,serif;color:#101012;max-width:520px;margin:auto;padding:32px"><h1 style="font-size:26px;letter-spacing:.04em">SIMO</h1><p>Hola ${nombre}:</p><p><strong>Tu plaza esta confirmada.</strong></p><table style="font-size:15px;line-height:1.7"><tr><td>Taller</td><td>&nbsp;&nbsp;<strong>${taller}</strong></td></tr><tr><td>Fecha</td><td>&nbsp;&nbsp;<strong>${fechaLarga}</strong></td></tr><tr><td>Horario</td><td>&nbsp;&nbsp;${WORKSHOP_HOURS}</td></tr><tr><td>Lugar</td><td>&nbsp;&nbsp;${LUGAR}</td></tr><tr><td>Plazas</td><td>&nbsp;&nbsp;${personas}</td></tr><tr><td>Total pagado</td><td>&nbsp;&nbsp;<strong>${total} EUR</strong></td></tr></table><p style="font-size:14px;color:#555">${incluye}</p><p style="font-size:14px">Nos vemos en el taller.<br><em>SIMO · Madrid</em></p></div>`
  });
  if (piId) {
    try { await stripePost(`payment_intents/${piId}`, { metadata: { emailed: '1' } }); } catch {}
  }
  console.log(`Email enviado a ${email}`);
  return true;
}
