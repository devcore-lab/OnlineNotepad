ZEROPAD COMPLETE

WHAT IS INCLUDED
- Homepage with up to 3 live ad slots
- Completely ad-free writing editor
- Notes and automatic note-version history for everyone
- Optional Zeropad user accounts
- Account-only HTML/CSS/JavaScript code editor with live preview
- Saved code projects
- Advertising page
- $0.10 CPC campaigns
- $5 minimum campaign budget
- Advertiser dashboard (same normal Zeropad account)
- Ad views, clicks, CTR and remaining balance
- Pause/start campaigns
- $5 balance top-ups (demo balance only; no payment processor)
- Visitor analytics
- Admin dashboard
- SQLite database
- Node.js + Express backend

LOCAL SETUP

1. Install Node.js.
2. Unzip this folder.
3. In Terminal:

   cd Zeropad_Complete
   npm install
   npm start

4. Open:

   http://localhost:3000

ADMIN

Open:
   http://localhost:3000/#admin

Default admin password:
   change-me-now

For production set:
   ADMIN_PASSWORD
   SESSION_SECRET

RENDER

Create a Render Web Service.

Build command:
   npm install

Start command:
   npm start

Environment variables:
   ADMIN_PASSWORD = your strong admin password
   SESSION_SECRET = a long random secret

IMPORTANT ABOUT DATABASE ON RENDER

This app uses SQLite (`zeropad.db`).
SQLite is excellent locally. On Render, you should attach a persistent disk if you want the database to survive restarts/redeploys.

Mount a persistent disk to the project directory, or later migrate the SQLite data to PostgreSQL for larger-scale production use.

PAYMENTS

Campaign balances are implemented as application balances, but this ZIP does NOT charge real cards.
A real payment processor (Stripe, PayPal, etc.) should be connected before accepting money.
Do not manually claim to advertisers that a payment was processed unless you actually add a payment provider.

CPC

Campaigns use 10 cents ($0.10) per click.
The campaign creator must enter at least $5 budget.

ADVERTISING

There are 3 homepage slots. The writer page has no advertising.

EMAIL

You can add ads@zeropad.com to the advertise page later if desired.
