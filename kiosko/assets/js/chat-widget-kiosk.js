/* ================================================================
   CIRA KIOSK — Chat Widget (versión local, sin CDN)
   Adaptado de chat-widget-v2.js para uso en kiosko:
     - Solo modo inline
     - Sesión fresca por visita (no persiste en localStorage)
     - Expone window.CiraKiosk.reset() para el idle manager
     - Expone window.sendPrompt() para las tarjetas del bot
   ================================================================ */
(function () {
  'use strict';

  /* ── Configuración ───────────────────────────────────────────── */
  var cfg     = window.ChatWidgetConfig || {};
  var WEBHOOK = cfg.webhookUrl || '';
  var AVATAR  = cfg.avatar    || '';
  var PRIMARY = (cfg.style && cfg.style.primaryColor) || '#faa819';
  var MOUNT   = cfg.mountSelector || '#cira-chat-kiosk';

  /* ── Estado ──────────────────────────────────────────────────── */
  var lang      = /^es/i.test(navigator.language) ? 'es' : 'en';
  var sessionId = null;
  var isSending = false;
  var slowTimer = null;

  /* ── Internacionalización ────────────────────────────────────── */
  var i18n = {
    es: {
      placeholder: 'Escribe tu consulta aquí...',
      send:        'Enviar',
      greeting:    '¡Hola! Soy <strong>CIRA</strong>, el asistente virtual de la ' +
                   '<strong>Cámara Petrolera de Venezuela</strong>.<br>' +
                   'Puedo ayudarte a encontrar empresas, servicios y sectores del ' +
                   'sector petrolero venezolano. ¿En qué te puedo ayudar hoy?',
      processing:  'Procesando tu consulta…',
      slow:        'La búsqueda está tardando más de lo habitual. Por favor espera un momento…',
      error:       'Hubo un problema al procesar tu solicitud. Por favor intenta de nuevo.',
      welcome_name:'CIRA — Asistente Virtual CPV'
    },
    en: {
      placeholder: 'Type your query here...',
      send:        'Send',
      greeting:    'Hello! I\'m <strong>CIRA</strong>, the virtual assistant of the ' +
                   '<strong>Venezuelan Petroleum Chamber</strong>.<br>' +
                   'I can help you find companies, services and sectors in the Venezuelan ' +
                   'oil industry. How can I help you today?',
      processing:  'Processing your query…',
      slow:        'The search is taking longer than expected. Please wait a moment…',
      error:       'There was a problem processing your request. Please try again.',
      welcome_name:'CIRA — Virtual Assistant CPV'
    }
  };

  function t(key) {
    return (i18n[lang] || i18n.es)[key] || key;
  }

  /* ── Detección de idioma ─────────────────────────────────────── */
  var RE_ES = /\b(hola|empresa|servicio|gracias|buscar|buenas|d[oó]nde|c[oó]mo|qu[eé]|qui[eé]n|necesito|lista|sector|ciudad)\b/i;
  var RE_EN = /\b(hello|hi|company|services|search|where|how|what|who|need|list|sector|city)\b/i;

  function detectLang(text) {
    if (RE_ES.test(text))      lang = 'es';
    else if (RE_EN.test(text)) lang = 'en';
  }

  /* ── Detección de saludo (respuesta local, sin webhook) ──────── */
  var RE_GREET = /^(hola|hello|hi|hey|buenas(\s*(tardes|d[ií]as|noches))?)[\s!¡.,]*$/i;

  function isGreeting(text) {
    return RE_GREET.test(text.trim()) && text.trim().split(/\s+/).length <= 3;
  }

  /* ── Linkify seguro (solo opera en nodos de texto) ───────────── */
  function linkify(html) {
    return html.replace(/(<[^>]+>)|([^<]+)/g, function (match, tag, text) {
      if (tag)   return tag;
      if (!text) return match;

      /* Emails */
      text = text.replace(
        /\b([a-zA-Z0-9._+\-]+@[a-zA-Z0-9._\-]+\.[a-zA-Z]{2,})\b/g,
        '<a href="mailto:$1" style="color:' + PRIMARY + ';text-decoration:underline">$1</a>'
      );

      /* Teléfonos: +? seguido de 7+ dígitos con separadores opcionales */
      text = text.replace(
        /\+?\d[\d\s\-().]{6,}\d/g,
        function (m) {
          var clean = m.replace(/[\s\-().]/g, '');
          return '<a href="tel:' + clean + '" style="color:' + PRIMARY + '">' + m + '</a>';
        }
      );

      return text;
    });
  }

  /* ── Escape HTML para mensajes del usuario ───────────────────── */
  function esc(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Sesión fresca por visita ────────────────────────────────── */
  function newSession() {
    sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'ks-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  /* ── Refs del DOM ────────────────────────────────────────────── */
  var bodyEl, inputEl, sendEl, spinnerEl;

  /* ── Inyección de estilos del widget ─────────────────────────── */
  function injectCSS() {
    var s = document.createElement('style');
    s.id  = 'ck-styles';
    s.textContent = [
      /* Shell principal */
      '.ck-shell{display:flex;flex-direction:column;height:100%;background:#0d1117;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Arial,sans-serif;',
      'overflow:hidden;}',

      /* Área de mensajes */
      '.ck-body{flex:1;overflow-y:auto;padding:20px 22px;display:flex;',
      'flex-direction:column;gap:14px;scroll-behavior:smooth;',
      'scrollbar-width:thin;scrollbar-color:rgba(250,168,25,.28) transparent;}',
      '.ck-body::-webkit-scrollbar{width:5px;}',
      '.ck-body::-webkit-scrollbar-thumb{background:rgba(250,168,25,.28);border-radius:3px;}',

      /* Pie con input */
      '.ck-foot{padding:14px 18px;background:#1e293b;',
      'border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;}',
      '.ck-input-row{display:flex;align-items:flex-end;gap:10px;}',
      '.ck-textarea{flex:1;background:#0f172a;border:2px solid rgba(255,255,255,.1);',
      'border-radius:14px;color:#f1f5f9;font-size:1.05rem;padding:13px 16px;',
      'resize:none;outline:none;min-height:50px;max-height:128px;',
      'line-height:1.5;font-family:inherit;transition:border-color 180ms;}',
      '.ck-textarea:focus{border-color:' + PRIMARY + ';}',
      '.ck-textarea::placeholder{color:rgba(255,255,255,.3);}',

      /* Botón enviar */
      '.ck-send{width:50px;height:50px;border-radius:50%;background:' + PRIMARY + ';',
      'border:none;color:#111;cursor:pointer;display:flex;align-items:center;',
      'justify-content:center;flex-shrink:0;transition:transform 150ms,background 150ms;',
      '-webkit-tap-highlight-color:transparent;}',
      '.ck-send:active{transform:scale(.92);background:#d4890c;}',
      '.ck-send:disabled{opacity:.45;cursor:not-allowed;}',
      '.ck-send svg{pointer-events:none;}',

      /* Burbuja de bienvenida */
      '.ck-welcome{display:flex;flex-direction:column;align-items:center;gap:12px;',
      'padding:18px 0 6px;text-align:center;}',
      '.ck-welcome-avatar{width:76px;height:76px;border-radius:50%;object-fit:cover;',
      'border:3px solid ' + PRIMARY + ';box-shadow:0 0 22px rgba(250,168,25,.22);}',
      '.ck-welcome-name{font-size:1.05rem;font-weight:700;color:#f1f5f9;}',
      '.ck-welcome-text{font-size:.98rem;color:#94a3b8;line-height:1.65;max-width:480px;}',
      '.ck-welcome-text strong{color:#f1f5f9;}',

      /* Mensajes */
      '.ck-row{display:flex;gap:8px;align-items:flex-end;max-width:88%;}',
      '.ck-row.ck-user{align-self:flex-end;flex-direction:row-reverse;max-width:78%;}',
      '.ck-avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;',
      'flex-shrink:0;border:2px solid ' + PRIMARY + ';}',
      '.ck-bubble{padding:13px 17px;border-radius:18px;font-size:1.05rem;',
      'line-height:1.65;word-wrap:break-word;overflow-wrap:break-word;}',
      '.ck-bot-bub{background:#1e293b;color:#f1f5f9;',
      'border:1px solid rgba(255,255,255,.07);border-bottom-left-radius:4px;}',
      '.ck-usr-bub{background:' + PRIMARY + ';color:#111;font-weight:500;',
      'border-bottom-right-radius:4px;}',
      '.ck-bubble a{color:' + PRIMARY + ';}',
      '.ck-usr-bub a{color:#111;text-decoration:underline;}',

      /* Spinner */
      '.ck-spin-row{display:flex;gap:8px;align-items:center;max-width:88%;}',
      '.ck-spin-bub{background:#1e293b;border:1px solid rgba(255,255,255,.07);',
      'border-radius:18px;border-bottom-left-radius:4px;',
      'padding:13px 18px;display:flex;align-items:center;gap:5px;}',
      '.ck-dot{width:8px;height:8px;background:' + PRIMARY + ';border-radius:50%;',
      'animation:ck-b 1.2s infinite ease-in-out;}',
      '.ck-dot:nth-child(2){animation-delay:.2s;}',
      '.ck-dot:nth-child(3){animation-delay:.4s;}',
      '@keyframes ck-b{0%,60%,100%{transform:translateY(0);opacity:.55;}',
      '30%{transform:translateY(-6px);opacity:1;}}',

      /* Tarjetas empresa del bot */
      '.ck-bubble .empresa-card,.ck-bubble .result-card{',
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);',
      'border-radius:10px;padding:11px 14px;margin:7px 0;}',
      '.ck-bubble .empresa-card h3,.ck-bubble .result-card h3{',
      'color:' + PRIMARY + ';font-size:.95rem;margin-bottom:4px;}',
      '.ck-bubble .empresa-card p,.ck-bubble .result-card p{',
      'font-size:.88rem;color:#94a3b8;margin:2px 0;}'
    ].join('');

    document.head.appendChild(s);
  }

  /* ── Construcción del DOM ────────────────────────────────────── */
  function buildShell() {
    return '<div class="ck-shell">' +
      '<div class="ck-body" id="ck-body"></div>' +
      '<div class="ck-foot">' +
        '<div class="ck-input-row">' +
          '<textarea class="ck-textarea" id="ck-input" ' +
            'placeholder="' + t('placeholder') + '" ' +
            'rows="1" ' +
            'aria-label="Mensaje para CIRA"></textarea>' +
          '<button class="ck-send" id="ck-send" aria-label="' + t('send') + '">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
              'stroke="currentColor" stroke-width="2.5" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="22" y1="2" x2="11" y2="13"></line>' +
              '<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Mensajes ────────────────────────────────────────────────── */
  function addWelcome() {
    var d = document.createElement('div');
    d.className = 'ck-welcome';
    d.innerHTML =
      '<img src="' + AVATAR + '" alt="CIRA" class="ck-welcome-avatar" ' +
        'onerror="this.style.display=\'none\'">' +
      '<div class="ck-welcome-name">' + t('welcome_name') + '</div>' +
      '<div class="ck-welcome-text">' + t('greeting') + '</div>';
    bodyEl.appendChild(d);
  }

  function addUser(text) {
    var row = document.createElement('div');
    row.className = 'ck-row ck-user';
    row.innerHTML = '<div class="ck-bubble ck-usr-bub">' + esc(text) + '</div>';
    bodyEl.appendChild(row);
    _scrollDown();
  }

  function addBot(html) {
    var row = document.createElement('div');
    row.className = 'ck-row';
    row.innerHTML =
      '<img src="' + AVATAR + '" alt="" class="ck-avatar" aria-hidden="true" ' +
        'onerror="this.style.display=\'none\'">' +
      '<div class="ck-bubble ck-bot-bub">' + linkify(html) + '</div>';
    bodyEl.appendChild(row);
    _scrollDown();
  }

  function showSpinner() {
    spinnerEl = document.createElement('div');
    spinnerEl.className = 'ck-spin-row';
    spinnerEl.innerHTML =
      '<img src="' + AVATAR + '" alt="" class="ck-avatar" aria-hidden="true" ' +
        'onerror="this.style.display=\'none\'">' +
      '<div class="ck-spin-bub">' +
        '<div class="ck-dot"></div>' +
        '<div class="ck-dot"></div>' +
        '<div class="ck-dot"></div>' +
      '</div>';
    bodyEl.appendChild(spinnerEl);
    _scrollDown();
  }

  function hideSpinner() {
    if (spinnerEl && spinnerEl.parentNode) {
      spinnerEl.parentNode.removeChild(spinnerEl);
    }
    spinnerEl = null;
  }

  function _scrollDown() {
    requestAnimationFrame(function () {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    });
  }

  /* ── Envío de mensaje ────────────────────────────────────────── */
  function sendMsg(explicitText) {
    if (isSending) return;
    var text = (explicitText !== undefined ? String(explicitText) : inputEl.value).trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = '';
    detectLang(text);
    addUser(text);

    /* Saludo: respuesta local, sin webhook */
    if (isGreeting(text)) {
      addBot(t('greeting'));
      return;
    }

    isSending = true;
    sendEl.disabled = true;
    showSpinner();

    /* Aviso por consulta lenta (> 45 s) */
    slowTimer = setTimeout(function () {
      addBot(t('slow'));
    }, 45000);

    fetch(WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chatInput: text, sessionId: sessionId })
    })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      clearTimeout(slowTimer);
      hideSpinner();
      var payload = Array.isArray(data) ? data[0] : data;
      var output  = (payload && payload.output) ? payload.output : '';
      if (!output) output = '<em>Sin respuesta del servidor.</em>';
      addBot(output);
    })
    .catch(function () {
      clearTimeout(slowTimer);
      hideSpinner();
      addBot(t('error'));
    })
    .finally(function () {
      isSending = false;
      sendEl.disabled = false;
      inputEl.focus();
    });
  }

  /* ── Reset (limpia chat, sesión nueva) ───────────────────────── */
  function reset() {
    clearTimeout(slowTimer);
    isSending = false;
    if (bodyEl)  bodyEl.innerHTML = '';
    if (inputEl) { inputEl.value = ''; inputEl.style.height = ''; }
    if (sendEl)  sendEl.disabled = false;
    newSession();
    lang = /^es/i.test(navigator.language) ? 'es' : 'en';
    addWelcome();
  }

  /* ── Inicialización ──────────────────────────────────────────── */
  function init() {
    var mount = document.querySelector(MOUNT);
    if (!mount) {
      console.warn('[CiraKiosk] Selector no encontrado:', MOUNT);
      return;
    }

    injectCSS();
    newSession();
    mount.innerHTML = buildShell();

    bodyEl  = document.getElementById('ck-body');
    inputEl = document.getElementById('ck-input');
    sendEl  = document.getElementById('ck-send');

    addWelcome();

    /* Eventos de input */
    sendEl.addEventListener('click', function () { sendMsg(); });

    inputEl.addEventListener('keypress', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      }
    });

    inputEl.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 128) + 'px';
    });

    /* API global */
    window.CiraKiosk  = { reset: reset, send: sendMsg };
    window.sendPrompt = sendMsg; /* compatibilidad con onclick en tarjetas del bot */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
