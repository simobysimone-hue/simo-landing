import { json, stripeGet, enviarConfirmacion } from './_shared.mjs';

export default async (req) => {
  try {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!process.env.STRIPE_SECRET_KEY || !id) return json({ estado: 'desconocido' });
    let s;
    try { s = await stripeGet(`checkout/sessions/${encodeURIComponent(id)}`); }
    catch { return json({ estado: 'desconocido' }); }
    if (s.payment_status === 'paid') {
      const piId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
      await enviarConfirmacion({ session: s, piId }).catch(e => console.error('Email falló:', e.message));
    }
    return json({
      estado: s.payment_status,
      fecha: s.metadata?.fecha || null,
      personas: Number(s.metadata?.personas || 0),
      modalidad: s.metadata?.modalidad || null,
      importe: s.payment_status === 'paid' ? (s.amount_total || 0) / 100 : 0
    });
  } catch (e) {
    console.error('confirmar:', e.message);
    return json({ estado: 'desconocido' });
  }
};
export const config = { path: '/api/confirmar' };
