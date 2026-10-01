# Night Shift — Agent Theater

An interactive demo of an AI agent squad resolving a 2 AM production incident, with a human in the loop and governance built in.

- Offline scripted mode: `npm install && npm run demo` → http://localhost:4173 (or open `apps/web/dist-offline/index.html`)
- Live mode on Amazon Bedrock: copy `.env.example` to `.env`, fill it in, `npm run dev:live`
- Decks: `npm run deck` → `deck/out/`
- AWS hosting: `npm run cdk:deploy -- -c region=… -c modelId=…` (see `infra/README.md`)

Start with `CLAUDE.md`, then `docs/BRIEF.md`.
