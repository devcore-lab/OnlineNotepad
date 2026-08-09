
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-session-secret";

const db = new Database(path.join(__dirname, "zeropad.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  browser_id TEXT,
  title TEXT DEFAULT 'Untitled',
  content TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS note_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS code_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  html TEXT DEFAULT '',
  css TEXT DEFAULT '',
  js TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  browser_id TEXT NOT NULL,
  page TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  description TEXT DEFAULT '',
  destination_url TEXT NOT NULL,
  placement TEXT DEFAULT 'tile',
  balance_cents INTEGER DEFAULT 500,
  cpc_cents INTEGER DEFAULT 10,
  status TEXT DEFAULT 'paused',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  browser_id TEXT,
  created_at TEXT NOT NULL
);
`);

app.use(express.json({limit:"1mb"}));
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000*60*60*24*30 }
}));
app.use(express.static(path.join(__dirname, "public")));

function now(){ return new Date().toISOString(); }
function auth(req,res,next){
  if(!req.session.userId) return res.status(401).json({error:"Login required"});
  next();
}
function userSafe(id){
  return db.prepare("SELECT id,email,display_name,created_at FROM users WHERE id=?").get(id);
}

app.post("/api/register", async (req,res)=>{
  const email = String(req.body.email||"").trim().toLowerCase();
  const password = String(req.body.password||"");
  const displayName = String(req.body.displayName||"").trim().slice(0,60);
  if(!email.includes("@") || password.length < 6) return res.status(400).json({error:"Use a valid email and password of at least 6 characters."});
  try{
    const hash = await bcrypt.hash(password, 10);
    const info = db.prepare("INSERT INTO users(email,password_hash,display_name,created_at) VALUES(?,?,?,?)")
      .run(email,hash,displayName,now());
    req.session.userId = info.lastInsertRowid;
    res.json({user:userSafe(info.lastInsertRowid)});
  }catch(e){
    res.status(400).json({error:"That email is already registered."});
  }
});

app.post("/api/login", async (req,res)=>{
  const email = String(req.body.email||"").trim().toLowerCase();
  const password = String(req.body.password||"");
  const row = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if(!row || !(await bcrypt.compare(password,row.password_hash))) return res.status(401).json({error:"Incorrect email or password."});
  req.session.userId = row.id;
  res.json({user:userSafe(row.id)});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.userId?userSafe(req.session.userId):null}));

app.post("/api/visit",(req,res)=>{
  const browserId = String(req.body.browserId||"").slice(0,120);
  const page = String(req.body.page||"home").slice(0,40);
  if(browserId) db.prepare("INSERT INTO visits(browser_id,page,created_at) VALUES(?,?,?)").run(browserId,page,now());
  res.json({ok:true});
});

app.get("/api/notes",(req,res)=>{
  const browserId = String(req.query.browserId||"").slice(0,120);
  let rows;
  if(req.session.userId) rows = db.prepare("SELECT * FROM notes WHERE user_id=? ORDER BY updated_at DESC LIMIT 100").all(req.session.userId);
  else rows = db.prepare("SELECT * FROM notes WHERE browser_id=? AND user_id IS NULL ORDER BY updated_at DESC LIMIT 100").all(browserId);
  res.json({notes:rows});
});
app.post("/api/notes",(req,res)=>{
  const browserId = String(req.body.browserId||"").slice(0,120);
  const content = String(req.body.content||"");
  const title = String(req.body.title||"Untitled").slice(0,120);
  const info = db.prepare("INSERT INTO notes(user_id,browser_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(req.session.userId||null,browserId||null,title,content,now(),now());
  res.json({note:db.prepare("SELECT * FROM notes WHERE id=?").get(info.lastInsertRowid)});
});
app.put("/api/notes/:id",(req,res)=>{
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM notes WHERE id=?").get(id);
  if(!row) return res.status(404).json({error:"Note not found"});
  const browserId = String(req.body.browserId||"").slice(0,120);
  const allowed = (req.session.userId && row.user_id===req.session.userId) || (!row.user_id && row.browser_id===browserId);
  if(!allowed) return res.status(403).json({error:"Not allowed"});
  if(row.content !== String(req.body.content||"")){
    db.prepare("INSERT INTO note_versions(note_id,content,created_at) VALUES(?,?,?)").run(id,row.content,now());
  }
  db.prepare("UPDATE notes SET title=?,content=?,updated_at=? WHERE id=?")
    .run(String(req.body.title||"Untitled").slice(0,120),String(req.body.content||""),now(),id);
  res.json({note:db.prepare("SELECT * FROM notes WHERE id=?").get(id)});
});
app.get("/api/notes/:id/history",(req,res)=>{
  const id=Number(req.params.id);
  const row=db.prepare("SELECT * FROM notes WHERE id=?").get(id);
  if(!row) return res.status(404).json({error:"Not found"});
  res.json({history:db.prepare("SELECT * FROM note_versions WHERE note_id=? ORDER BY created_at DESC LIMIT 50").all(id)});
});

app.get("/api/projects",auth,(req,res)=>{
  res.json({projects:db.prepare("SELECT id,name,updated_at FROM code_projects WHERE user_id=? ORDER BY updated_at DESC").all(req.session.userId)});
});
app.post("/api/projects",auth,(req,res)=>{
  const t=now();
  const info=db.prepare("INSERT INTO code_projects(user_id,name,html,css,js,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run(req.session.userId,String(req.body.name||"Untitled Project").slice(0,100),String(req.body.html||""),String(req.body.css||""),String(req.body.js||""),t,t);
  res.json({project:db.prepare("SELECT * FROM code_projects WHERE id=?").get(info.lastInsertRowid)});
});
app.get("/api/projects/:id",auth,(req,res)=>{
  const p=db.prepare("SELECT * FROM code_projects WHERE id=? AND user_id=?").get(Number(req.params.id),req.session.userId);
  if(!p) return res.status(404).json({error:"Not found"});
  res.json({project:p});
});
app.put("/api/projects/:id",auth,(req,res)=>{
  const id=Number(req.params.id);
  db.prepare("UPDATE code_projects SET name=?,html=?,css=?,js=?,updated_at=? WHERE id=? AND user_id=?")
    .run(String(req.body.name||"Untitled").slice(0,100),String(req.body.html||""),String(req.body.css||""),String(req.body.js||""),now(),id,req.session.userId);
  res.json({project:db.prepare("SELECT * FROM code_projects WHERE id=? AND user_id=?").get(id,req.session.userId)});
});

app.get("/api/campaigns",auth,(req,res)=>{
  const campaigns=db.prepare("SELECT * FROM campaigns WHERE user_id=? ORDER BY created_at DESC").all(req.session.userId);
  for(const c of campaigns){
    c.views=db.prepare("SELECT COUNT(*) n FROM ad_events WHERE campaign_id=? AND type='view'").get(c.id).n;
    c.clicks=db.prepare("SELECT COUNT(*) n FROM ad_events WHERE campaign_id=? AND type='click'").get(c.id).n;
  }
  res.json({campaigns});
});
app.post("/api/campaigns",auth,(req,res)=>{
  const budget=Math.max(500,Math.round(Number(req.body.budgetDollars||5)*100));
  const info=db.prepare(`INSERT INTO campaigns(user_id,name,headline,description,destination_url,placement,balance_cents,cpc_cents,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(req.session.userId,String(req.body.name||"Campaign").slice(0,100),String(req.body.headline||"").slice(0,120),
    String(req.body.description||"").slice(0,240),String(req.body.destinationUrl||"").slice(0,500),String(req.body.placement||"tile"),budget,10,"paused",now());
  res.json({campaign:db.prepare("SELECT * FROM campaigns WHERE id=?").get(info.lastInsertRowid)});
});
app.post("/api/campaigns/:id/toggle",auth,(req,res)=>{
  const c=db.prepare("SELECT * FROM campaigns WHERE id=? AND user_id=?").get(Number(req.params.id),req.session.userId);
  if(!c) return res.status(404).json({error:"Not found"});
  const next=c.status==="active"?"paused":"active";
  db.prepare("UPDATE campaigns SET status=? WHERE id=?").run(next,c.id);
  res.json({status:next});
});
app.post("/api/campaigns/:id/topup",auth,(req,res)=>{
  const cents=Math.max(500,Math.round(Number(req.body.amountDollars||5)*100));
  db.prepare("UPDATE campaigns SET balance_cents=balance_cents+? WHERE id=? AND user_id=?").run(cents,Number(req.params.id),req.session.userId);
  res.json({ok:true});
});

app.get("/api/ads",(req,res)=>{
  const rows=db.prepare("SELECT * FROM campaigns WHERE status='active' AND balance_cents>=cpc_cents ORDER BY RANDOM() LIMIT 3").all();
  rows.forEach(c=>db.prepare("INSERT INTO ad_events(campaign_id,type,browser_id,created_at) VALUES(?,?,?,?)").run(c.id,"view",String(req.query.browserId||"").slice(0,120),now()));
  res.json({ads:rows});
});
app.post("/api/ads/:id/click",(req,res)=>{
  const id=Number(req.params.id);
  const c=db.prepare("SELECT * FROM campaigns WHERE id=? AND status='active'").get(id);
  if(!c || c.balance_cents<c.cpc_cents) return res.status(404).json({error:"Ad unavailable"});
  db.prepare("INSERT INTO ad_events(campaign_id,type,browser_id,created_at) VALUES(?,?,?,?)").run(id,"click",String(req.body.browserId||"").slice(0,120),now());
  db.prepare("UPDATE campaigns SET balance_cents=MAX(0,balance_cents-cpc_cents) WHERE id=?").run(id);
  res.json({url:c.destination_url});
});

app.get("/api/admin/stats",(req,res)=>{
  if(req.get("x-admin-password")!==ADMIN_PASSWORD) return res.status(401).json({error:"Incorrect password"});
  const totalVisits=db.prepare("SELECT COUNT(*) n FROM visits").get().n;
  const uniqueVisitors=db.prepare("SELECT COUNT(DISTINCT browser_id) n FROM visits").get().n;
  const users=db.prepare("SELECT COUNT(*) n FROM users").get().n;
  const campaigns=db.prepare("SELECT COUNT(*) n FROM campaigns").get().n;
  const today=new Date().toISOString().slice(0,10);
  const todayVisits=db.prepare("SELECT COUNT(*) n FROM visits WHERE substr(created_at,1,10)=?").get(today).n;
  const daily=db.prepare(`SELECT substr(created_at,1,10) date, COUNT(*) visits, COUNT(DISTINCT browser_id) unique_visitors
    FROM visits GROUP BY substr(created_at,1,10) ORDER BY date DESC LIMIT 14`).all().reverse();
  res.json({totalVisits,uniqueVisitors,users,campaigns,todayVisits,daily});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Zeropad running on http://localhost:${PORT}`));
