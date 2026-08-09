
const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
const BROWSER_KEY="zeropad_browser_id";
let me=null, currentNote=null, currentProject=null;
function browserId(){let id=localStorage.getItem(BROWSER_KEY);if(!id){id=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random());localStorage.setItem(BROWSER_KEY,id)}return id}
async function api(url,opts={}){opts.headers={...(opts.headers||{}),"Content-Type":"application/json"};const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Request failed");return d}
function showPage(id){qsa(".page").forEach(p=>p.classList.toggle("active",p.id===id));history.replaceState(null,"","#"+id);window.scrollTo(0,0);api("/api/visit",{method:"POST",body:JSON.stringify({browserId:browserId(),page:id})}).catch(()=>{});if(id==="code")refreshCodeGate();if(id==="advertise")refreshAdsDashboard();if(id==="account")refreshAccount()}
qsa("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
qs("#year").textContent=new Date().getFullYear();

async function refreshMe(){const d=await api("/api/me");me=d.user;return me}
async function refreshAccount(){await refreshMe();qs("#authBox").classList.toggle("hidden",!!me);qs("#userBox").classList.toggle("hidden",!me);if(me)qs("#welcome").textContent=`Hello${me.display_name?", "+me.display_name:""}`;}
qs("#registerForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/register",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});qs("#authMessage").textContent="Account created.";refreshAccount()}catch(err){qs("#authMessage").textContent=err.message}};
qs("#loginForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/login",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});qs("#authMessage").textContent="Logged in.";refreshAccount()}catch(err){qs("#authMessage").textContent=err.message}};
qs("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST",body:"{}"});me=null;refreshAccount()};

const note=qs("#note"), noteTitle=qs("#noteTitle");
function updateWords(){const t=note.value.trim();qs("#wordCount").textContent=(t?t.split(/\s+/).length:0)+" words"}
async function loadLatestNote(){const d=await api("/api/notes?browserId="+encodeURIComponent(browserId()));if(d.notes.length){currentNote=d.notes[0];note.value=currentNote.content;noteTitle.value=currentNote.title}else{const n=await api("/api/notes",{method:"POST",body:JSON.stringify({browserId:browserId(),title:"Untitled",content:""})});currentNote=n.note}updateWords()}
let saveTimer;
async function saveNote(){if(!currentNote)return;try{const d=await api("/api/notes/"+currentNote.id,{method:"PUT",body:JSON.stringify({browserId:browserId(),title:noteTitle.value,content:note.value})});currentNote=d.note;qs("#saveState").textContent="Saved ✓"}catch(e){qs("#saveState").textContent="Save failed"}}
note.oninput=()=>{updateWords();qs("#saveState").textContent="Saving...";clearTimeout(saveTimer);saveTimer=setTimeout(saveNote,650)};
noteTitle.oninput=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveNote,650)};
qs("#newNote").onclick=async()=>{const n=await api("/api/notes",{method:"POST",body:JSON.stringify({browserId:browserId(),title:"Untitled",content:""})});currentNote=n.note;note.value="";noteTitle.value="Untitled";updateWords();note.focus()};
qs("#historyBtn").onclick=async()=>{if(!currentNote)return;const d=await api(`/api/notes/${currentNote.id}/history`);const p=qs("#historyPanel");p.classList.toggle("hidden");p.innerHTML="<h3>Note history</h3>"+(d.history.length?d.history.map(h=>`<div class="campaign"><small>${new Date(h.created_at).toLocaleString()}</small><p>${escapeHtml(h.content.slice(0,220))}</p></div>`).join(""):"<p>No previous versions yet.</p>")};
qs("#exportBtn").onclick=()=>{const u=URL.createObjectURL(new Blob([note.value],{type:"text/plain"}));const a=document.createElement("a");a.href=u;a.download=(noteTitle.value||"note")+".txt";a.click();setTimeout(()=>URL.revokeObjectURL(u),500)};
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

async function refreshCodeGate(){await refreshMe();qs("#codeGate").classList.toggle("hidden",!!me);qs("#codeApp").classList.toggle("hidden",!me);if(me)loadProjects()}
async function loadProjects(){const d=await api("/api/projects");const sel=qs("#projectSelect");sel.innerHTML='<option value="">New project</option>'+d.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
function updatePreview(){qs("#preview").srcdoc=`<!doctype html><html><head><style>${qs("#cssCode").value}</style></head><body>${qs("#htmlCode").value}<script>${qs("#jsCode").value}<\/script></body></html>`}
["#htmlCode","#cssCode","#jsCode"].forEach(id=>qs(id).oninput=updatePreview);updatePreview();
qs("#projectSelect").onchange=async e=>{if(!e.target.value){currentProject=null;return}const d=await api("/api/projects/"+e.target.value);currentProject=d.project;qs("#projectName").value=currentProject.name;qs("#htmlCode").value=currentProject.html;qs("#cssCode").value=currentProject.css;qs("#jsCode").value=currentProject.js;updatePreview()};
qs("#saveProject").onclick=async()=>{if(!me)return showPage("account");const body={name:qs("#projectName").value,html:qs("#htmlCode").value,css:qs("#cssCode").value,js:qs("#jsCode").value};const d=currentProject?await api("/api/projects/"+currentProject.id,{method:"PUT",body:JSON.stringify(body)}):await api("/api/projects",{method:"POST",body:JSON.stringify(body)});currentProject=d.project;await loadProjects();qs("#projectSelect").value=currentProject.id};

async function refreshAdsDashboard(){await refreshMe();qs("#adLoginGate").classList.toggle("hidden",!!me);qs("#adDashboard").classList.toggle("hidden",!me);if(me)loadCampaigns()}
qs("#campaignForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await api("/api/campaigns",{method:"POST",body:JSON.stringify(f)});e.target.reset();e.target.budgetDollars.value=5;loadCampaigns()}catch(err){alert(err.message)}};
async function loadCampaigns(){const d=await api("/api/campaigns");qs("#campaignList").innerHTML=d.campaigns.length?d.campaigns.map(c=>`<div class="campaign"><h3>${escapeHtml(c.name)}</h3><small>${c.status} • $${(c.balance_cents/100).toFixed(2)} balance</small><p>${c.views} views • ${c.clicks} clicks • ${c.views?((c.clicks/c.views)*100).toFixed(1):0}% CTR</p><button onclick="toggleCampaign(${c.id})">${c.status==="active"?"Pause":"Start"}</button> <button onclick="topup(${c.id})">Add $5</button></div>`).join(""):"<p>No campaigns yet.</p>"}
window.toggleCampaign=async id=>{await api(`/api/campaigns/${id}/toggle`,{method:"POST",body:"{}"});loadCampaigns()};
window.topup=async id=>{await api(`/api/campaigns/${id}/topup`,{method:"POST",body:JSON.stringify({amountDollars:5})});loadCampaigns()};

async function loadHomepageAds(){try{const d=await api("/api/ads?browserId="+encodeURIComponent(browserId()));const slots=qsa("#adGrid .ad");d.ads.forEach((a,i)=>{if(!slots[i])return;slots[i].className="ad live";slots[i].innerHTML=`<small>Advertisement</small><strong>${escapeHtml(a.headline)}</strong><p>${escapeHtml(a.description)}</p><button class="primary">Visit advertiser</button>`;slots[i].querySelector("button").onclick=async()=>{const r=await api(`/api/ads/${a.id}/click`,{method:"POST",body:JSON.stringify({browserId:browserId()})});window.open(r.url,"_blank","noopener")}})}catch(e){}}

qs("#adminLoad").onclick=async()=>{try{const r=await fetch("/api/admin/stats",{headers:{"x-admin-password":qs("#adminPass").value}});const d=await r.json();if(!r.ok)throw new Error(d.error);qs("#adminLogin").classList.add("hidden");qs("#adminStats").classList.remove("hidden");qs("#stVisits").textContent=d.totalVisits;qs("#stUnique").textContent=d.uniqueVisitors;qs("#stUsers").textContent=d.users;qs("#stCampaigns").textContent=d.campaigns;qs("#daily").innerHTML="<table><tr><th>Date</th><th>Visits</th><th>Unique browsers</th></tr>"+d.daily.map(r=>`<tr><td>${r.date}</td><td>${r.visits}</td><td>${r.unique_visitors}</td></tr>`).join("")+"</table>"}catch(e){qs("#adminMsg").textContent=e.message}};
(async()=>{await refreshMe();await loadLatestNote();await loadHomepageAds();const initial=location.hash.slice(1);if(["home","writer","code","account","advertise","admin"].includes(initial))showPage(initial)})();
