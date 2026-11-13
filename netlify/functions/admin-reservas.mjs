import { stripeGet, json, modalidadDePago, MODALIDADES } from './_shared.mjs';

export default async (req) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe no configurado' }, 503);
    // Validar contraseña en el header 'x-admin-pass'
    const pass = req.headers.get('x-admin-pass') || '';
    if (pass !== (process.env.ADMIN_PASSWORD || 'SIMO2026')) return json({ error: 'NO_AUTORIZADO' }, 401);

    const r = await stripeGet(`charges?limit=100`);
    const seen = new Set();
    const data = [];
    for (const ch of r.data || []) {
      if (ch.status !== 'succeeded') continue;
      if (ch.amount_refunded) continue;
      const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
      if (!piId || seen.has(piId)) continue;
      seen.add(piId);
      let pi = {};
      try { pi = await stripeGet(`payment_intents/${piId}`); } catch {}
      if (!pi.metadata?.fecha) continue;
      const created = new Date((pi.created || ch.created) * 1000);
      data.push({
        id: piId,
        fecha: pi.metadata.fecha,
        modalidad: MODALIDADES[modalidadDePago(pi.metadata)].nombre,
        hora: pi.metadata.hora || '',
        personas: Number(pi.metadata.personas || 0),
        nombre: pi.metadata.nombre || '',
        email: pi.customer_email || pi.receipt_email || ch.billing_details?.email || '',
        importe: ch.amount / 100,
        creado: created.toISOString(),
        cuando: created.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
      });
    }
    data.sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado));
    return json({
      total: data.length,
      plazas: data.reduce((s, r) => s + r.personas, 0),
      ingresos: data.reduce((s, r) => s + r.importe, 0),
      reservas: data
    });
  } catch (e) {
    console.error('admin:', e.message);
    return json({ error: 'ERROR_INTERNO', detalle: e.message }, 500);
  }
};
export const config = { path: '/api/admin/reservas' };
