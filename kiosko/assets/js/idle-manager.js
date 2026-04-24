/* ================================================================
   CIRA KIOSK — Idle Manager
   Detecta inactividad y ejecuta callback tras el timeout.
   Uso:
     IdleManager.init({
       timeout:    90000,   // ms hasta ejecutar onIdle (default 90s)
       warningAt:  15000,   // ms de aviso previo al idle (default 15s)
       warningEl:  document.getElementById('idle-overlay'),
       countdownEl:document.getElementById('idle-countdown'),
       onIdle:     function() { window.location.href = 'index.html'; }
     });
   ================================================================ */
var IdleManager = (function () {
  'use strict';

  var _timeout    = 90000;
  var _warningAt  = 15000;
  var _onIdle     = null;
  var _warningEl  = null;
  var _countdownEl = null;

  var _mainTimer      = null;
  var _warnTimer      = null;
  var _countdownTick  = null;
  var _active         = false;

  var EVENTS = [
    'touchstart', 'touchmove', 'touchend',
    'pointerdown', 'pointermove',
    'mousedown', 'mousemove',
    'keydown', 'scroll', 'wheel', 'click'
  ];

  /* Oculta el overlay de aviso */
  function _hideWarning() {
    clearInterval(_countdownTick);
    if (!_warningEl) return;
    _warningEl.classList.remove('idle-visible');
    _warningEl.setAttribute('aria-hidden', 'true');
  }

  /* Muestra el overlay y arranca la cuenta regresiva */
  function _showWarning() {
    if (!_warningEl) return;
    _warningEl.classList.add('idle-visible');
    _warningEl.setAttribute('aria-hidden', 'false');

    var secs = Math.round(_warningAt / 1000);
    if (_countdownEl) _countdownEl.textContent = secs;

    _countdownTick = setInterval(function () {
      secs = Math.max(0, secs - 1);
      if (_countdownEl) _countdownEl.textContent = secs;
    }, 1000);
  }

  /* Reinicia todos los temporizadores */
  function _reset() {
    clearTimeout(_mainTimer);
    clearTimeout(_warnTimer);
    clearInterval(_countdownTick);
    _hideWarning();

    _warnTimer = setTimeout(_showWarning, _timeout - _warningAt);
    _mainTimer = setTimeout(function () {
      if (typeof _onIdle === 'function') _onIdle();
    }, _timeout);
  }

  /* ── API pública ─────────────────────────────────────── */

  /**
   * Inicializa el manager.
   * @param {object} config
   */
  function init(config) {
    config = config || {};
    _timeout     = config.timeout     || 90000;
    _warningAt   = config.warningAt   || 15000;
    _onIdle      = config.onIdle      || null;
    _warningEl   = config.warningEl   || null;
    _countdownEl = config.countdownEl || null;

    /* Clamp: el aviso no puede ser mayor que el timeout */
    if (_warningAt >= _timeout) _warningAt = Math.floor(_timeout * 0.2);

    if (!_active) {
      EVENTS.forEach(function (ev) {
        document.addEventListener(ev, _reset, { passive: true });
      });
      _active = true;
    }

    _reset();
  }

  /** Extiende la sesión (botón "Continuar" en el overlay). */
  function extend() {
    _reset();
  }

  /** Detiene el manager y remueve listeners. */
  function destroy() {
    clearTimeout(_mainTimer);
    clearTimeout(_warnTimer);
    clearInterval(_countdownTick);
    _hideWarning();
    EVENTS.forEach(function (ev) {
      document.removeEventListener(ev, _reset);
    });
    _active = false;
  }

  return { init: init, extend: extend, destroy: destroy };
}());
