# Runbook — demo day

## 1. Setup (once)
1. Install Node.js 20 LTS or newer.
2. `git clone` the repo, then `npm install`.
3. `npm run build:offline` → confirm `apps/web/dist-offline/index.html` opens from the file browser with Wi-Fi **off**.
4. Fill `config/branding.json` (org, client, presenter name).
5. `npm run deck` → check both decks in PowerPoint.
6. Optional live mode: `cp .env.example .env`, set `AWS_PROFILE`, `AWS_REGION`, `BEDROCK_MODEL_ID`; confirm model access is enabled in the Bedrock console; `npm run dev:live`; open `/api/health`.

## 2. Pre-flight

**Day before**
- Full rehearsal with `/rehearse` (or manually): happy path, reject path, chaos. Time it.
- Copy `dist-offline/index.html` and both decks to a USB stick as a backup.
- If using live mode: run one full live session; check that no turn fell back (settings menu reads "Live on Bedrock · 0 scripted lines"; nothing on stage shows the mode).
- Each page load plays a fresh take (different wording and timing, same facts). To rehearse or repeat an exact run, note the take in the settings menu and add `take=<n>` to the URL; `take=0` is the canonical script.

**One hour before**
- Laptop on power, notifications off, display 1920×1080, browser zoom 100%, full screen (F11 / ⌃⌘F).
- Open the offline build; press `R` to reset. Press `P` for presenter mode.
- If a tablet will be handed over for approval: open the same build on it or use the laptop.

## 3. Presenter script (about 6 minutes)

| Time | On screen | Say (suggested) |
|---|---|---|
| 0:00 | Title card | "It's 2:07 in the morning. Checkout at an online retailer is slowing down. Nobody's awake. Let's see who is." |
| 0:15 | Act 1 alert | "Sentinel watches the numbers. Latency is six times over target. It's not a blip, so it raises a SEV-2." |
| 0:35 | Act 2 fan-out | "The Orchestrator asks three questions at once: what's failing, what changed, how far it spreads." |
| 0:50 | Act 3 | "Watch the evidence board. Logs say the app is starving for database connections. The deploy history shows a release twelve minutes earlier. The database itself is fine." |
| 1:30 | Root cause card | "Three independent clues agree. Root cause in under two minutes, with a confidence score, not a guess." |
| 1:45 | Act 4 | "Fixer proposes options with time, risk, and reversibility. Guardian checks the recommended one against policy. Everything passes, except one rule: a human must approve production changes." |
| 2:15 | Gate | Hand over the tablet or turn to the client: "You're the on-call engineer. Your call." |
| 2:30 | Act 6 | "Rolling back one pod at a time. Watch the line." (pause) "Back under target." |
| 3:10 | Act 7 | "Scribe writes two things: a plain update for stakeholders and a blameless postmortem for engineers. Owners are proposed, not assigned." |
| 3:40 | Scorecard | "Illustrative, but the shape is real: minutes instead of most of an hour, and thirty seconds of human time." |
| 4:00 | Split view (`S`) | "Here's the same night done by hand." |
| 4:30 | Chaos (`C`) | "Now the part people ask about. What if an agent gets it wrong?" … "Blocked twice: by policy, and because the tool isn't even granted." |
| 5:30 | End card | "Where would you want a squad like this first?" |

If the client clicks **Reject**: "Good. Let's see what happens." After the alternative: "If you reject again, it stops and escalates. It stops where people say stop."

## 4. Recovery playbook

| Problem | Do this |
|---|---|
| Live mode slow or failing | Nothing — it falls back automatically. If asked: "We fall back to the recorded run so the room never waits on Wi-Fi." Press `M` to switch to scripted explicitly. |
| Browser crashes | Reopen `dist-offline/index.html`; press the act number key to jump to where you were. |
| Wrong branch taken | Press `R` to reset or scrub back before the gate; decisions after that point are cleared. |
| Projector resolution changes | Layout adapts; press `P` twice to re-fit presenter mode. |
| Laptop dies | USB backup on any machine with a modern browser. No install needed. |

## 5. Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `→` / `←` | Next / previous beat |
| `1`–`7` | Jump to act |
| `A` / `X` | Approve / reject at an open gate |
| `C` | Chaos test (from Act 4 onward) |
| `S` | Human vs agent split view |
| `I` | Toggle inspector for the focused agent |
| `P` | Presenter mode |
| `N` | Toggle presenter notes strip |
| `M` | Switch mode (scripted ↔ live, if available) |
| `+` / `-` | Speed up / down (1×, 1.5×, 2×) |
| `R` | Reset to title |
| `?` | Show shortcuts |

## 6. Likely questions

| Question | Answer |
|---|---|
| Is this real AI or a recording? | "The default run is scripted so it's reliable in any room. Live mode runs the same agents on Claude through Amazon Bedrock — happy to switch." |
| What stops an agent doing damage? | "Three things: policies enforced in code, tools granted per agent, and human approval for production changes. Everything is audited." |
| What if it's wrong about the root cause? | "It states confidence and shows its evidence. The human sees both before approving, and every action is reversible or blocked." |
| Where does our data go? | "In a real deployment it stays in your AWS account; the model runs through Bedrock in the region you choose. This demo uses only fictional data." |
| Would this replace our SREs? | "No. It removes the 2 AM grind of gathering evidence. Engineers make the call and own the follow-ups." |
| How long to pilot? | "About six weeks on one workflow, measured against your own baseline." |
| Which models? | "Claude models on Amazon Bedrock; the provider is swappable behind one interface." |
