/* ================================================================
   CIRA KIOSK — Navegación y utilidades compartidas
   ================================================================ */
(function () {
  'use strict';

  /* ── Transición de entrada (fade-in al cargar) ───────────────── */
  document.documentElement.style.opacity = '0';
  document.documentElement.style.transition = 'opacity 380ms ease';

  function _onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  _onReady(function () {
    requestAnimationFrame(function () {
      document.documentElement.style.opacity = '1';
    });
  });

  /* ── Transición de salida (fade-out antes de navegar) ────────── */
  function _navigateTo(url) {
    document.documentElement.style.opacity = '0';
    setTimeout(function () {
      window.location.href = url;
    }, 360);
  }

  /* Intercepta todos los enlaces internos para aplicar la transición */
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
  /* Bloquea pinch-zoom */
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  /* Bloquea doble-tap zoom */
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
