'use strict';
/* ---- Aviso de cookies + píxel de Meta ----
   El píxel solo se carga si la persona pulsa «Aceptar». Si rechaza o no responde, no se carga nada.
   La elección se guarda en localStorage (simo-consent = 'si' | 'no') y se puede cambiar
   con cualquier enlace que tenga data-cookies (por ejemplo «Configurar cookies» en el pie). */
(function () {
  const PIXEL_ID = '1837897990578065'; // Píxel SIMO Talleres (Administrador de eventos de Meta)
  const KEY = 'simo-consent';
  const cola = [];

  function leer() { try { return localStorage.getItem(KEY); } catch { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch { /* modo privado */ } }

  function cargarPixel() {
    if (window.fbq) return;
    /* Código base oficial del píxel de Meta */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    cola.splice(0).forEach(([evento, datos, opciones]) => window.fbq('track', evento, datos, opciones));
  }

  /* Las páginas llaman a simoTrack('Purchase', {...}). Si aún no hay consentimiento, el evento espera
     en la cola y solo se envía si la persona acepta en esta misma página. */
  window.simoTrack = function (evento, datos = {}, opciones = {}) {
    if (window.fbq) window.fbq('track', evento, datos, opciones);
    else cola.push([evento, datos, opciones]);
  };

  function cerrar(el) { if (el) el.remove(); }

  function mostrarAviso() {
    if (document.getElementById('cookie-banner')) return;
    const el = document.createElement('div');
    el.id = 'cookie-banner';
    el.className = 'cookie-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Aviso de cookies');
    el.innerHTML = `
      <p>Usamos cookies de Meta (Instagram y Facebook) para saber qué anuncios traen reservas y mostrar los talleres a quien le puedan interesar. Solo se activan si las aceptas. <a href="cookies.html">Más información</a></p>
      <div class="cookie-actions">
        <button type="button" class="btn btn-ghost" data-consent="no">Rechazar</button>
        <button type="button" class="btn btn-red" data-consent="si">Aceptar</button>
      </div>`;
    el.querySelectorAll('[data-consent]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.consent;
      guardar(v);
      cerrar(el);
      if (v === 'si') cargarPixel();
      else if (window.fbq) { window.fbq('consent', 'revoke'); location.reload(); }
    }));
    document.body.append(el);
  }

  function init() {
    document.querySelectorAll('[data-cookies]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); mostrarAviso(); }));
    const c = leer();
    if (c === 'si') cargarPixel();
    else if (c !== 'no') mostrarAviso();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
