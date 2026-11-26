# Abhishek’s Daily Tracker

I built this tracker because I wanted one place to see what I must do each morning, plan the rest of my day, and check how consistently I’m following through. I can break a goal into daily work and see my progress without signing in.

[Open Abhishek’s Daily Tracker](https://dynamicak.github.io/daily-activity-tracker/)

## What I can do

- **Today.** Browse dates, check off must-dos and other to-dos, edit a single occurrence or the rest of a recurring task, and move overdue one-time tasks to today.
- **Goals.** Set a date range, make daily plans, add targets and rest days, and copy a plan with independent unchecked tasks. The SQL practice template is optional. A fresh tracker opens empty.
- **Profile & Analytics.** Change my name and time zone, review any calendar year, open checklists from the heatmap, and see monthly and goal-level progress.

## My stack

I use plain HTML, CSS, and JavaScript. IndexedDB stores tracker data in the browser. Firebase Realtime Database and anonymous Firebase Authentication are available through an opt-in configuration for private cloud saving. GitHub Pages serves the static app. Node.js, Playwright, and the Firebase Emulator Suite run the tests.

| Path | What I keep here |
| --- | --- |
| `app/` | Static pages, responsive styles, routing, task scheduling, analytics, and storage |
| `app/firebase-config.js` | Public Firebase web configuration and the cloud switch |
| `database.rules.json` | Standalone proposed tracker rules for the emulator |
| `firebase.json` | Local Realtime Database emulator configuration |
| `tests/` | Model, emulator, and browser tests, plus the local static server |
| `.github/workflows/pages.yml` | Pull request tests, Pages deployment, and live browser verification |

## Run it locally

I use Node.js 22 or newer. From a terminal:

```sh
git clone https://github.com/DynamicAk/daily-activity-tracker.git
cd daily-activity-tracker
npm start
```

I open [http://127.0.0.1:4220/daily-activity-tracker/](http://127.0.0.1:4220/daily-activity-tracker/). The app itself needs no npm packages or build step. I install the test tools when I need them:

```sh
npm install --no-audit --no-fund
npm test
npx playwright install chromium
npm run test:browser
npm run test:rules
```

The rules tests need a supported Java installation. CI uses Java 21. They run on the `demo-daily-tracker` emulator namespace and use synthetic records. GitHub Actions records its local and live browser results separately from the emulator result.

## How I save data

The Pages build is configured for **device-only storage (IndexedDB)**. The browser checks this mode by looking for **Saved on this device** and testing persistence across refresh and browser restart. The test job verifies those behaviors before deployment and checks them again on the published URL. There is no account screen. A different browser profile or device starts with its own data. Clearing this browser's site data can remove the local tracker.

I reused only the public Firebase web configuration from my portfolio’s `assets/js/visitor.js`. The built app uses the separate tracker path `dailyTracker/users/{uid}` when cloud saving is approved and enabled. Tracker code and tests keep `visitors/count` and `visitors/live` outside their operations. I keep personal task data and Firebase admin credentials out of the repository.

### Enable private cloud saving later

1. In the Firebase console, review **Authentication → Sign-in method → Anonymous** and confirm that the published site can use it. Firebase production rules changes require my separate approval.
2. Review the effective Realtime Database rules at the root, `dailyTracker`, and `dailyTracker/users`. Any grant at one of these levels applies to descendants. A stricter owner rule cannot override an ancestor grant.
3. After approval, merge only the `rules.dailyTracker` subtree from `database.rules.json` into the existing production rules. Keep the rest of the production rules intact. If a root rule currently grants broad access, resolve that with an approved, tested rules change before adding tracker data. Test the merged rules in the emulator first and keep a copy of the current production rules.
4. Verify the effective production rules with the Rules Playground and disposable identities. The owner should be able to read and write their own test record. Signed-out users and a second identity should be denied reads and writes at the test record and its child paths. Verify ancestor queries and cross-owner writes are denied. Use only reserved test tracker paths and synthetic data. Delete the disposable record afterward.
5. Set `enableCloud = true` in `app/firebase-config.js` and redeploy after these checks pass. The app signs in anonymously in the background. A cloud write merges stable task IDs and completion records in a transaction. Retrying a saved revision does not duplicate records. **Sync pending** means the last local change still needs confirmation. **Synced** means Firebase acknowledged the saved revision.

I keep the device copy even when cloud saving is available. Anonymous access is tied to the browser identity. Clearing browser data can remove access to a previous anonymous cloud copy.

## How I measure progress

- Every task belongs to its scheduled date in my selected time zone. My default time zone is `Asia/Kolkata`. Today and Goals use the same dated occurrence, and analytics counts it once.
- The yearly must-do rate divides completed must-dos by must-dos scheduled from January 1 through today, within the selected year. Before there are any, I see “No must-dos scheduled.” Monthly and daily detail can also show future plans.
- I earn a streak day when I complete every scheduled must-do for that date. A day without must-dos pauses the streak. An incomplete date breaks the streak only after it ends in my time zone. The streak can continue across December 31. For an older year, I see the streak at that year’s end and the best streak earned in that year.
- A goal is complete once it has at least one planned task and I have completed all of its tasks. The yearly completed-goal count uses the year of the goal’s latest scheduled task. Undoing a completion updates both the goal and the count.

## Publish through GitHub Pages

I use **Settings → Pages → Build and deployment → Source → GitHub Actions**. I open a feature-branch pull request into `main` and check the workflow results before merging. A passing push to `main` publishes the `app/` folder and runs browser tests against the deployment URL. I can also run the workflow from the Actions tab. The app uses relative asset paths and hash links such as `#today/2026-11-26` and `#analytics/2025`, so refreshing a view works under the repository path.
