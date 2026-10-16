'use strict';
const $ = id => document.getElementById(id);
const toggle = (id, show) => $(id).classList.toggle('hidden', !show);
let currentUser = null, currentNoteId = null, currentProjectId = null, saveTimer = null;
const browserId = (() => { let id = localStorage.getItem('zeropad.browserId'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('zeropad.browserId', id); } return id; })();
async function api(url, options = {}) {
  const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options, headers: {'Accept':'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {})}});
  const text = await response.text(); let data;
  try { data = text ? JSON.parse(text) : {}; } catch { throw Error(`Unexpected server response (${response.status}). Check deployment and API route.`); }
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
  return data;
}
const post = (url, value) => api(url, {method:'POST',body:JSON.stringify(value)});
function showMessage(id, message) { $(id).textContent = message; }
function syncAuth() {
  const loggedIn = !!currentUser;
  toggle('authBox', !loggedIn); toggle('userBox', loggedIn);
  toggle('codeGate', !loggedIn); toggle('codeApp', loggedIn);
  toggle('adLoginGate', !loggedIn); toggle('adDashboard', loggedIn);
  $('saveProject').disabled = !loggedIn;
  $('accountBtn').textContent = loggedIn ? 'My Account' : 'Account';
  if (loggedIn) $('welcome').textContent = `Welcome, ${currentUser.display_name || currentUser.email}`;
}
async function refreshAuth() {
  try {
    const result = await api('/api/me');
    currentUser = result.user || null;
    if (!currentUser) showMessage('authMessage', 'No active server session. Log in again. If this persists, check that the browser accepts the zeropad.sid cookie.');
  } catch (error) {
    currentUser = null;
    showMessage('authMessage', 'Session verification failed: ' + error.message);
  }
  syncAuth();
  return !!currentUser;
}
async function navigate(page) {
  if (!$(page) || !$(page).classList.contains('page')) return;
  if (['code', 'advertise', 'account'].includes(page)) await refreshAuth();
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === page));
  history.replaceState(null, '', `#${page}`);
  if (page === 'code' && currentUser) { loadProjects(); updatePreview(); }
  if (page === 'advertise' && currentUser) loadCampaigns();
  if (page === 'home') loadAds();
  if (page === 'writer') loadNotes();
}
document.addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) navigate(button.dataset.page); });
async function authSubmit(event, endpoint) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
  button.disabled = true;
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await post(endpoint, fields);
    currentUser = result.user;
    await refreshAuth();
    if (!currentUser) throw Error('Login succeeded but the session was not retained. Check HTTPS, cookies and SESSION_SECRET.');
    showMessage('authMessage', endpoint === '/api/register' ? 'Account created. You are now logged in.' : 'Logged in successfully.');
    event.currentTarget.reset();
    if (location.hash === '#code' || location.hash === '#advertise') await navigate(location.hash.slice(1));
  } catch (error) { showMessage('authMessage', error.message); }
  finally { button.disabled = false; }
}
$('registerForm').addEventListener('submit', e => authSubmit(e, '/api/register'));
$('loginForm').addEventListener('submit', e => authSubmit(e, '/api/login'));
$('logoutBtn').addEventListener('click', async () => {
  try { await post('/api/logout', {}); currentUser = null; syncAuth(); showMessage('authMessage', 'Logged out.'); }
  catch (error) { showMessage('authMessage', error.message); }
});
async function loadAds() {
  try {
    const {ads} = await api('/api/ads?browserId=' + encodeURIComponent(browserId));
    const grid = $('adGrid'); grid.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const ad = ads[i], card = document.createElement('div'); card.className = ad ? 'ad live' : 'ad empty';
      if (!ad) card.textContent = 'Advertisement';
      else {
        const title = document.createElement('strong'), description = document.createElement('p'), link = document.createElement('button');
        title.textContent = ad.headline; description.textContent = ad.description || '';
        link.textContent = 'Visit advertiser →';
        link.addEventListener('click', async () => { try { const result = await post(`/api/ads/${ad.id}/click`, {browserId}); const url = new URL(result.url); if (!['https:', 'http:'].includes(url.protocol)) throw Error('Invalid advertiser URL'); window.open(url.href, '_blank', 'noopener,noreferrer'); } catch (error) { alert(error.message); } });
        card.append(title, description, link);
      }
      grid.append(card);
    }
  } catch (error) { console.warn('Ads unavailable:', error.message); }
}
function updatePreview() {
  $('preview').srcdoc = `<!doctype html><html><head><style>${$('cssCode').value.replace(/<\/style/gi,'<\\/style')}</style></head><body>${$('htmlCode').value}<script>${$('jsCode').value.replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;
}
['htmlCode','cssCode','jsCode'].forEach(id => $(id).addEventListener('input', updatePreview));
async function loadProjects() {
  if (!currentUser) return;
  try {
    const {projects} = await api('/api/projects');
    const select = $('projectSelect'); select.replaceChildren(new Option('New project', ''));
    projects.forEach(project => select.add(new Option(project.name, String(project.id))));
    select.value = currentProjectId ? String(currentProjectId) : '';
  } catch (error) { showMessage('projectMessage', error.message); }
}
$('projectSelect').addEventListener('change', async e => {
  currentProjectId = e.target.value ? Number(e.target.value) : null;
  if (!currentProjectId) { $('projectName').value = 'My Project'; $('htmlCode').value = ''; $('cssCode').value = ''; $('jsCode').value = ''; updatePreview(); return; }
  try {
    const {project} = await api(`/api/projects/${currentProjectId}`);
    $('projectName').value = project.name; $('htmlCode').value = project.html; $('cssCode').value = project.css; $('jsCode').value = project.js; updatePreview();
  } catch (error) { showMessage('projectMessage', error.message); }
});
$('saveProject').addEventListener('click', async () => {
  if (!currentUser) return navigate('account');
  const payload = {name:$('projectName').value,html:$('htmlCode').value,css:$('cssCode').value,js:$('jsCode').value};
  try {
    const result = currentProjectId ? await api(`/api/projects/${currentProjectId}`, {method:'PUT',body:JSON.stringify(payload)}) : await post('/api/projects',payload);
    currentProjectId = result.project.id; await loadProjects(); showMessage('projectMessage','Project saved.');
  } catch (error) { showMessage('projectMessage',error.message); }
});
async function loadCampaigns() {
  try {
    const {campaigns} = await api('/api/campaigns'); const list = $('campaignList'); list.replaceChildren();
    if (!campaigns.length) list.textContent = 'No campaigns yet.';
    for (const campaign of campaigns) {
      const card = document.createElement('div'); card.className = 'campaign';
      const title = document.createElement('h3'), details = document.createElement('p'), toggleBtn = document.createElement('button'), topup = document.createElement('button');
      title.textContent = campaign.name; details.textContent = `${campaign.status} • $${(campaign.balance_cents/100).toFixed(2)} remaining • ${campaign.views} views • ${campaign.clicks} clicks`;
      toggleBtn.textContent = campaign.status === 'active' ? 'Pause' : 'Activate';
      toggleBtn.onclick = async () => { try { await post(`/api/campaigns/${campaign.id}/toggle`,{}); loadCampaigns(); } catch(e) { alert(e.message); } };
      topup.textContent = 'Add $5'; topup.onclick = async () => { try { await post(`/api/campaigns/${campaign.id}/topup`,{amountDollars:5}); loadCampaigns(); } catch(e) { alert(e.message); } };
      card.append(title,details,toggleBtn,topup); list.append(card);
    }
  } catch (error) { $('campaignList').textContent = error.message; }
}
$('campaignForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  try { await post('/api/campaigns',data); event.currentTarget.reset(); await loadCampaigns(); }
  catch (error) { alert(error.message); }
});
$('adminLoad').addEventListener('click', async () => {
  const password = $('adminPass').value;
  if (!password) return showMessage('adminMsg','Enter the admin password.');
  try {
    const stats = await api('/api/admin/stats', {headers:{'x-admin-password':password}});
    $('stVisits').textContent = stats.totalVisits; $('stUnique').textContent = stats.uniqueVisitors;
    $('stUsers').textContent = stats.users; $('stCampaigns').textContent = stats.campaigns;
    const table = document.createElement('table'), head = document.createElement('tr');
    for (const label of ['Date','Visits','Unique visitors']) { const th = document.createElement('th'); th.textContent = label; head.append(th); }
    table.append(head);
    for (const day of stats.daily || []) { const tr = document.createElement('tr'); for (const value of [day.date,day.visits,day.unique_visitors]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } table.append(tr); }
    $('daily').replaceChildren(table); toggle('adminStats',true); showMessage('adminMsg','Statistics loaded.'); $('adminPass').value = '';
  } catch (error) { toggle('adminStats',false); showMessage('adminMsg',error.message); }
});
function wordCount() { const words = $('note').value.trim().match(/\S+/g); $('wordCount').textContent = `${words ? words.length : 0} words`; }
async function loadNotes() {
  try {
    const {notes} = await api('/api/notes?browserId=' + encodeURIComponent(browserId));
    const panel = $('historyPanel'); panel.dataset.notes = JSON.stringify(notes);
    if (!currentNoteId && notes.length && !$('note').value) { currentNoteId = notes[0].id; $('noteTitle').value = notes[0].title; $('note').value = notes[0].content; wordCount(); }
  } catch (error) { showMessage('saveState',error.message); }
}
async function saveNote() {
  const data = {browserId,title:$('noteTitle').value,content:$('note').value};
  try {
    showMessage('saveState','Saving…');
    const result = currentNoteId ? await api(`/api/notes/${currentNoteId}`, {method:'PUT',body:JSON.stringify(data)}) : await post('/api/notes',data);
    currentNoteId = result.note.id; showMessage('saveState','Saved');
  } catch (error) { showMessage('saveState',error.message); }
}
function scheduleSave() { wordCount(); clearTimeout(saveTimer); saveTimer = setTimeout(saveNote,700); }
$('note').addEventListener('input',scheduleSave); $('noteTitle').addEventListener('input',scheduleSave);
$('newNote').onclick = () => { currentNoteId = null; $('note').value = ''; $('noteTitle').value = 'Untitled'; wordCount(); showMessage('saveState','New note'); };
$('historyBtn').onclick = async () => {
  const panel = $('historyPanel'); if (!panel.classList.contains('hidden')) return toggle('historyPanel',false);
  panel.replaceChildren();
  try {
    const {notes} = await api('/api/notes?browserId=' + encodeURIComponent(browserId));
    for (const note of notes) {
      const b = document.createElement('button'); b.textContent = `${note.title} — ${new Date(note.updated_at).toLocaleString()}`;
      b.onclick = async () => { currentNoteId = note.id; $('noteTitle').value = note.title; $('note').value = note.content; wordCount(); toggle('historyPanel',false); };
      panel.append(b);
    }
    if (currentNoteId) {
      const {history} = await api(`/api/notes/${currentNoteId}/history`);
      for (const version of history) { const b = document.createElement('button'); b.textContent = `Restore ${new Date(version.created_at).toLocaleString()}`; b.onclick = () => { $('note').value = version.content; wordCount(); scheduleSave(); toggle('historyPanel',false); }; panel.append(b); }
    }
    toggle('historyPanel',true);
  } catch (error) { panel.textContent = error.message; toggle('historyPanel',true); }
};
$('exportBtn').onclick = () => { const blob = new Blob([$('note').value],{type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = ($('noteTitle').value.replace(/[^\w -]/g,'_') || 'note') + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
$('year').textContent = new Date().getFullYear();
(async () => { await refreshAuth(); navigate(['home','writer','code','account','advertise','admin'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home'); updatePreview(); })();
