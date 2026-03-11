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
const avatar = config.avatar || "";

let lang = navigator.language && navigator.language.startsWith("es") ? "es" : "en";

/* ------------------------------------------------ */
/* LANGUAGE DETECTION FROM USER INPUT               */
/* ------------------------------------------------ */

function detectLang(text){

if(/hola|empresa|empresas|servicio|servicios|gracias|buscar|buenas/i.test(text)){
lang="es";
}

if(/hello|hi|services|company|companies|search/i.test(text)){
lang="en";
}

updateNote();
}

/* ------------------------------------------------ */
/* GREETING                                         */
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
es:`¡Hola! Soy CIRA, asistente virtual de la Cámara Petrolera de Venezuela.<br><br>
Puedo ayudarte a encontrar empresas afiliadas, servicios y datos de contacto.<br><br>
¿Qué necesitas buscar hoy?`,

en:`Hello! I'm CIRA, the virtual assistant of the Venezuelan Petroleum Chamber.<br><br>
I can help you find member companies, services and contact information.<br><br>
What would you like to search for today?`
}

};

return dict[key][lang];
}

/* ------------------------------------------------ */
/* STYLE                                            */
/* ------------------------------------------------ */

const style=document.createElement("style");

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
font-size:22px;
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

.n8n-chat-window.open{display:flex;}

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
cursor:pointer;
}

.loader{
font-style:italic;
color:#777;
display:flex;
align-items:center;
gap:8px;
}

.spinner{
width:14px;
height:14px;
border:2px solid #faa819;
border-top-color:transparent;
border-radius:50%;
animation:spin .8s linear infinite;
}

@keyframes spin{to{transform:rotate(360deg)}}

@media(max-width:480px){
.n8n-chat-window{
width:100%;
right:0;
bottom:0;
border-radius:12px 12px 0 0;
}
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

const btn=document.getElementById("chatbtn");
const win=document.getElementById("chatwin");
const msgs=document.getElementById("msgs");
const send=document.getElementById("send");
const input=document.getElementById("input");
const note=document.getElementById("note");

btn.onclick=()=>win.classList.toggle("open");

/* ------------------------------------------------ */
/* SESSION                                          */
/* ------------------------------------------------ */

let sid=localStorage.getItem("cira_sid");

if(!sid){
sid=(crypto.randomUUID?crypto.randomUUID():Date.now().toString());
localStorage.setItem("cira_sid",sid);
}

/* ------------------------------------------------ */
/* NOTE                                             */
/* ------------------------------------------------ */

function updateNote(){
note.innerHTML=t("note");
}

updateNote();

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function linkify(text){

text=text.replace(/\n/g,"<br>");

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
}

/* ------------------------------------------------ */
/* SEND                                             */
/* ------------------------------------------------ */

async function sendMsg(){

const text=input.value.trim();
if(!text) return;

detectLang(text);

addUser(text);

input.value="";

/* GREETING WITHOUT AI */

if(isGreeting(text)){
addBot(t("greeting"));
return;
}

/* LOADER */

const loader=document.createElement("div");
loader.className="row";
loader.id="loader";

loader.innerHTML=`
<img class="avatar" src="${avatar}">
<div class="msg bot loader" id="loaderText">
<div class="spinner"></div>
<span>${t("processing")}</span>
</div>
`;

msgs.appendChild(loader);

/* SLOW MESSAGE */

const slowTimer=setTimeout(()=>{

const l=document.getElementById("loaderText");

if(l){
l.innerHTML+=`<br><br>${t("slow")}`;
}

},45000);

/* CALL N8N */

try{

const r=await fetch(webhook,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
chatInput:text,
sessionId:sid
})
});

clearTimeout(slowTimer);

const data=await r.json();

const ld=document.getElementById("loader");
if(ld) ld.remove();

let reply="";

if(Array.isArray(data)){
reply=data[0]?.output || data[0]?.text;
}else{
reply=data.output || data.text;
}

/* PDF AUTO OPEN */

const pdfMatch = reply && reply.match(/https?:\/\/[^\s]+\.pdf/i);

if(pdfMatch){

window.open(pdfMatch[0],"_blank");

addBot(
lang==="es"
?"He generado el PDF solicitado. Se abrirá en una nueva ventana."
:"Your PDF is ready. It will open in a new window."
);

return;
}

addBot(reply || "No response");

}catch(e){

clearTimeout(slowTimer);

const ld=document.getElementById("loader");
if(ld) ld.remove();

addBot(lang==="es"?"Error de conexión":"Connection error");

}

}

/* ------------------------------------------------ */
/* EVENTS                                           */
/* ------------------------------------------------ */

send.onclick=sendMsg;

input.addEventListener("keypress",e=>{
if(e.key==="Enter" && !e.shiftKey){
e.preventDefault();
sendMsg();
}
});

}

})();
