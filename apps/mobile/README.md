# Digitel mobile (field sales)

The Expo (React Native) app field reps use: today's plan, leads, lead details
with call / WhatsApp / directions, logging calls, visits, demos and notes, and
follow-ups. It talks to the same API as the web dashboard and signs in with the
same accounts.

## Why it's outside the pnpm workspace

Expo SDK 57 needs React 19, while `apps/web` is on React 18, and this repo uses
pnpm's hoisted `node_modules`, which can't hold both. So `pnpm-workspace.yaml`
excludes this folder and it installs with npm on its own. The shared constants
(`@digitel/shared`) are compiled straight from `packages/shared/src` — see
`metro.config.js` and the `paths` in `tsconfig.json`.

## Run it

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on an Android phone. By default the app
talks to the production API. To point it at a local API, create
`apps/mobile/.env.local` (git-ignored):

```
EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:4000
```

`npx expo start --web` runs it in a browser, which is handy for a quick look;
there the date pickers fall back to typed dates.

## Build an installable APK

Builds go through Expo's EAS service and need a free Expo account:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

## Checks

```bash
npm run typecheck
npx expo export --platform android
```
