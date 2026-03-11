(function () {
"use strict";

/* ------------------------------------------------ */
/* SAFE INIT                                        */
/* ------------------------------------------------ */

function ready(fn){
if(document.readyState !== "loading"){ fn(); }
else{ document.addEventListener("DOMContentLoaded",fn); }
}

ready(initWidget);

/* ------------------------------------------------ */
/* INIT                                             */
/* ------------------------------------------------ */

function initWidget(){

if(document.getElementById("n8n-chat-widget")) return;

const config = window.ChatWidgetConfig || {};
const webhook = config.webhookUrl || "";
const avatar  = config.avatar    || "";

let lang = navigator.language && navigator.language.startsWith("es") ? "es" : "en";

/* ------------------------------------------------ */
/* LANGUAGE DETECTION                               */
/* ------------------------------------------------ */

function detectLang(text){
if(/hola|empresa|empresas|servicio|servicios|gracias|buscar|buenas/i.test(text)){ lang="es"; }
if(/hello|hi|services|company|companies|search/i.test(text))                    { lang="en"; }
updateNote();
}

/* ------------------------------------------------ */
/* GREETING CHECK                                   */
/* ------------------------------------------------ */

function isGreeting(text){
return /^(hola|hello|hi|hey|buenas)/i.test(text.trim());
}

/* ------------------------------------------------ */
/* TEXT DICTIONARY                                  */
/* ------------------------------------------------ */

function t(key){
const dict={
  processing:{
    es:"Estoy procesando su consulta...",
    en:"I'm processing your request..."
  },
  slow:{
    es:"La consulta está tardando más de lo esperado. Algunas búsquedas pueden tardar hasta un minuto.",
    en:"This search is taking longer than expected. Some queries may take up to a minute."
  },
  note:{
    es:"Nota: La búsqueda detallada y generación de PDFs puede tomar unos segundos.",
    en:"Note: Detailed searches and PDF generation may take a few seconds."
  },
  greeting:{
    es:"¡Hola! Soy CIRA, asistente virtual de la Cámara Petrolera de Venezuela.<br><br>Puedo ayudarte a encontrar empresas afiliadas, servicios y datos de contacto.<br><br>¿Qué necesitas buscar hoy?",
    en:"Hello! I'm CIRA, the virtual assistant of the Venezuelan Petroleum Chamber.<br><br>I can help you find member companies, services and contact information.<br><br>What would you like to search for today?"
  }
};
return dict[key][lang];
}

/* ------------------------------------------------ */
/* STYLE                                            */
/* ------------------------------------------------ */

const style = document.createElement("style");
style.innerHTML = `
.n8n-chat-btn{
  position:fixed;bottom:20px;right:20px;
  width:60px;height:60px;border-radius:50%;
  background:#faa819;color:white;border:none;
  cursor:pointer;z-index:99999;font-size:22px;
}
.n8n-chat-window{
  position:fixed;bottom:90px;right:20px;
  width:380px;height:650px;background:white;
  border-radius:12px;box-shadow:0 5px 30px rgba(0,0,0,.15);
  display:none;flex-direction:column;overflow:hidden;z-index:99999;
}
.n8n-chat-window.open{display:flex;}
.n8n-chat-body{
  flex:1;overflow-y:auto;padding:15px;
  display:flex;flex-direction:column;gap:10px;background:#f9f9f9;
}
.msg{
  padding:12px;border-radius:10px;
  max-width:85%;font-size:14px;line-height:1.5;
}
.user{align-self:flex-end;background:#faa819;color:white;}
.bot{background:white;border:1px solid #ddd;color:#333;}
.row{display:flex;gap:8px;}
.avatar{width:28px;height:28px;border-radius:50%;}
.note{font-size:11px;color:#777;padding:8px;text-align:center;border-top:1px solid #eee;}
.footer{display:flex;padding:10px;gap:8px;border-top:1px solid #eee;}
textarea{flex:1;border-radius:20px;border:1px solid #ddd;padding:10px;resize:none;height:42px;}
button.send{width:40px;border-radius:50%;border:none;background:#faa819;color:white;cursor:pointer;}
.loader{font-style:italic;color:#777;display:flex;align-items:center;gap:8px;}
.spinner{
  width:14px;height:14px;flex-shrink:0;
  border:2px solid #faa819;border-top-color:transparent;
  border-radius:50%;animation:cira-spin .8s linear infinite;
}
@keyframes cira-spin{to{transform:rotate(360deg);}}
@keyframes cira-pulse{0%,100%{opacity:.5;}50%{opacity:1;}}
.loader span{animation:cira-pulse 1.6s ease-in-out infinite;}
@media(max-width:480px){
  .n8n-chat-window{width:100%;right:0;bottom:0;border-radius:12px 12px 0 0;}
}
`;
document.head.appendChild(style);

/* ------------------------------------------------ */
/* HTML                                             */
/* ------------------------------------------------ */

document.body.insertAdjacentHTML("beforeend",`
<div id="n8n-chat-widget">
  <button id="chatbtn" class="n8n-chat-btn">💬</button>
  <div id="chatwin" class="n8n-chat-window">
    <div id="msgs" class="n8n-chat-body">
      <div style="text-align:center">
        <img src="${avatar}" style="width:60px;border-radius:50%;margin-bottom:10px">
        <div>¡Hola! Soy CIRA</div>
      </div>
    </div>
    <div id="note" class="note"></div>
    <div class="footer">
      <textarea id="input" placeholder="Escribe tu consulta..."></textarea>
      <button id="send" class="send">➤</button>
    </div>
  </div>
</div>
`);

/* ------------------------------------------------ */
/* ELEMENTS                                         */
/* ------------------------------------------------ */

const btn   = document.getElementById("chatbtn");
const win   = document.getElementById("chatwin");
const msgs  = document.getElementById("msgs");
const send  = document.getElementById("send");
const input = document.getElementById("input");
const note  = document.getElementById("note");

btn.onclick = () => win.classList.toggle("open");

/* ------------------------------------------------ */
/* SESSION                                          */
/* ------------------------------------------------ */

let sid = localStorage.getItem("cira_sid");
if(!sid){
  sid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
  localStorage.setItem("cira_sid", sid);
}

/* ------------------------------------------------ */
/* NOTE                                             */
/* ------------------------------------------------ */

function updateNote(){ note.innerHTML = t("note"); }
updateNote();

/* ------------------------------------------------ */
/* LINKIFY                                          */
/* ------------------------------------------------ */
/*
 * CRITICAL — data: URI protection:
 * The phone regex  (\+?\d[\d\s]{7,})  matches long digit sequences.
 * A base64 string is full of them. Without protection, the regex wraps
 * chunks of the base64 payload in <a href="tel:..."> tags, corrupting
 * the href and producing a blank PDF when clicked.
 *
 * Fix: swap every  href="data:..."  out to a placeholder BEFORE the
 * phone regex runs, then restore them exactly afterwards.
 */
function linkify(text){

  /* Step 1 — protect data: URIs */
  var dataUris = [];
  text = text.replace(/href=(["'])data:[^"'\s>]+\1/g, function(match){
    var idx = dataUris.length;
    dataUris.push(match);
    return 'href="__CIRA_DATA_' + idx + '__"';
  });

  /* Step 2 — normal transforms */
  text = text.replace(/\n/g, "<br>");
  text = text.replace(
    /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g,
    '<a href="mailto:$1">$1</a>'
  );
  text = text.replace(
    /(\+?\d[\d\s]{7,})/g,
    '<a href="tel:$1">$1</a>'
  );

  /* Step 3 — restore data: URIs unchanged */
  dataUris.forEach(function(uri, i){
    text = text.replace('href="__CIRA_DATA_' + i + '__"', uri);
  });

  return text;
}

/* ------------------------------------------------ */
/* ADD USER MESSAGE                                 */
/* ------------------------------------------------ */

function addUser(text){
  var d = document.createElement("div");
  d.className = "msg user";
  d.innerHTML = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

/* ------------------------------------------------ */
/* ADD BOT MESSAGE                                  */
/* ------------------------------------------------ */
/*
 * After setting innerHTML we attach a click handler on every
 * data:text/html link because browsers block direct navigation to
 * data: URIs as a security measure.
 *
 * The handler decodes the base64 payload (UTF-8 safe via
 * atob → escape → decodeURIComponent) and writes it into a new
 * window, then triggers the browser print dialog.
 */
function addBot(text){

  var row = document.createElement("div");
  row.className = "row";
  row.innerHTML = (
    '<img class="avatar" src="' + avatar + '">' +
    '<div class="msg bot">' + linkify(text) + '</div>'
  );
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;

  /* Intercept clicks on data:text/html links */
  row.querySelectorAll('a[href^="data:text/html"]').forEach(function(a){
    a.addEventListener("click", function(e){
      e.preventDefault();

      var href = a.getAttribute("href");
      /* Remove  data:text/html;base64,  prefix (handles optional charset) */
      var b64  = href.replace(/^data:text\/html;(?:[^,]+,)?/, "");

      try {
        var bytes = atob(b64);
        var chars = "";
        for(var i = 0; i < bytes.length; i++){
          chars += String.fromCharCode(bytes.charCodeAt(i));
        }
        var html = decodeURIComponent(escape(chars));

        var w = window.open("", "_blank");
        if(w){
          w.document.open();
          w.document.write(html);
          w.document.close();
          setTimeout(function(){ w.print(); }, 1200);
        } else {
          alert(
            lang === "es"
              ? "Por favor permita ventanas emergentes para ver el reporte."
              : "Please allow popups to view the report."
          );
        }
      } catch(err){
        alert(
          (lang === "es" ? "Error al abrir el reporte: " : "Error opening report: ")
          + err.message
        );
      }
    });
  });
}

/* ------------------------------------------------ */
/* SEND                                             */
/* ------------------------------------------------ */

async function sendMsg(){

  var text = input.value.trim();
  if(!text) return;

  detectLang(text);
  addUser(text);
  input.value = "";

  /* Greetings answered locally — no n8n round-trip */
  if(isGreeting(text)){
    addBot(t("greeting"));
    return;
  }

  /* LOADER */
  var loader = document.createElement("div");
  loader.className = "row";
  loader.id = "loader";
  loader.innerHTML = (
    '<img class="avatar" src="' + avatar + '">' +
    '<div class="msg bot loader" id="loaderText">' +
    '<div class="spinner"></div>' +
    '<span>' + t("processing") + '</span>' +
    '</div>'
  );
  msgs.appendChild(loader);
  msgs.scrollTop = msgs.scrollHeight;

  /* SLOW MESSAGE at 45 s */
  var slowTimer = setTimeout(function(){
    var lt = document.getElementById("loaderText");
    if(lt){ lt.innerHTML += "<br><br>" + t("slow"); }
  }, 45000);

  /* CALL N8N */
  try {
    var r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: text, sessionId: sid })
    });

    clearTimeout(slowTimer);

    var data = await r.json();

    var ld = document.getElementById("loader");
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
    var ld2 = document.getElementById("loader");
    if(ld2) ld2.remove();
    addBot(lang === "es" ? "Error de conexión." : "Connection error.");
  }
}

/* ------------------------------------------------ */
/* EVENTS                                           */
/* ------------------------------------------------ */

send.onclick = sendMsg;

input.addEventListener("keypress", function(e){
  if(e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    sendMsg();
  }
});

} // end initWidget

})();
