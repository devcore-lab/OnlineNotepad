const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

/*
=========================================================
ADMIN SETTINGS
=========================================================

BEST OPTION:
Set ADMIN_PASSWORD in your hosting environment.

Example:
ADMIN_PASSWORD=my-secret-password

For local testing you can replace:
"CHOOSE-YOUR-PASSWORD"

with your actual password.
*/

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "Admin123!");

const SESSION_SECRET = process.env.SESSION_SECRET ||
  "zeropad-development-session-secret-change-in-production";
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("Set SESSION_SECRET in your hosting environment to keep logins working securely.");
}


/*
=========================================================
DATABASE
=========================================================
*/

const db = new Database(
  path.join(__dirname, "zeropad.db")
);

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


/*
=========================================================
EXPRESS
=========================================================
*/

app.set("trust proxy", 1);

app.use(express.json({
  limit: "1mb"
}));

app.use(express.urlencoded({
  extended: true
}));

app.use(cookieParser());


/*
=========================================================
SESSIONS
=========================================================
*/

// Persistent SQLite session store. Keeps authentication across restarts.
class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    db.exec(`CREATE TABLE IF NOT EXISTS login_sessions (
      sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL
    )`);
  }
  get(sid, callback) {
    try {
      const row = db.prepare("SELECT data, expires FROM login_sessions WHERE sid = ?").get(sid);
      if (!row || row.expires < Date.now()) {
        if (row) db.prepare("DELETE FROM login_sessions WHERE sid = ?").run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (err) { callback(err); }
  }
  set(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 2592000000;
      db.prepare("INSERT INTO login_sessions(sid,data,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires")
        .run(sid, JSON.stringify(value), expires);
      callback(null);
    } catch (err) { callback(err); }
  }
  destroy(sid, callback = () => {}) {
    try { db.prepare("DELETE FROM login_sessions WHERE sid = ?").run(sid); callback(null); }
    catch (err) { callback(err); }
  }
  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
}

app.use(
  session({
    store: new SQLiteSessionStore(),
    proxy: true,
    name: "zeropad.sid",

    secret: SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    rolling: true,

    cookie: {
      httpOnly: true,
      sameSite: "lax",

      // HTTPS production sites
      secure: "auto",

      maxAge:
        1000 *
        60 *
        60 *
        24 *
        30
    }
  })
);


// Avoid stale HTML and authentication scripts after a deployment.
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html' || req.path === '/app.js') {
    res.set('Cache-Control', 'no-store, max-age=0');
  }
  next();
});

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/*
=========================================================
HELPERS
=========================================================
*/

function now() {
  return new Date().toISOString();
}


function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function safeUser(id) {

  return db.prepare(`
    SELECT
      id,
      email,
      display_name,
      created_at
    FROM users
    WHERE id = ?
  `).get(id);

}


function requireLogin(req, res, next) {

  if (!req.session.userId) {

    return res.status(401).json({
      error: "Login required"
    });

  }

  next();

}


/*
=========================================================
REGISTER
=========================================================
*/

// Public account creation and login have been retired.
// Do not expose legacy user or project APIs after removing public authentication.
app.use((req, res, next) => {
  if (/^\/api\/(register|login|logout|me|projects)(?:\/|$)/.test(req.path) || /^\/api\/campaigns(?:\/|$)/.test(req.path)) {
    return res.status(410).json({error: 'Public accounts and account-based APIs have been retired.'});
  }
  next();
});

app.post(
  "/api/register",
  async (req, res) => {

    try {

      const email =
        cleanEmail(req.body.email);

      const password =
        String(
          req.body.password || ""
        );

      const displayName =
        String(
          req.body.displayName || ""
        )
        .trim()
        .slice(0, 60);


      /*
      Basic validation
      */

      if (
        !email ||
        !email.includes("@")
      ) {

        return res
          .status(400)
          .json({
            error:
              "Enter a valid email address."
          });

      }


      if (password.length < 6) {

        return res
          .status(400)
          .json({
            error:
              "Password must contain at least 6 characters."
          });

      }


      /*
      Check whether account already exists
      */

      const existing =
        db.prepare(`
          SELECT id
          FROM users
          WHERE email = ?
        `).get(email);


      if (existing) {

        return res
          .status(409)
          .json({
            error:
              "An account with that email already exists."
          });

      }


      /*
      Hash password
      */

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      /*
      Create account
      */

      const result =
        db.prepare(`
          INSERT INTO users (
            email,
            password_hash,
            display_name,
            created_at
          )
          VALUES (?, ?, ?, ?)
        `).run(
          email,
          passwordHash,
          displayName,
          now()
        );


      const userId =
        Number(
          result.lastInsertRowid
        );


      /*
      Immediately log the new user in
      */

      req.session.userId =
        userId;


      /*
      IMPORTANT:
      explicitly save session
      */

      req.session.save(err => {

        if (err) {

          console.error(
            "Session save error:",
            err
          );

          return res
            .status(500)
            .json({
              error:
                "Account created but login session failed."
            });

        }


        res.status(201).json({

          success: true,

          user:
            safeUser(userId)

        });

      });


    } catch (error) {

      console.error(
        "REGISTER ERROR:",
        error
      );


      res.status(500).json({
        error:
          "Could not create account."
      });

    }

  }
);


/*
=========================================================
LOGIN
=========================================================
*/

app.post(
  "/api/login",
  async (req, res) => {

    try {

      const email =
        cleanEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );


      // Admin uses the same account session and feature permissions.
      // The initial password is development-only; set ADMIN_PASSWORD in production.
      if (email === "admin" && ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
        let admin = db.prepare("SELECT * FROM users WHERE email = ?").get("admin@zeropad.local");
        if (!admin) {
          const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
          const result = db.prepare("INSERT INTO users (email,password_hash,display_name,created_at) VALUES (?,?,?,?)")
            .run("admin@zeropad.local", hash, "Administrator", now());
          admin = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
        }
        return req.session.regenerate(err => {
          if (err) return res.status(500).json({error:"Could not start login session."});
          req.session.userId = admin.id;
          req.session.isAdmin = true;
          req.session.save(err => {
            if (err) return res.status(500).json({error:"Could not save login."});
            res.json({success:true,user:{...safeUser(admin.id),isAdmin:true}});
          });
        });
      }

      /*
      Find account
      */

      const user =
        db.prepare(`
          SELECT *
          FROM users
          WHERE email = ?
        `).get(email);


      if (!user) {

        return res
          .status(401)
          .json({
            error:
              "Incorrect email or password."
          });

      }


      /*
      Compare password
      */

      const correct =
        await bcrypt.compare(
          password,
          user.password_hash
        );


      if (!correct) {

        return res
          .status(401)
          .json({
            error:
              "Incorrect email or password."
          });

      }


      /*
      Create a fresh session
      */

      req.session.regenerate(
        err => {

          if (err) {

            console.error(
              "Session regenerate error:",
              err
            );

            return res
              .status(500)
              .json({
                error:
                  "Could not start login session."
              });

          }


          req.session.userId =
            Number(user.id);


          /*
          Save before responding.
          */

          req.session.save(
            saveError => {

              if (saveError) {

                console.error(
                  "Session save error:",
                  saveError
                );

                return res
                  .status(500)
                  .json({
                    error:
                      "Could not save login."
                  });

              }


              res.json({

                success: true,

                user:
                  safeUser(
                    user.id
                  )

              });

            }
          );

        }
      );


    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      res.status(500).json({
        error:
          "Login failed."
      });

    }

  }
);


/*
=========================================================
CURRENT USER
=========================================================
*/

app.get(
  "/api/me",
  (req, res) => {
    res.set("Cache-Control", "no-store");

    if (!req.session.userId) {

      return res.json({
        user: null
      });

    }


    const user =
      safeUser(
        req.session.userId
      );


    /*
    Account may have been deleted.
    */

    if (!user) {

      req.session.userId = null;

      return res.json({
        user: null
      });

    }


    res.json({
      user: {...user, isAdmin: !!req.session.isAdmin}
    });

  }
);


/*
=========================================================
LOGOUT
=========================================================
*/

app.post(
  "/api/logout",
  (req, res) => {

    req.session.destroy(
      () => {

        res.clearCookie(
          "zeropad.sid"
        );

        res.json({
          success: true
        });

      }
    );

  }
);


/*
=========================================================
VISITS
=========================================================
*/

app.post(
  "/api/visit",
  (req, res) => {

    const browserId =
      String(
        req.body.browserId || ""
      ).slice(0, 120);

    const page =
      String(
        req.body.page || "home"
      ).slice(0, 40);


    if (browserId) {

      db.prepare(`
        INSERT INTO visits (
          browser_id,
          page,
          created_at
        )
        VALUES (?, ?, ?)
      `).run(
        browserId,
        page,
        now()
      );

    }


    res.json({
      success: true
    });

  }
);


/*
=========================================================
NOTES
=========================================================
*/

app.get(
  "/api/notes",
  (req, res) => {

    const browserId =
      String(
        req.query.browserId || ""
      ).slice(0, 120);


    let notes;


    if (req.session.userId) {

      notes =
        db.prepare(`
          SELECT *
          FROM notes
          WHERE user_id = ?
          ORDER BY updated_at DESC
          LIMIT 100
        `).all(
          req.session.userId
        );

    } else {

      notes =
        db.prepare(`
          SELECT *
          FROM notes
          WHERE browser_id = ?
          AND user_id IS NULL
          ORDER BY updated_at DESC
          LIMIT 100
        `).all(
          browserId
        );

    }


    res.json({
      notes
    });

  }
);


app.post(
  "/api/notes",
  (req, res) => {

    const browserId =
      String(
        req.body.browserId || ""
      ).slice(0, 120);

    const title =
      String(
        req.body.title ||
        "Untitled"
      ).slice(0, 120);

    const content =
      String(
        req.body.content || ""
      );


    const time =
      now();


    const result =
      db.prepare(`
        INSERT INTO notes (
          user_id,
          browser_id,
          title,
          content,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(

        req.session.userId ||
        null,

        req.session.userId
          ? null
          : browserId,

        title,

        content,

        time,

        time

      );


    res.json({

      note:
        db.prepare(`
          SELECT *
          FROM notes
          WHERE id = ?
        `).get(
          result.lastInsertRowid
        )

    });

  }
);


app.put(
  "/api/notes/:id",
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    const note =
      db.prepare(`
        SELECT *
        FROM notes
        WHERE id = ?
      `).get(id);


    if (!note) {

      return res
        .status(404)
        .json({
          error:
            "Note not found"
        });

    }


    const browserId =
      String(
        req.body.browserId || ""
      ).slice(0, 120);


    const allowed =

      (
        req.session.userId &&
        note.user_id ===
          req.session.userId
      )

      ||

      (
        !note.user_id &&
        note.browser_id ===
          browserId
      );


    if (!allowed) {

      return res
        .status(403)
        .json({
          error:
            "Not allowed"
        });

    }


    const content =
      String(
        req.body.content || ""
      );


    if (
      note.content !==
      content
    ) {

      db.prepare(`
        INSERT INTO note_versions (
          note_id,
          content,
          created_at
        )
        VALUES (?, ?, ?)
      `).run(
        id,
        note.content,
        now()
      );

    }


    db.prepare(`
      UPDATE notes
      SET
        title = ?,
        content = ?,
        updated_at = ?
      WHERE id = ?
    `).run(

      String(
        req.body.title ||
        "Untitled"
      ).slice(0, 120),

      content,

      now(),

      id

    );


    res.json({

      note:
        db.prepare(`
          SELECT *
          FROM notes
          WHERE id = ?
        `).get(id)

    });

  }
);


/*
=========================================================
NOTE HISTORY
=========================================================
*/

app.get(
  "/api/notes/:id/history",
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    const note =
      db.prepare(`
        SELECT *
        FROM notes
        WHERE id = ?
      `).get(id);


    if (!note) {

      return res
        .status(404)
        .json({
          error: "Not found"
        });

    }


    const browserId = String(req.query.browserId || "").slice(0, 120);
    const allowed = note.user_id != null
      ? Number(note.user_id) === Number(req.session.userId || 0)
      : Boolean(browserId && note.browser_id === browserId);
    if (!allowed) return res.status(403).json({ error: "Not allowed" });

    res.json({

      history:
        db.prepare(`
          SELECT *
          FROM note_versions
          WHERE note_id = ?
          ORDER BY created_at DESC
          LIMIT 50
        `).all(id)

    });

  }
);


/*
=========================================================
CODE PROJECTS
=========================================================
*/

app.get(
  "/api/projects",
  requireLogin,
  (req, res) => {

    const projects =
      db.prepare(`
        SELECT
          id,
          name,
          updated_at
        FROM code_projects
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).all(
        req.session.userId
      );


    res.json({
      projects
    });

  }
);


app.post(
  "/api/projects",
  requireLogin,
  (req, res) => {

    const time =
      now();


    const result =
      db.prepare(`
        INSERT INTO code_projects (
          user_id,
          name,
          html,
          css,
          js,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(

        req.session.userId,

        String(
          req.body.name ||
          "Untitled Project"
        ).slice(0, 100),

        String(
          req.body.html || ""
        ),

        String(
          req.body.css || ""
        ),

        String(
          req.body.js || ""
        ),

        time,

        time

      );


    res.json({

      project:
        db.prepare(`
          SELECT *
          FROM code_projects
          WHERE id = ?
        `).get(
          result.lastInsertRowid
        )

    });

  }
);


app.get(
  "/api/projects/:id",
  requireLogin,
  (req, res) => {

    const project =
      db.prepare(`
        SELECT *
        FROM code_projects
        WHERE id = ?
        AND user_id = ?
      `).get(
        Number(req.params.id),
        req.session.userId
      );


    if (!project) {

      return res
        .status(404)
        .json({
          error:
            "Not found"
        });

    }


    res.json({
      project
    });

  }
);


app.put(
  "/api/projects/:id",
  requireLogin,
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    db.prepare(`
      UPDATE code_projects
      SET
        name = ?,
        html = ?,
        css = ?,
        js = ?,
        updated_at = ?
      WHERE id = ?
      AND user_id = ?
    `).run(

      String(
        req.body.name ||
        "Untitled"
      ).slice(0, 100),

      String(
        req.body.html || ""
      ),

      String(
        req.body.css || ""
      ),

      String(
        req.body.js || ""
      ),

      now(),

      id,

      req.session.userId

    );


    const project =
      db.prepare(`
        SELECT *
        FROM code_projects
        WHERE id = ?
        AND user_id = ?
      `).get(
        id,
        req.session.userId
      );


    if (!project) {

      return res
        .status(404)
        .json({
          error:
            "Not found"
        });

    }


    res.json({
      project
    });

  }
);


/*
=========================================================
CAMPAIGNS
=========================================================
*/

app.get(
  "/api/campaigns",
  requireLogin,
  (req, res) => {

    const campaigns =
      db.prepare(`
        SELECT *
        FROM campaigns
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(
        req.session.userId
      );


    for (
      const campaign
      of campaigns
    ) {

      campaign.views =
        db.prepare(`
          SELECT COUNT(*) AS n
          FROM ad_events
          WHERE campaign_id = ?
          AND type = 'view'
        `).get(
          campaign.id
        ).n;


      campaign.clicks =
        db.prepare(`
          SELECT COUNT(*) AS n
          FROM ad_events
          WHERE campaign_id = ?
          AND type = 'click'
        `).get(
          campaign.id
        ).n;

    }


    res.json({
      campaigns
    });

  }
);


app.post(
  "/api/campaigns",
  requireLogin,
  (req, res) => {

    const budget =
      Math.max(
        500,
        Math.round(
          Number(
            req.body.budgetDollars ||
            5
          ) * 100
        )
      );


    const result =
      db.prepare(`
        INSERT INTO campaigns (
          user_id,
          name,
          headline,
          description,
          destination_url,
          placement,
          balance_cents,
          cpc_cents,
          status,
          created_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(

        req.session.userId,

        String(
          req.body.name ||
          "Campaign"
        ).slice(0, 100),

        String(
          req.body.headline ||
          ""
        ).slice(0, 120),

        String(
          req.body.description ||
          ""
        ).slice(0, 240),

        String(
          req.body.destinationUrl ||
          ""
        ).slice(0, 500),

        String(
          req.body.placement ||
          "tile"
        ),

        budget,

        10,

        "paused",

        now()

      );


    res.json({

      campaign:
        db.prepare(`
          SELECT *
          FROM campaigns
          WHERE id = ?
        `).get(
          result.lastInsertRowid
        )

    });

  }
);


app.post(
  "/api/campaigns/:id/toggle",
  requireLogin,
  (req, res) => {

    const campaign =
      db.prepare(`
        SELECT *
        FROM campaigns
        WHERE id = ?
        AND user_id = ?
      `).get(

        Number(
          req.params.id
        ),

        req.session.userId

      );


    if (!campaign) {

      return res
        .status(404)
        .json({
          error:
            "Not found"
        });

    }


    const next =
      campaign.status ===
      "active"
        ? "paused"
        : "active";


    db.prepare(`
      UPDATE campaigns
      SET status = ?
      WHERE id = ?
    `).run(
      next,
      campaign.id
    );


    res.json({
      status: next
    });

  }
);


app.post(
  "/api/campaigns/:id/topup",
  requireLogin,
  (req, res) => {

    const cents =
      Math.max(
        500,
        Math.round(
          Number(
            req.body.amountDollars ||
            5
          ) * 100
        )
      );


    db.prepare(`
      UPDATE campaigns
      SET balance_cents =
        balance_cents + ?
      WHERE id = ?
      AND user_id = ?
    `).run(

      cents,

      Number(
        req.params.id
      ),

      req.session.userId

    );


    res.json({
      success: true
    });

  }
);


/*
=========================================================
PUBLIC ADS
=========================================================
*/

app.get(
  "/api/ads",
  (req, res) => {

    const ads =
      db.prepare(`
        SELECT *
        FROM campaigns
        WHERE status = 'active'
        AND balance_cents >= cpc_cents
        ORDER BY RANDOM()
        LIMIT 3
      `).all();


    ads.forEach(
      ad => {

        db.prepare(`
          INSERT INTO ad_events (
            campaign_id,
            type,
            browser_id,
            created_at
          )
          VALUES (?, ?, ?, ?)
        `).run(

          ad.id,

          "view",

          String(
            req.query.browserId ||
            ""
          ).slice(0, 120),

          now()

        );

      }
    );


    res.json({
      ads
    });

  }
);


app.post(
  "/api/ads/:id/click",
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    const ad =
      db.prepare(`
        SELECT *
        FROM campaigns
        WHERE id = ?
        AND status = 'active'
      `).get(id);


    if (
      !ad ||
      ad.balance_cents <
      ad.cpc_cents
    ) {

      return res
        .status(404)
        .json({
          error:
            "Ad unavailable"
        });

    }


    db.prepare(`
      INSERT INTO ad_events (
        campaign_id,
        type,
        browser_id,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `).run(

      id,

      "click",

      String(
        req.body.browserId ||
        ""
      ).slice(0, 120),

      now()

    );


    db.prepare(`
      UPDATE campaigns
      SET balance_cents =
        MAX(
          0,
          balance_cents -
          cpc_cents
        )
      WHERE id = ?
    `).run(id);


    res.json({
      url:
        ad.destination_url
    });

  }
);


/*
=========================================================
ADMIN LOGIN / STATS
=========================================================
*/

app.get(
  "/api/admin/stats",
  (req, res) => {

    const password =
      String(
        req.get(
          "x-admin-password"
        ) || ""
      );


    const adminAuthenticated = Boolean(req.session && req.session.isAdmin && req.session.userId);
    const headerAuthenticated = Boolean(ADMIN_PASSWORD && password &&
      password.length === ADMIN_PASSWORD.length &&
      crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD)));
    if (!headerAuthenticated) {

      return res
        .status(401)
        .json({
          error:
            "Incorrect admin password"
        });

    }


    const totalVisits =
      db.prepare(`
        SELECT COUNT(*) AS n
        FROM visits
      `).get().n;


    const uniqueVisitors =
      db.prepare(`
        SELECT
          COUNT(
            DISTINCT browser_id
          ) AS n
        FROM visits
      `).get().n;


    const users =
      db.prepare(`
        SELECT COUNT(*) AS n
        FROM users
      `).get().n;


    const campaigns =
      db.prepare(`
        SELECT COUNT(*) AS n
        FROM campaigns
      `).get().n;


    const today =
      new Date()
        .toISOString()
        .slice(0, 10);


    const todayVisits =
      db.prepare(`
        SELECT COUNT(*) AS n
        FROM visits
        WHERE substr(
          created_at,
          1,
          10
        ) = ?
      `).get(today).n;


    const daily =
      db.prepare(`
        SELECT
          substr(
            created_at,
            1,
            10
          ) AS date,

          COUNT(*) AS visits,

          COUNT(
            DISTINCT browser_id
          ) AS unique_visitors

        FROM visits

        GROUP BY
          substr(
            created_at,
            1,
            10
          )

        ORDER BY date DESC

        LIMIT 14
      `).all().reverse();


    res.json({

      totalVisits,

      uniqueVisitors,

      users,

      campaigns,

      todayVisits,

      daily

    });

  }
);


/*
=========================================================
FRONTEND
=========================================================
*/

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


/*
=========================================================
START
=========================================================
*/

app.listen(
  PORT,
  () => {

    console.log(
      `Zeropad running on port ${PORT}`
    );

  }
);
