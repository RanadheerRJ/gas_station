# Getting this live on GitHub Pages

Written for someone who has not done this before. The goal is a working site
at

```
https://ranadheerrj.github.io/gas_station/
```

that you can open on any phone or computer. No running anything on your own
machine to use it day to day.

There is still some terminal work, but only **once**, and only to push the
backend up to Firebase. GitHub builds and publishes the website itself, every
time the code changes.

**Roughly 30 minutes**, most of it waiting on one command.

---

## The two halves

It helps to know why there are two jobs here:

| Piece | What it is | Where it lives |
| --- | --- | --- |
| The website | The screens you click | GitHub Pages, published automatically |
| The backend | Login, database, all the rules | Firebase, pushed from your machine once |

GitHub Pages can only serve files. It cannot run the login or the ledger
logic. That is what Firebase is for, and Firebase has to be set up from a
terminal because there is no way to upload security rules from a web page.

Do the backend first, or the website will load and then fail the moment
anybody tries to sign in.

---

# Part 1 — The backend (once, from a terminal)

## Step 0 — Install Node.js and Git

Open a terminal:

- **Windows** — Start, type `powershell`, open **Windows PowerShell**
- **Mac** — Cmd+Space, type `terminal`, Enter

**Node.js:** install the **LTS** version from <https://nodejs.org>. Then close
the terminal, open a new one, and check:

```bash
node --version
```

You want `v20` or higher. If it says command not found, open a fresh terminal
window; if it still does, the install did not work.

**Git:**

```bash
git --version
```

If that errors, install from <https://git-scm.com/downloads>.

## Step 1 — Download the code

```bash
git clone https://github.com/RanadheerRJ/gas_station.git
cd gas_station
```

Check it worked:

```bash
ls
```

You should see `src`, `functions`, `firestore.rules` and others. If you only
see `README.md`, delete the folder and run the clone command again exactly as
written.

## Step 2 — Install the dependencies

```bash
npm install
npm install --prefix functions
```

Two installs because the website and the server code are separate projects.
Each takes a minute and prints a lot. Warnings are fine; only stop for `error`.

## Step 3 — Sign in to Firebase

```bash
npx firebase login
```

A browser opens. Sign in with the Google account that owns
**gasstation-7c7ab** and click Allow.

You do not need to choose a project afterwards — the repository already points
at yours.

## Step 4 — Switch on billing

Cloud Functions will not deploy without it, and there is no way around that.

1. <https://console.firebase.google.com> → open **gasstation-7c7ab**
2. Bottom-left, click the plan name (probably **Spark**)
3. Choose **Blaze — pay as you go**, add a card

For a few stations this realistically costs nothing; the free monthly
allowance is far larger than this app will use. Set a budget alert if you want
reassurance.

## Step 5 — Create the database and turn on sign-in

Still in the Firebase console.

**Database:**

1. **Build → Firestore Database → Create database**
2. Choose **Start in production mode** — this denies everything, which is
   correct, because Step 6 replaces it with the real rules
3. Pick a location near your stations, e.g. `asia-south1` (Mumbai).
   **This cannot be changed later.**

**Sign-in:**

1. **Build → Authentication → Get started**
2. Choose **Email/Password**, enable the first toggle only, save

That is for one account: yours. Everyone else uses a username and PIN, which
needs nothing enabled here.

## Step 6 — Upload the rules and the server code

Back in the terminal, inside `gas_station`:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

Quick. Then:

```bash
npx firebase deploy --only functions
```

**This takes 5–10 minutes** and is the step most likely to complain.

If it fails saying an API needs enabling (Cloud Build, Artifact Registry, or
similar), that is normal on a new project. Click the link it prints and enable
it, or just run the command again — it usually works the second time.

You want `Deploy complete!` and a list of about twenty function names.

## Step 7 — Make yourself the administrator

The app creates every account except the first. That one is you, by hand.

**7a.** Firebase console → **Authentication → Users → Add user**. Enter your
email and a password.

**7b.** Gear icon → **Project settings → Service accounts** → **Generate new
private key**. A `.json` file downloads. Move it into your `gas_station`
folder and rename it exactly:

```
serviceAccountKey.json
```

> This file is the master key to your project — it ignores every security
> rule. It is excluded from Git so it cannot be uploaded by accident. You
> delete it in 7d.

**7c.** Grant yourself admin, using the same email as in 7a:

```bash
node scripts/setAdminClaim.cjs your-email@example.com
```

It prints the user id it changed.

**7d.** Delete the key:

```bash
rm serviceAccountKey.json
```

Windows PowerShell: `del serviceAccountKey.json`

The backend is now done. You never need to repeat Part 1.

---

# Part 2 — Publishing the website

## Step 8 — Merge the code into `main`

The publishing job only runs from the `main` branch, and `main` is still
nearly empty. Merging is what starts everything.

1. Go to <https://github.com/RanadheerRJ/gas_station/pull/1>
2. Click **Merge pull request**, then **Confirm merge**

## Step 9 — Turn on GitHub Pages

1. <https://github.com/RanadheerRJ/gas_station/settings/pages>
2. Under **Build and deployment**, set **Source** to **GitHub Actions**

   Not "Deploy from a branch" — that serves the raw files, and this repository
   contains source code that has to be built first.

That is the only setting. There are **no secrets to add** — the Firebase
config is committed in `.env.production`, because it ends up readable inside
the website anyway and hiding it would only hide it from you.

## Step 10 — Let it build

Merging in Step 8 should have started a build already.

1. <https://github.com/RanadheerRJ/gas_station/actions>
2. Click the run at the top

It takes 2–3 minutes. A green tick means published. If you turned Pages on
after merging, click **Re-run all jobs** on that run.

## Step 11 — Allow the Pages address to sign people in

Firebase rejects sign-in from any address it does not know, so this is the
step that makes login actually work.

1. Firebase console → **Authentication → Settings → Authorized domains**
2. **Add domain**
3. Enter exactly:

   ```
   ranadheerrj.github.io
   ```

Miss this and the site loads perfectly but every sign-in fails with
`auth/unauthorized-domain`.

## Step 12 — Open it

```
https://ranadheerrj.github.io/gas_station/
```

Switch to the **Developer** tab and sign in with the email and password from
Step 7a. You should land on a screen whose only option is **Invite Owner** —
correct, because the developer account exists only to create owners. Staff
(owners, managers, attendants) use the default **Staff** tab with username and
PIN.

On a phone, use your browser's **Add to Home Screen** and it installs like an
app, full screen and offline-capable.

---

## Step 13 — Create your first station

1. **Invite Owner** — you choose their 4-digit PIN and tell them. The app
   never generates or sends one.
2. Sign out, sign back in as that owner using their username and PIN.
3. **Setup** — add pumps, nozzles and tanks, and set today's fuel prices.

**Set real prices before opening a shift.** Everything the app calculates
hangs off them.

---

## From now on

Any change pushed to `main` rebuilds and republishes the site within a few
minutes. You never touch the terminal again unless you change the server code
in `functions/`, which needs `npx firebase deploy --only functions`.

---

## When it breaks

**`npm: command not found`**
Node is not installed, or you need a new terminal window. Redo Step 0.

**`Your project must be on the Blaze plan`**
Step 4.

**The functions deploy fails mentioning an API**
Normal on a new project. Enable what it names, or run the command again.

**The Actions run is red**
Open it and click the failed step. If it says the bundle has no project id,
`.env.production` did not make it into the merge.

**The site loads but sign-in fails with `auth/unauthorized-domain`**
Step 11. This is the most common one.

**Signed in, but the app does not treat you as an admin**
Permissions attach when you sign in. Sign out and back in after Step 7c.

**`permission-denied` everywhere once signed in**
The rules deploy in Step 6 did not run. Run it again.

**404 at the Pages address**
Either the build has not finished, or Pages Source is not set to
**GitHub Actions**. Check Step 9, then the Actions tab.

---

## Before real money goes through this

Worth reading the security section of `README.md`, but the short version:

Sign-in is a username and a **4-digit PIN** on a web address anyone can find.
That is reasonable for a phone in a forecourt and weak for a public URL. What
protects you is the security rules, the lockout after repeated wrong PINs, and
the fact that nobody can create an account without an existing privileged one.

If that is not a trade you want, the same code deploys to Firebase Hosting
instead, which can sit behind stricter access controls:

```bash
npm run build && npx firebase deploy --only hosting
```

---

## Running it locally (optional)

Only useful if you want to change the code. Not needed to use the app.

```bash
cp .env.example .env.local     # then paste your Firebase values in
npm run dev
```

Then open <http://localhost:5173/gas_station/> — note the `/gas_station/` on
the end; the bare address will not work. Add `localhost` to Firebase's
authorized domains too.
