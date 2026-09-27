# Night Shift — Agent Theater

An interactive demo of an AI agent squad resolving a 2 AM production incident, with a human in the loop and governance built in.

- Offline scripted mode: `npm ci && npm run demo` → http://localhost:4173 (or open `apps/web/dist-offline/index.html`)
- Live mode on Amazon Bedrock: copy `.env.example` to `.env`, fill it in, `npm run dev:live`
- Decks: `npm run deck` → `deck/out/`
- AWS hosting: `npm run cdk:deploy -- -c region=… -c modelId=…` (see `infra/README.md`)

## Setup

Use `npm ci`, not `npm install`, for a fresh clone. On some npm/Node combinations,
plain `npm install` silently drops the platform-specific optional dependencies
(esbuild/rolldown native bindings) from `package-lock.json`, which breaks the
Vite build with an error like `Cannot find native binding` (see
[npm/cli#4828](https://github.com/npm/cli/issues/4828)). `npm ci` installs
strictly from the committed lockfile and doesn't rewrite it.

If you hit that error anyway (e.g. `package-lock.json` shows as modified in
`git status` with no changes you made), restore it and reinstall clean:

```bash
git checkout -- package-lock.json
rm -rf node_modules
npm ci
```

Start with `CLAUDE.md`, then `docs/BRIEF.md`.
