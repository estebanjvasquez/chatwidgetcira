(function () {
"use strict";

function initWidget(){

if(document.getElementById("n8n-chat-widget")) return;

/* CONFIG */

const config = window.ChatWidgetConfig || {};

const webhook = config.webhookUrl;

const avatar = config.avatar ||
"https://camarapetrolera.app/public/images/cirabot.png";

let lang = null;

/* LANGUAGE DETECTOR */

function detectLang(text){

if(lang) return lang;

if(/hola|buscar|empresa|empresas|servicio|servicios|gracias|saludos/i.test(text)){
lang="es";
}else{
lang="en";
}

return lang;
}

/* GREETING */

function isGreeting(text){

return /^(hola|hi|hello|hey|saludos|buenas)$/i.test(text.trim());

}

/* TEXTS */

function t(key){

const dict={

processing:{
es:"CIRA está procesando su consulta...",
en:"CIRA is processing your request..."
},

slow:{
es:"La consulta está tardando más de lo esperado. Algunas búsquedas en la base de datos pueden tomar hasta 1 minuto.",
en:"This search is taking longer than expected. Some database queries may take up to a minute."
},

note:{
es:"Nota: La búsqueda detallada y generación de PDFs puede tomar unos segundos.",
en:"Note: Detailed searches and PDF generation may take a few seconds."
},

greeting:{
es:`Hola! Soy CIRA, asistente virtual de la Cámara Petrolera de Venezuela.<br><br>
Puedo ayudarte a encontrar empresas afiliadas, servicios y datos de contacto.<br><br>
¿Qué necesitas buscar hoy?`,
en:`Hello! I'm CIRA, the virtual assistant of the Venezuelan Petroleum Chamber.<br><br>
I can help you find member companies, services and contact information.<br><br>
What would you like to search for today?`
}

};

return dict[key][lang || "es"];

}

/* STYLES */

const style = document.createElement("style");

style.innerHTML=`
.n8n-chat-btn{
position:fixed;
bottom:20px;
right:20px;
width:60px;
height:60px;
border-radius:50%;
background:#faa819;
color:white;
border:none;
cursor:pointer;
z-index:99999;
}

.n8n-chat-window{
position:fixed;
bottom:90px;
right:20px;
width:380px;
height:650px;
background:white;
border-radius:12px;
box-shadow:0 5px 30px rgba(0,0,0,.15);
display:none;
flex-direction:column;
overflow:hidden;
z-index:99999;
}

.n8n-chat-window.open{
display:flex;
}

.n8n-chat-body{
flex:1;
overflow-y:auto;
padding:15px;
display:flex;
flex-direction:column;
gap:10px;
background:#f9f9f9;
}

.msg{
padding:12px;
border-radius:10px;
max-width:85%;
font-size:14px;
line-height:1.5;
}

.user{
align-self:flex-end;
background:#faa819;
color:white;
}

.bot{
background:white;
border:1px solid #ddd;
}

.row{
display:flex;
gap:8px;
}

.avatar{
width:28px;
height:28px;
border-radius:50%;
}

.loader{
font-style:italic;
color:#777;
}

.note{
font-size:11px;
color:#777;
padding:8px;
text-align:center;
border-top:1px solid #eee;
}

.footer{
display:flex;
padding:10px;
gap:8px;
border-top:1px solid #eee;
}

textarea{
flex:1;
border-radius:20px;
border:1px solid #ddd;
padding:10px;
resize:none;
height:42px;
}

button.send{
width:40px;
border-radius:50%;
border:none;
background:#faa819;
color:white;
}
`;

document.head.appendChild(style);

/* HTML */

document.body.insertAdjacentHTML("beforeend",`

<div id="n8n-chat-widget">

<button id="chatbtn" class="n8n-chat-btn">💬</button>

<div id="chatwin" class="n8n-chat-window">

<div class="n8n-chat-body" id="msgs">

<div style="text-align:center">

<img src="${avatar}" style="width:60px;border-radius:50%;margin-bottom:10px">

<div>¡Hola! Soy CIRA</div>

</div>

</div>

<div class="footer">

<textarea id="input"></textarea>

<button class="send" id="send">➤</button>

</div>

<div class="note" id="note"></div>

</div>

</div>
`);

/* ELEMENTS */

const win=document.getElementById("chatwin");
const btn=document.getElementById("chatbtn");
const msgs=document.getElementById("msgs");
const send=document.getElementById("send");
const input=document.getElementById("input");
const note=document.getElementById("note");

btn.onclick=()=>win.classList.toggle("open");

/* SESSION */

let sid=localStorage.getItem("cira_sid")||crypto.randomUUID();
localStorage.setItem("cira_sid",sid);

/* HELPERS */

function linkify(text){

text=text.replace(/\\n/g,"<br>");

text=text.replace(
/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g,
'<a href="mailto:$1">$1</a>'
);

text=text.replace(
/(\+?\d[\d\s]{7,})/g,
'<a href="tel:$1">$1</a>'
);

return text;

}

function addUser(text){

const d=document.createElement("div");
d.className="msg user";
d.innerHTML=text;
msgs.appendChild(d);
msgs.scrollTop=msgs.scrollHeight;

}

function addBot(text){

const row=document.createElement("div");
row.className="row";

row.innerHTML=`
<img class="avatar" src="${avatar}">
<div class="msg bot">${linkify(text)}</div>
`;

msgs.appendChild(row);
msgs.scrollTop=msgs.scrollHeight;

/* Intercept data:text/html links — browsers block direct navigation to them.
   Decode the base64 payload and write it into a new window, then print. */
row.querySelectorAll('a[href^="data:text/html"]').forEach(function(a){
  a.addEventListener("click", function(e){
    e.preventDefault();
    var href = a.getAttribute("href");
    var b64  = href.replace(/^data:text\/html;(?:[^,]+,)?/, "");
    try {
      var bytes = atob(b64);
      var chars = "";
      for(var i=0;i<bytes.length;i++) chars+=String.fromCharCode(bytes.charCodeAt(i));
      var html = decodeURIComponent(escape(chars));
      var w = window.open("","_blank");
      if(w){
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(function(){ w.print(); }, 1200);
      } else {
        alert("Por favor permita ventanas emergentes para ver el reporte.\nPlease allow popups to view the report.");
      }
    } catch(err){
      alert("Error al abrir el reporte: "+err.message);
    }
  });
});

}

/* SEND */

async function sendMsg(){

const text=input.value.trim();
if(!text) return;

detectLang(text);

note.innerHTML=t("note");

addUser(text);

input.value="";

/* GREETING */

if(isGreeting(text)){

addBot(t("greeting"));

return;

}

/* LOADER */

const row=document.createElement("div");
row.className="row";
row.id="loader";

row.innerHTML=`
<img class="avatar" src="${avatar}">
<div class="msg bot loader" id="loaderText">${t("processing")}</div>
`;

msgs.appendChild(row);

msgs.scrollTop=msgs.scrollHeight;

/* SLOW MESSAGE */

const slowTimer=setTimeout(()=>{

const l=document.getElementById("loaderText");

if(l){

l.innerHTML+=`<br><br>${t("slow")}`;

}

},45000);

/* CALL MODEL */

try{

const r=await fetch(webhook,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({chatInput:text,sessionId:sid})
});

clearTimeout(slowTimer);

const data=await r.json();

let reply="";

if(Array.isArray(data)){

reply=data[0]?.output || data[0]?.text;

}else{

reply=data.output || data.text;

}

document.getElementById("loader").remove();

addBot(reply || "No response");

}catch(e){

clearTimeout(slowTimer);

document.getElementById("loader").remove();

addBot("Connection error");

}

}

/* EVENTS */

send.onclick=sendMsg;

input.addEventListener("keypress",e=>{

if(e.key==="Enter"&&!e.shiftKey){

e.preventDefault();

sendMsg();

}

});

}

/* INIT */

if(document.readyState==="loading"){

document.addEventListener("DOMContentLoaded",initWidget);

}else{

initWidget();

}

})();
