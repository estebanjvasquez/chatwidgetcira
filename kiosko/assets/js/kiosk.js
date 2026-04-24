/* ================================================================
   CIRA KIOSK — Navegación y utilidades compartidas
   La animación de entrada (pageIn) está en kiosk.css y funciona
   sin JS, eliminando la página en blanco durante la carga.
   ================================================================ */
(function () {
  'use strict';

  /* ── Transición de salida al navegar ─────────────────────────── */
  function _navigateTo(url) {
    document.body.classList.add('page-exit');
    setTimeout(function () { window.location.href = url; }, 260);
  }

  /* Intercepta enlaces internos para aplicar fade-out */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('http') ||
      link.getAttribute('target') === '_blank'
    ) return;

    e.preventDefault();
    _navigateTo(href);
  });

  /* ── Anti-zoom táctil (kiosko público) ──────────────────────── */
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  var _lastTap = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - _lastTap < 280) e.preventDefault();
    _lastTap = now;
  }, { passive: false });

  /* ── API global de navegación ────────────────────────────────── */
  window.KioskNav = {
    goTo: _navigateTo,
    home: function () { _navigateTo('index.html'); },
    bot:  function () { _navigateTo('bot.html');   },
    help: function () { _navigateTo('ayuda.html'); }
  };
}());
