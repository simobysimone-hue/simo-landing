import { json, stripeGet, modalidadDePago } from './_shared.mjs';

export default async (req) => {
  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get('desde') || '';
    const hasta = url.searchParams.get('hasta') || '';
    if (!process.env.STRIPE_SECRET_KEY) return json([]);

    // En live, los cobros son Charges. Buscamos los del SIMO (54,99€ * personas)
    // y extraemos la fecha del metadata del payment_intent asociado.
    const r = await stripeGet(`charges?limit=100`);
    const seen = new Set();
    const rows = {};
    for (const ch of r.data || []) {
      if (ch.status !== 'succeeded') continue;
      if (ch.amount_refunded) continue;       // ignorar devoluciones
      const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
      if (!piId) continue;
      if (seen.has(piId)) continue;
      seen.add(piId);
      // Traemos el PI para leer su metadata (fecha, personas, session_id)
      const pi = await stripeGet(`payment_intents/${piId}`);
      const fecha = pi.metadata?.fecha;
      if (!fecha) continue;
      if (desde && fecha < desde) continue;
      if (hasta && fecha > hasta) continue;
      const key = fecha + '|' + modalidadDePago(pi.metadata);
      rows[key] = (rows[key] || 0) + Number(pi.metadata?.personas || 0);
    }
    return json(Object.entries(rows).map(([key, reservadas]) => {
      const [fecha, modalidad] = key.split('|');
      return { fecha, modalidad, reservadas };
    }));
  } catch (e) {
    console.error('disponibilidad:', e.message);
    return json([], 500);
  }
};
export const config = { path: '/api/disponibilidad' };
