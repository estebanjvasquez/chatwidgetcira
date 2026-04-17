(function () {
"use strict";

function ready(fn){
  if(document.readyState !== "loading"){ fn(); }
  else{ document.addEventListener("DOMContentLoaded", fn); }
}

ready(initWidget);

function initWidget(){

  if(document.getElementById("n8n-chat-widget")) return;

  var config         = window.ChatWidgetConfig || {};
  var webhook        = config.webhookUrl      || "";
  var avatar         = config.avatar          || "";
  var primaryColor   = (config.style && config.style.primaryColor) || "#faa819";

  var mode           = (config.mode || "bubble").toLowerCase();
  var mountSelector  = config.mountSelector || "";
  var isInline       = (mode === "inline");

  var mountEl = null;
  if(isInline){
    mountEl = mountSelector ? document.querySelector(mountSelector) : null;
    if(!mountEl){
      console.warn("[CIRA Widget] inline mode: mountSelector '" + mountSelector + "' not found. Falling back to bubble.");
      isInline = false;
    }
  }

  var lang = navigator.language && navigator.language.startsWith("es") ? "es" : "en";

  function detectLang(text){
    if(/hola|empresa|empresas|servicio|servicios|gracias|buscar|buenas/i.test(text)){ lang = "es"; }
    if(/hello|hi|services|company|companies|search/i.test(text))                    { lang = "en"; }
    updateNote();
  }

  function isGreeting(text){
    return /^(hola|hello|hi|hey|buenas)/i.test(text.trim());
  }

  function t(key){
    var dict = {
      processing:{
        es: "Estoy procesando su consulta...",
        en: "I'm processing your request..."
      },
      slow:{
        es: "La consulta está tardando más de lo esperado. Algunas búsquedas pueden tardar mas de un minuto.",
        en: "This search is taking longer than expected. Some queries may take up to a minute."
      },
      note:{
        es: "Nota: La búsqueda detallada puede tomar unos segundos.",
        en: "Note: Detailed searches may take a few seconds."
      },
      greeting:{
        es: "¡Hola! Soy CIRA, asistente virtual de la Cámara Petrolera de Venezuela.<br><br>Puedo ayudarte a encontrar empresas afiliadas, servicios y datos de contacto.<br><br>¿Qué necesitas buscar hoy?",
        en: "Hello! I'm CIRA, the virtual assistant of the Venezuelan Petroleum Chamber.<br><br>I can help you find member companies, services and contact information.<br><br>What would you like to search for today?"
      },
      placeholder:{
        es: "Escribe tu consulta...",
        en: "Type your query..."
      }
    };
    return dict[key][lang];
  }

  var pc  = primaryColor;
  var pc8 = primaryColor + "14";

  var sharedCSS = [
    ".cira-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f9f9f9;}",
    ".cira-msg{padding:11px 14px;border-radius:10px;max-width:85%;font-size:14px;line-height:1.55;word-break:break-word;}",
    ".cira-user{align-self:flex-end;background:" + pc + ";color:#fff;}",
    ".cira-bot{background:#fff;border:1px solid #e0e0e0;color:#333;}",
    ".cira-row{display:flex;gap:8px;align-items:flex-start;}",
    ".cira-avatar{width:28px;height:28px;border-radius:50%;flex-shrink:0;}",
    ".cira-note{font-size:11px;color:#888;padding:6px 12px;text-align:center;border-top:1px solid #eee;background:#fff;}",
    ".cira-footer{display:flex;padding:10px;gap:8px;border-top:1px solid #eee;background:#fff;}",
    ".cira-textarea{flex:1;border-radius:20px;border:1px solid #ddd;padding:9px 14px;resize:none;height:42px;font-size:14px;font-family:inherit;outline:none;transition:border-color .2s;}",
    ".cira-textarea:focus{border-color:" + pc + ";}",
    ".cira-send{width:40px;height:40px;border-radius:50%;border:none;background:" + pc + ";color:#fff;cursor:pointer;font-size:16px;flex-shrink:0;transition:opacity .15s;}",
    ".cira-send:hover{opacity:.85;}",
    ".cira-loader{font-style:italic;color:#888;display:flex;align-items:center;gap:8px;}",
    ".cira-spinner{width:14px;height:14px;flex-shrink:0;border:2px solid " + pc + ";border-top-color:transparent;border-radius:50%;animation:cira-spin .8s linear infinite;}",
    "@keyframes cira-spin{to{transform:rotate(360deg);}}",
    "@keyframes cira-pulse{0%,100%{opacity:.45;}50%{opacity:1;}}",
    ".cira-loader span{animation:cira-pulse 1.6s ease-in-out infinite;}"
  ].join("\n");

  var bubbleCSS = [
    ".cira-bubble-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:" + pc + ";color:#fff;border:none;cursor:pointer;z-index:99999;font-size:24px;box-shadow:0 4px 16px rgba(0,0,0,.22);transition:transform .15s;}",
    ".cira-bubble-btn:hover{transform:scale(1.07);}",
    ".cira-bubble-win{position:fixed;bottom:90px;right:20px;width:380px;height:650px;background:#fff;border-radius:14px;box-shadow:0 8px 36px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;z-index:99999;}",
    ".cira-bubble-win.cira-open{display:flex;}",
    ".cira-bubble-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:" + pc + ";color:#fff;}",
    ".cira-bubble-header img{width:36px;height:36px;border-radius:50%;border:2px solid rgba(255,255,255,.5);}",
    ".cira-bubble-header-name{font-weight:700;font-size:15px;}",
    ".cira-bubble-header-sub{font-size:11px;opacity:.85;}",
    ".cira-bubble-close{margin-left:auto;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;opacity:.8;}",
    ".cira-bubble-close:hover{opacity:1;}",
    "@media(max-width:480px){",
    "  .cira-bubble-win{width:100%;right:0;bottom:0;border-radius:14px 14px 0 0;height:75vh;}",
    "}"
  ].join("\n");

  var inlineCSS = [
    ".cira-inline-shell{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);background:#fff;}",
    ".cira-inline-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:" + pc + ";color:#fff;flex-shrink:0;}",
    ".cira-inline-header img{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.45);}",
    ".cira-inline-header-name{font-weight:700;font-size:15px;}",
    ".cira-inline-header-sub{font-size:11px;opacity:.85;}"
  ].join("\n");

  var styleEl = document.createElement("style");
  styleEl.innerHTML = sharedCSS + "\n" + (isInline ? inlineCSS : bubbleCSS);
  document.head.appendChild(styleEl);

  function buildBubbleHTML(){
    return (
      '<button id="cira-btn" class="cira-bubble-btn" title="CIRA">💬</button>' +
      '<div id="cira-win" class="cira-bubble-win">' +
        '<div class="cira-bubble-header">' +
          '<img src="' + avatar + '" alt="CIRA">' +
          '<div>' +
            '<div class="cira-bubble-header-name">CIRA</div>' +
            '<div class="cira-bubble-header-sub">Cámara Petrolera de Venezuela</div>' +
          '</div>' +
          '<button class="cira-bubble-close" id="cira-close" title="Cerrar">✕</button>' +
        '</div>' +
        '<div id="cira-msgs" class="cira-body">' + welcomeBlock() + '</div>' +
        '<div id="cira-note" class="cira-note"></div>' +
        '<div class="cira-footer">' +
          '<textarea id="cira-input" class="cira-textarea" rows="1" placeholder="' + t("placeholder") + '"></textarea>' +
          '<button id="cira-send" class="cira-send">&#10148;</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildInlineHTML(){
    return (
      '<div class="cira-inline-shell">' +
        '<div class="cira-inline-header">' +
          '<img src="' + avatar + '" alt="CIRA">' +
          '<div>' +
            '<div class="cira-inline-header-name">CIRA</div>' +
            '<div class="cira-inline-header-sub">Cámara Petrolera de Venezuela</div>' +
          '</div>' +
        '</div>' +
        '<div id="cira-msgs" class="cira-body">' + welcomeBlock() + '</div>' +
        '<div id="cira-note" class="cira-note"></div>' +
        '<div class="cira-footer">' +
          '<textarea id="cira-input" class="cira-textarea" rows="1" placeholder="' + t("placeholder") + '"></textarea>' +
          '<button id="cira-send" class="cira-send">&#10148;</button>' +
        '</div>' +
      '</div>'
    );
  }

  function welcomeBlock(){
    return (
      '<div style="text-align:center;padding:10px 0">' +
        '<img src="' + avatar + '" style="width:56px;border-radius:50%;margin-bottom:8px">' +
        '<div style="font-weight:600;color:#555">¡Hola! Soy CIRA</div>' +
      '</div>'
    );
  }

  var wrapper = document.createElement("div");
  wrapper.id  = "n8n-chat-widget";

  if(isInline){
    mountEl.style.position = mountEl.style.position || "relative";
    wrapper.style.cssText  = "width:100%;height:100%;";
    wrapper.innerHTML      = buildInlineHTML();
    mountEl.appendChild(wrapper);
  } else {
    wrapper.innerHTML = buildBubbleHTML();
    document.body.appendChild(wrapper);
  }

  var win   = document.getElementById("cira-win");
  var msgs  = document.getElementById("cira-msgs");
  var send  = document.getElementById("cira-send");
  var input = document.getElementById("cira-input");
  var note  = document.getElementById("cira-note");

  if(!isInline){
    var btn   = document.getElementById("cira-btn");
    var close = document.getElementById("cira-close");
    btn.onclick   = function(){ win.classList.toggle("cira-open"); };
    close.onclick = function(){ win.classList.remove("cira-open"); };
  }

  var sid = localStorage.getItem("cira_sid");
  if(!sid){
    sid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
    localStorage.setItem("cira_sid", sid);
  }

  function updateNote(){ note.innerHTML = t("note"); }
  updateNote();

  function linkify(text){
    var dataUris = [];
    text = text.replace(/href=(["'])data:[^"'\s>]+\1/g, function(match){
      var idx = dataUris.length;
      dataUris.push(match);
      return 'href="__CIRA_DATA_' + idx + '__"';
    });
    text = text.replace(/\n/g, "<br>");
    text = text.replace(
      /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g,
      '<a href="mailto:$1" style="color:' + pc + '">$1</a>'
    );
    text = text.replace(
      /(\+?\d[\d\s]{7,})/g,
      '<a href="tel:$1" style="color:' + pc + '">$1</a>'
    );
    dataUris.forEach(function(uri, i){
      text = text.replace('href="__CIRA_DATA_' + i + '__"', uri);
    });
    return text;
  }

  function addUser(text){
    var d = document.createElement("div");
    d.className = "cira-msg cira-user";
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addBot(text){
    var row = document.createElement("div");
    row.className = "cira-row";
    row.innerHTML = (
      '<img class="cira-avatar" src="' + avatar + '" alt="">' +
      '<div class="cira-msg cira-bot">' + linkify(text) + '</div>'
    );
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ------------------------------------------------ */
  /* CORE SEND FUNCTION                               */
  /* ------------------------------------------------ */

  async function sendMsg(text){

    /* Allow call with explicit text (from sendPrompt) or read from input */
    if(typeof text !== "string" || !text){
      text = input.value.trim();
    }
    if(!text) return;

    detectLang(text);
    addUser(text);
    input.value = "";
    input.style.height = "42px";

    if(isGreeting(text)){
      addBot(t("greeting"));
      return;
    }

    var loader = document.createElement("div");
    loader.className = "cira-row";
    loader.id = "cira-loader";
    loader.innerHTML = (
      '<img class="cira-avatar" src="' + avatar + '" alt="">' +
      '<div class="cira-msg cira-bot cira-loader" id="cira-loader-text">' +
        '<div class="cira-spinner"></div>' +
        '<span>' + t("processing") + '</span>' +
      '</div>'
    );
    msgs.appendChild(loader);
    msgs.scrollTop = msgs.scrollHeight;

    var slowTimer = setTimeout(function(){
      var lt = document.getElementById("cira-loader-text");
      if(lt){ lt.innerHTML += "<br><br>" + t("slow"); }
    }, 45000);

    try {
      var r = await fetch(webhook, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chatInput: text, sessionId: sid })
      });

      clearTimeout(slowTimer);

      var data  = await r.json();
      var ld    = document.getElementById("cira-loader");
      if(ld) ld.remove();

      var reply = "";
      if(Array.isArray(data)){
        reply = data[0] && (data[0].output || data[0].text);
      } else {
        reply = data.output || data.text;
      }

      addBot(reply || (lang === "es" ? "Sin respuesta." : "No response."));

    } catch(e){
      clearTimeout(slowTimer);
      var ld2 = document.getElementById("cira-loader");
      if(ld2) ld2.remove();
      addBot(lang === "es" ? "Error de conexión." : "Connection error.");
    }
  }

  /* ------------------------------------------------ */
  /* sendPrompt — GLOBAL BRIDGE                       */
  /* Called from onclick inside bot HTML cards        */
  /* ------------------------------------------------ */

  window.sendPrompt = function(text){
    if(!text || typeof text !== "string") return;
    /* Scroll chat to bottom so user sees the new query and response */
    msgs.scrollTop = msgs.scrollHeight;
    sendMsg(text);
  };

  /* ------------------------------------------------ */
  /* AUTO-GROW TEXTAREA                               */
  /* ------------------------------------------------ */

  input.addEventListener("input", function(){
    this.style.height = "42px";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  /* ------------------------------------------------ */
  /* EVENTS                                           */
  /* ------------------------------------------------ */

  send.onclick = function(){ sendMsg(); };

  input.addEventListener("keypress", function(e){
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      sendMsg();
    }
  });

} // end initWidget

})();
