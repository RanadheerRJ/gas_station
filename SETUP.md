# Setting this up, step by step

Written for someone who has not done this before. Every command is meant to be
copied and pasted exactly. If something goes wrong, the "When it breaks"
section at the bottom covers the errors you are most likely to hit.

You will be typing commands into a **terminal**:

- **Windows** — press Start, type `powershell`, open **Windows PowerShell**.
- **Mac** — press Cmd+Space, type `terminal`, press Enter.

The whole thing takes about 30 minutes, most of it waiting on one deploy.

---

## Step 0 — Install the two things you need

**Node.js 20.** Go to <https://nodejs.org> and install the **LTS** version.
Then close your terminal, open a new one, and check:

```bash
node --version
```

You want `v20.something` or higher. If the command is not found, Node did not
install correctly, or you need to open a fresh terminal window.

**Git.** Check whether you already have it:

```bash
git --version
```

If that errors, install it from <https://git-scm.com/downloads>.

---

## Step 1 — Get the code onto your computer

Yes — clone first. Everything else happens inside the folder you clone.

There is one wrinkle. The `main` branch of the repository currently contains
only a README; all the actual code is on the branch the work was done on. So
you must clone **that branch**, not the default one:

```bash
git clone --branch arena/01a0b35a-gas-station https://github.com/RanadheerRJ/gas_station.git
cd gas_station
```

Check that you got the real thing:

```bash
ls
```

You should see `src`, `functions`, `firestore.rules`, `package.json` and
others. If all you see is `README.md`, you cloned the wrong branch — delete
the folder and run the clone command again exactly as written.

> **Tidying this up later.** Once you merge pull request #1 on GitHub, `main`
> will contain everything and a plain `git clone` will be enough. You do not
> have to do that now.

---

## Step 2 — Install the project's dependencies

Two separate installs, because the website and the server code are separate
projects:

```bash
npm install
npm install --prefix functions
```

Each takes a minute or two and prints a lot of text. Warnings are normal.
Only stop if you see the word `error`.

---

## Step 3 — Add your Firebase keys

Create a file named exactly `.env.local` in the `gas_station` folder, with
this in it:

```
VITE_FIREBASE_API_KEY=AIzaSyDWnmHmjAnjjkYACMZEUFoAWfHk7vlpK_o
VITE_FIREBASE_AUTH_DOMAIN=gasstation-7c7ab.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gasstation-7c7ab
VITE_FIREBASE_STORAGE_BUCKET=gasstation-7c7ab.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=91745032420
VITE_FIREBASE_APP_ID=1:91745032420:web:94f6771d5927228e6cb4f1
VITE_FUNCTIONS_REGION=us-central1
VITE_USE_EMULATORS=false
```

The fastest way is to copy the template and edit it:

```bash
cp .env.example .env.local
```

Then open `.env.local` in any text editor (Notepad is fine) and paste the
values above over what is there.

The leading dot in the filename matters, and so does the exact spelling.
This file is deliberately excluded from Git, so your keys never get committed.

---

## Step 4 — Sign in to Firebase

```bash
npx firebase login
```

A browser window opens. Sign in with the Google account that owns the
`gasstation-7c7ab` project and click Allow. The terminal will confirm.

You do **not** need to pick a project afterwards — the repository already
points at `gasstation-7c7ab`.

---

## Step 5 — Turn on billing

Cloud Functions will not deploy without this. There is no way around it.

1. Go to <https://console.firebase.google.com> and open **gasstation-7c7ab**.
2. Bottom-left, click the plan name (probably **Spark**).
3. Choose **Blaze — pay as you go** and add a card.

For a handful of stations this realistically costs nothing — the free monthly
allowance is far more than this app will use. Set a budget alert for a small
amount if you want peace of mind.

---

## Step 6 — Set up the database and sign-in method

Still in the Firebase console:

**Database:**

1. Left sidebar → **Build → Firestore Database → Create database**.
2. Choose **Start in production mode**. This denies all access, which is
   correct — the next step replaces those defaults with the real rules.
3. Pick a location close to your stations, for example `asia-south1`
   (Mumbai). **You cannot change this later.**

**Sign-in:**

1. Left sidebar → **Build → Authentication → Get started**.
2. Choose **Email/Password**, enable the top toggle only, and save.

This is used by exactly one account, yours. Everyone else signs in with a
username and PIN, which needs nothing enabled here.

---

## Step 7 — Upload the security rules and the server code

Back in your terminal, in the `gas_station` folder:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

That one is quick. Then:

```bash
npx firebase deploy --only functions
```

**This one takes 5–10 minutes** and is the step most likely to complain.

If it fails saying an API needs enabling (Cloud Build, Artifact Registry, or
similar), that is normal on a brand-new project. Either click the link it
prints and enable it, or wait a minute and run the same command again. It
often succeeds on the second attempt.

When it finishes you should see `Deploy complete!` and a list of about twenty
function names.

> **Do not skip the rules deploy.** Until it runs, your database is using
> Firebase's defaults rather than this app's rules.

---

## Step 8 — Create your own account

The app creates every account except the first one. That one is you, by hand.

**8a. Create the user:**

1. Firebase console → **Authentication → Users → Add user**.
2. Enter your email and a password. Click Add user.

**8b. Download the admin key:**

1. Click the gear icon → **Project settings → Service accounts**.
2. Click **Generate new private key**, then confirm. A `.json` file downloads.
3. Move that file into your `gas_station` folder and **rename it exactly**:

   ```
   serviceAccountKey.json
   ```

> This file is the master key to your project — it ignores every security
> rule. It is excluded from Git so it cannot be uploaded by accident. Delete
> it when you finish Step 8c.

**8c. Make yourself the administrator:**

```bash
node scripts/setAdminClaim.cjs your-email@example.com
```

Use the same email as in step 8a. It prints the user id it updated.

**8d. Delete the key file.** You are done with it:

```bash
rm serviceAccountKey.json
```

On Windows PowerShell: `del serviceAccountKey.json`

---

## Step 9 — Run it

```bash
npm run dev
```

Open the address it prints — it will be
<http://localhost:5173/gas_station/>. Note the `/gas_station/` on the end;
the plain address will not work.

Sign in with the email and password from step 8a.

You should land on a screen whose only option is **Invite Owner**. That is
correct: the developer account exists only to create owners.

To stop the server later, press **Ctrl+C** in the terminal.

---

## Step 10 — Create your first station

Two ways. Either is fine.

**In the app**, which is the normal path:

1. **Invite Owner** — create the owner. You choose their 4-digit PIN and tell
   them; the app never generates or emails one.
2. Sign out, sign in as that owner (username + PIN).
3. **Setup** — add pumps, nozzles and tanks, and set today's fuel prices.

**Or seed one from the terminal**, faster for testing. This needs
`serviceAccountKey.json` again, so do it before step 8d, or download another:

```bash
node scripts/seedStation.cjs --owner "Ravi Kumar" --station "Highway Fuels" --pin 4827 --dry-run
```

`--dry-run` only shows what it would create. Remove it to actually create an
owner, a station, 2 pumps, 4 nozzles and 2 tanks.

**Set real fuel prices in Setup before opening a shift.** The seeder puts
prices at zero on purpose — an invented rate that looks plausible is more
dangerous than an obvious blank.

---

## When it breaks

**`npm: command not found`**
Node is not installed, or you need a fresh terminal window. Redo step 0.

**The page loads but says Firebase is not configured**
`.env.local` is missing, misspelled, or in the wrong folder. It must sit
beside `package.json`. After creating it, stop the server with Ctrl+C and run
`npm run dev` again — it only reads that file at startup.

**`auth/unauthorized-domain` when signing in**
Firebase console → **Authentication → Settings → Authorized domains → Add
domain**. `localhost` is usually there already; add any other address you open
the app from.

**`Your project must be on the Blaze plan`**
Step 5.

**The functions deploy fails mentioning an API**
Normal on a new project. Enable what it names, or just run the command again.

**`permission-denied` everywhere once signed in**
The rules deploy in step 7 did not run. Run it again.

**Signed in, but the app still thinks you are not an admin**
Custom permissions are attached when you sign in. Sign out and back in after
step 8c.

**`EACCES` or permission errors during `npm install`**
Do not use `sudo`. It usually means Node was installed system-wide awkwardly;
reinstalling from nodejs.org normally fixes it.

---

## What to do after it works

- **Merge pull request #1** on GitHub so `main` holds the real code. After
  that a plain `git clone` is enough, and the GitHub Pages deployment can run.
- **Read the "Before you point this at real stations" section of
  `README.md`** before putting real money through this. Sign-in is a 4-digit
  PIN, which is reasonable on a phone in a forecourt and weak on a public URL.
- **Run the backend tests** if you plan to change the server code. They need
  Java installed:

  ```bash
  npm run test:emulator
  ```

  Be aware these have never been run — they were written in an environment
  that could not execute them. Expect to fix a few before they pass.
