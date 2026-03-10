(function() {
'use strict';

function initWidget() {

if (document.getElementById('n8n-chat-widget')) return;

/* ---------------- CONFIG ---------------- */

const config = window.ChatWidgetConfig || {
    webhookUrl: '',
    branding: { name: 'Support', welcomeText: 'Hello!' },
    style: { primaryColor: '#854fff' }
};

const CIRA_AVATAR = "https://camarapetrolera.app/public/images/cirabot.png";

/* ---------------- STYLES ---------------- */

const styles = `
.n8n-chat-widget { --chat-color: var(--n8n-color,#854fff); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; z-index:2147483647; }
.n8n-chat-widget * { box-sizing:border-box; }

.n8n-chat-btn {
position:fixed;
bottom:20px;
right:20px;
width:60px;
height:60px;
background:var(--chat-color);
border-radius:50%;
box-shadow:0 4px 15px rgba(0,0,0,0.2);
cursor:pointer;
border:none;
color:white;
display:flex;
align-items:center;
justify-content:center;
transition:transform .3s;
z-index:99999;
}

.n8n-chat-btn:hover { transform:scale(1.1); }

.n8n-chat-btn svg { width:28px;height:28px;fill:white; }

.n8n-chat-window {
position:fixed;
bottom:90px;
right:20px;
width:380px;
height:600px;
max-height:80vh;
background:white;
border-radius:12px;
box-shadow:0 5px 30px rgba(0,0,0,.15);
display:none;
flex-direction:column;
overflow:hidden;
border:1px solid #e0e0e0;
z-index:99999;
}

.n8n-chat-window.open { display:flex; }

.n8n-chat-header {
padding:16px;
background:var(--chat-color);
color:white;
display:flex;
align-items:center;
justify-content:space-between;
}

.n8n-chat-header h3 { margin:0;font-size:16px;font-weight:600; }

.n8n-chat-close {
background:none;
border:none;
color:white;
font-size:24px;
cursor:pointer;
padding:0;
line-height:1;
}

.n8n-chat-body {
flex:1;
overflow-y:auto;
padding:15px;
background:#f9f9f9;
display:flex;
flex-direction:column;
gap:10px;
}

.n8n-chat-msg {
max-width:85%;
padding:12px;
border-radius:10px;
font-size:14px;
line-height:1.5;
word-wrap:break-word;
}

.n8n-chat-msg.user {
align-self:flex-end;
background:var(--chat-color);
color:white;
border-bottom-right-radius:2px;
}

.n8n-chat-msg.bot {
background:white;
color:#333;
border:1px solid #ddd;
border-bottom-left-radius:2px;
box-shadow:0 1px 2px rgba(0,0,0,.05);
}

/* BOT ROW WITH AVATAR */

.n8n-bot-row{
display:flex;
align-items:flex-start;
gap:8px;
}

.n8n-bot-avatar{
width:28px;
height:28px;
border-radius:50%;
flex-shrink:0;
margin-top:2px;
}

/* DEBUG RAW JSON */

.n8n-chat-msg.bot code{
background:#eee;
padding:2px 4px;
border-radius:4px;
font-family:monospace;
font-size:.9em;
display:block;
white-space:pre-wrap;
word-break:break-all;
}

.n8n-chat-footer{
padding:12px;
background:white;
border-top:1px solid #eee;
display:flex;
gap:8px;
}

.n8n-chat-footer textarea{
flex:1;
border:1px solid #ddd;
border-radius:20px;
padding:10px 14px;
resize:none;
height:44px;
outline:none;
font-family:inherit;
font-size:14px;
}

.n8n-chat-footer button{
background:var(--chat-color);
color:white;
border:none;
width:40px;
height:40px;
border-radius:50%;
cursor:pointer;
display:flex;
align-items:center;
justify-content:center;
}

/* LOADER */

@keyframes cira-spin{to{transform:rotate(360deg)}}
@keyframes cira-pulse{0%,100%{opacity:.5}50%{opacity:1}}

.cira-loader-inner{display:flex;align-items:center;gap:10px;}

.cira-spinner{
width:15px;
height:15px;
min-width:15px;
border:2.5px solid var(--chat-color);
border-top-color:transparent;
border-radius:50%;
animation:cira-spin .7s linear infinite;
}

.cira-loader-inner span{
font-size:13px;
color:#888;
font-style:italic;
animation:cira-pulse 1.6s ease-in-out infinite;
}
`;

const styleSheet=document.createElement('style');
styleSheet.textContent=styles;
document.head.appendChild(styleSheet);

/* ---------------- HTML ---------------- */

const html=`
<div id="n8n-chat-widget" class="n8n-chat-widget">

<button id="n8n-btn" class="n8n-chat-btn">
<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
</button>

<div id="n8n-window" class="n8n-chat-window">

<div class="n8n-chat-header">
<h3>${config.branding.name}</h3>
<button class="n8n-chat-close">&times;</button>
</div>

<div id="n8n-messages" class="n8n-chat-body">
<div style="text-align:center;padding:20px;opacity:.6;font-size:.9em;">
${config.branding.welcomeText}
</div>
</div>

<div class="n8n-chat-footer">
<textarea id="n8n-input" placeholder="Type a message..." rows="1"></textarea>
<button id="n8n-send">➤</button>
</div>

</div>
</div>
`;

document.body.insertAdjacentHTML('beforeend',html);

document.querySelector('.n8n-chat-widget')
.style.setProperty('--n8n-color',config.style.primaryColor);

/* ---------------- ELEMENTS ---------------- */

const btn=document.getElementById('n8n-btn');
const win=document.getElementById('n8n-window');
const close=document.querySelector('.n8n-chat-close');
const msgs=document.getElementById('n8n-messages');
const input=document.getElementById('n8n-input');
const send=document.getElementById('n8n-send');

let sessionId=localStorage.getItem('n8n_sid')||crypto.randomUUID();
localStorage.setItem('n8n_sid',sessionId);

/* ---------------- UI ---------------- */

function toggle(){
win.classList.toggle('open');
if(win.classList.contains('open'))input.focus();
}

btn.addEventListener('click',toggle);
close.addEventListener('click',toggle);

/* ---------------- MESSAGE RENDER ---------------- */

function addMsg(text,type){

if(type==='bot'){

const row=document.createElement('div');
row.className='n8n-bot-row';

const avatar=document.createElement('img');
avatar.src=CIRA_AVATAR;
avatar.className='n8n-bot-avatar';

const div=document.createElement('div');
div.className='n8n-chat-msg bot';
div.innerHTML=text;

row.appendChild(avatar);
row.appendChild(div);

msgs.appendChild(row);

msgs.scrollTop=msgs.scrollHeight;

fixDataUriLinks(div);

}else{

const div=document.createElement('div');
div.className='n8n-chat-msg user';
div.innerHTML=text;

msgs.appendChild(div);
msgs.scrollTop=msgs.scrollHeight;

}

}

/* ---------------- DATA URI FIX ---------------- */

function fixDataUriLinks(container){

const links=container.querySelectorAll('a[href^="data:text/html"]');

links.forEach(function(link){

if(link.dataset.ciraFixed)return;

link.dataset.ciraFixed='1';

link.addEventListener('click',function(e){

e.preventDefault();

const w=window.open('','_blank');

if(w){

const b64=link.getAttribute('href').replace('data:text/html;charset=utf-8;base64,','');

const bytes=atob(b64);

let chars='';

for(let i=0;i<bytes.length;i++){
chars+=String.fromCharCode(bytes.charCodeAt(i));
}

const decoded=decodeURIComponent(escape(chars));

w.document.open();
w.document.write(decoded);
w.document.close();

setTimeout(()=>w.print(),1200);

}else{

alert('Por favor permita ventanas emergentes para ver el reporte.\nPlease allow popups to view the report.');

}

});

});

}

/* ---------------- SEND MESSAGE ---------------- */

async function sendMsg(){

const text=input.value.trim();

if(!text)return;

addMsg(text,'user');

input.value='';

const loaderRow=document.createElement('div');
loaderRow.className='n8n-bot-row';
loaderRow.id='n8n-loader';

const avatar=document.createElement('img');
avatar.src=CIRA_AVATAR;
avatar.className='n8n-bot-avatar';

const loader=document.createElement('div');
loader.className='n8n-chat-msg bot';

const isEnglish=/\b(hi|hello|find|search|looking|download|pdf|yes|report)\b/i.test(text);

const loadingText=isEnglish
?'CIRA is processing your query...'
:'CIRA está procesando su consulta...';

loader.innerHTML=
'<div class="cira-loader-inner"><div class="cira-spinner"></div><span>'+loadingText+'</span></div>';

loaderRow.appendChild(avatar);
loaderRow.appendChild(loader);

msgs.appendChild(loaderRow);

msgs.scrollTop=msgs.scrollHeight;

try{

const response=await fetch(config.webhookUrl,{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({chatInput:text,sessionId:sessionId})
});

const data=await response.json();

console.log("N8N DEBUG:",data);

let reply="";

if(Array.isArray(data)&&data.length>0){
reply=data[0].output||data[0].text||data[0].message;
}
else if(typeof data==='object'){
reply=data.output||data.text||data.message;
}

if(!reply){
reply=`<strong>DEBUG MODE:</strong><br>I received data but no text found.<br><code>${JSON.stringify(data,null,2)}</code>`;
}

const loader=document.getElementById('n8n-loader');
if(loader)loader.remove();

addMsg(reply,'bot');

}catch(err){

const loader=document.getElementById('n8n-loader');
if(loader)loader.remove();

addMsg(`Connection Error: ${err.message}`,'bot');

}

}

/* ---------------- EVENTS ---------------- */

send.addEventListener('click',sendMsg);

input.addEventListener('keypress',function(e){

if(e.key==='Enter'&&!e.shiftKey){
e.preventDefault();
sendMsg();
}

});

}

/* ---------------- INIT ---------------- */

if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',initWidget);
}else{
initWidget();
}

})();
