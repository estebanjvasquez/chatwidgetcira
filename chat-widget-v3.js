(function () {
"use strict";

/* ---------------- READY ---------------- */
function ready(fn){
  if(document.readyState !== "loading"){ fn(); }
  else{ document.addEventListener("DOMContentLoaded", fn); }
}

ready(initWidget);

/* ---------------- INIT ---------------- */
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
      console.warn("[CIRA Widget] inline mount not found");
      return;
    }
  }

  /* ---------------- STYLES ---------------- */
  var style = document.createElement("style");
  style.innerHTML = `
  .cira-shell{display:flex;flex-direction:column;height:100%;width:100%;background:#f7f7f8;font-family:Arial;}
  .cira-header{padding:14px;background:${primaryColor};color:#fff;display:flex;gap:10px;align-items:center;}
  .cira-header img{width:32px;height:32px;border-radius:50%;}
  .cira-body{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:14px;}
  .cira-row{display:flex;gap:10px;align-items:flex-start;}
  .cira-avatar{width:32px;height:32px;border-radius:50%;}
  .cira-msg{padding:12px 16px;border-radius:14px;max-width:75%;font-size:14px;line-height:1.6;}
  .cira-user{align-self:flex-end;background:${primaryColor};color:#fff;}
  .cira-bot{background:#fff;border:1px solid #e5e5e5;}
  .cira-footer{display:flex;padding:12px;background:#fff;border-top:1px solid #eee;}
  .cira-input{flex:1;border-radius:20px;padding:10px;border:1px solid #ddd;font-size:14px;}
  .cira-send{margin-left:8px;background:${primaryColor};color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;}
  `;
  document.head.appendChild(style);

  /* ---------------- HTML ---------------- */
  function buildInline(){
    return `
      <div class="cira-shell">
        <div class="cira-header">
          <img src="${avatar}">
          <div>CIRA</div>
        </div>
        <div id="cira-msgs" class="cira-body"></div>
        <div class="cira-footer">
          <input id="cira-input" class="cira-input" placeholder="Escribe tu mensaje..." />
          <button id="cira-send" class="cira-send">➤</button>
        </div>
      </div>
    `;
  }

  var wrapper = document.createElement("div");
  wrapper.id = "n8n-chat-widget";
  wrapper.style.height = "100%";

  if(isInline){
    wrapper.innerHTML = buildInline();
    mountEl.appendChild(wrapper);
  } else {
    return; // no tocar bubble
  }

  var msgs = document.getElementById("cira-msgs");
  var input = document.getElementById("cira-input");
  var send = document.getElementById("cira-send");

  function addUser(text){
    var el = document.createElement("div");
    el.className = "cira-msg cira-user";
    el.textContent = text;
    msgs.appendChild(el);
    scroll();
  }

  function addBotContainer(){
    var row = document.createElement("div");
    row.className = "cira-row";

    var avatarEl = document.createElement("img");
    avatarEl.src = avatar;
    avatarEl.className = "cira-avatar";

    var msg = document.createElement("div");
    msg.className = "cira-msg cira-bot";

    row.appendChild(avatarEl);
    row.appendChild(msg);

    msgs.appendChild(row);
    return msg;
  }

  function scroll(){
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: "smooth" });
  }

  async function sendMsg(){
    var text = input.value.trim();
    if(!text) return;

    addUser(text);
    input.value = "";

    var botMsg = addBotContainer();

    try{
      const response = await fetch(webhook, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ chatInput:text })
      });

      if (!response.body) {
        const data = await response.text();
        botMsg.innerHTML = data;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while(true){
        const {done, value} = await reader.read();
        if(done) break;

        const chunk = decoder.decode(value);
        botMsg.innerHTML += chunk;
        scroll();
      }

    }catch(e){
      botMsg.textContent = "Error de conexión";
    }
  }

  send.onclick = sendMsg;

  input.addEventListener("keypress", function(e){
    if(e.key === "Enter"){
      e.preventDefault();
      sendMsg();
    }
  });

}

})();
