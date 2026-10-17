'use strict';
const $ = id => document.getElementById(id);
const toggle = (id, show) => $(id).classList.toggle('hidden', !show);
let currentNoteId = null, currentProjectId = null, saveTimer = null;
const browserId = (() => {
  try {
    let id = localStorage.getItem('zeropad.browserId');
    if (!id) { id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('zeropad.browserId', id); }
    return id;
  } catch { return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
})();
async function api(url, options = {}) {
  const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options, headers: {'Accept':'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {})}});
  const text = await response.text(); let data;
  try { data = text ? JSON.parse(text) : {}; } catch { throw Error(`Unexpected server response (${response.status}). Check deployment and API route.`); }
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
  return data;
}
const post = (url, value) => api(url, {method:'POST',body:JSON.stringify(value)});
function showMessage(id, message) { const node = $(id); if(node) node.textContent = message; }
function navigate(page) {
  if (!$(page) || !$(page).classList.contains('page')) return;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === page));
  history.replaceState(null, '', `#${page}`);
  if (page === 'code') { loadProjects(); updatePreview(); }
  if (page === 'home') loadAds();
  if (page === 'writer') loadNotes();
}
document.addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) navigate(button.dataset.page); });
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
// Projects are stored in the visitor's browser, with no account or API required.
const PROJECTS_KEY = 'zeropad.localProjects.v1';
function readProjects() { try { const x = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } }
function writeProjects(projects) { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); }
function loadProjects() {
  const projects = readProjects(); const select = $('projectSelect');
  select.replaceChildren(new Option('New project',''));
  projects.forEach(project => select.add(new Option(project.name,project.id)));
  select.value = currentProjectId || '';
}
$('projectSelect').addEventListener('change', e => {
  currentProjectId = e.target.value || null;
  const project = readProjects().find(p => p.id === currentProjectId);
  $('projectName').value = project ? project.name : 'My Project';
  $('htmlCode').value = project ? project.html : '<h1>Hello Zeropad</h1>';
  $('cssCode').value = project ? project.css : 'body{font-family:Arial;padding:30px}';
  $('jsCode').value = project ? project.js : 'console.log("Hello");';
  updatePreview();
});
$('saveProject').addEventListener('click', () => {
  try {
    const projects = readProjects();
    if (!currentProjectId) currentProjectId = `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const project = {id:currentProjectId,name:$('projectName').value || 'My Project',html:$('htmlCode').value,css:$('cssCode').value,js:$('jsCode').value};
    const index = projects.findIndex(p => p.id === currentProjectId);
    if (index < 0) projects.push(project); else projects[index] = project;
    writeProjects(projects); loadProjects(); showMessage('projectMessage','Saved in this browser. Export a backup before clearing browser data.');
  } catch (error) { showMessage('projectMessage','Could not save in this browser: ' + error.message); }
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
      const {history} = await api(`/api/notes/${currentNoteId}/history?browserId=${encodeURIComponent(browserId)}`);
      for (const version of history) { const b = document.createElement('button'); b.textContent = `Restore ${new Date(version.created_at).toLocaleString()}`; b.onclick = () => { $('note').value = version.content; wordCount(); scheduleSave(); toggle('historyPanel',false); }; panel.append(b); }
    }
    toggle('historyPanel',true);
  } catch (error) { panel.textContent = error.message; toggle('historyPanel',true); }
};
$('exportBtn').onclick = () => { const blob = new Blob([$('note').value],{type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = ($('noteTitle').value.replace(/[^\w -]/g,'_') || 'note') + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
$('year').textContent = new Date().getFullYear();
(() => { navigate(['home','writer','code','advertise','admin'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home'); updatePreview(); })();
