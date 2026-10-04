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

## 3. Presenter script (about 8 minutes)

This is the demo on its own. For the full talk (the story deck with the demo in the middle, about 20 minutes), use `docs/PRESENTER_SCRIPT.md`; its lines are also the executive deck's speaker notes.

| Time | On screen | Say (suggested) |
|---|---|---|
| 0:00 | Title card | "It's 2:07 in the morning. A European life insurer's nightly premium run is falling behind. The bank closes intake at 05:30. Nobody's awake. Let's see who is." |
| 0:15 | Act 1 alert | "Sentinel watches the run. Projected finish 06:52, cutoff 05:30, and items failing. It's not a blip, so it raises a SEV-2." |
| 0:30 | Act 2 fan-out | "The Orchestrator asks three questions at once: what's failing, what changed, what's at risk." |
| 0:50 | Act 3 | "Watch them think. Log Detective suspects the policy database; Sentinel checks and rules it out. Code Archaeologist suspects the database driver upgrade, reads the diff, and rules that out too. A trace call even fails and gets retried." |
| 2:00 | Trigger vs cause | "Before it accepts the answer, the Orchestrator asks why tonight, when the tariff shipped at 18:40. Tonight is the first run with October due dates: that's the trigger. The duplicate rate row is the cause." |
| 2:20 | Root cause card | "Three independent clues agree, with a confidence score, not a guess." |
| 2:35 | Act 4 | "Fixer proposes holding just the 812 affected policies so everyone else is collected on time. Guardian checks it, including the rule that only an actuary can change premiums. A human must approve." |
| 3:00 | Gate | Hand over the tablet or turn to the client: "You're the on-call engineer. Your call. The clock is still running." |
| 3:15 | Act 6 | "The run resumes. Watch projected finish drop back under the cutoff." (pause) "The bank accepts the file." |
| 3:45 | Pull request (Act 7) | "The real fix is a check in the tariff pipeline. Tests included; the agent cannot merge." |
| 4:00 | Act 7 | "Scribe writes a plain update for finance and a blameless postmortem. Owners are proposed, not assigned." |
| 4:10 | Scorecard | "Illustrative, but the shape is real: the bank file on time instead of a day late." |
| 4:30 | Split view (`S`) | "Here's the same night done by hand: the file misses the cutoff." |
| 5:00 | Chaos (`C`) | "What if an agent gets it wrong?" … "Deleting tariff rows in production: blocked by policy, and the tool isn't even granted." |
| 5:30 | Poisoned log (`L`) and Audit tab | "A policyholder note tries to give the agents orders. Text in a log can never call a tool." Then the Audit tab: evidence by stage, chain verified, export. |
| 6:00 | End card | "Where would you want a squad like this first?" Close it (`Esc` or ✕) to show the finished stage; "Show summary" brings it back. |

If the client clicks **Reject**: "Good. Let's see what happens." The alternative prices the 812 at September rates for one night, which the duty actuary must co-sign. After the alternative: "If you reject again, it stops and escalates. It stops where people say stop."

## 4. Recovery playbook

| Problem | Do this |
|---|---|
| Live mode slow or failing | Nothing — it falls back automatically. If asked: "We fall back to the recorded run so the room never waits on Wi-Fi." Press `M` to switch to scripted explicitly. |
| Browser crashes | Reopen `dist-offline/index.html`; press the act number key to jump to where you were. |
| Wrong branch taken | Press `R` to reset or scrub back before the gate; decisions after that point are cleared. |
| Projector resolution changes | Layout adapts; press `P` twice to re-fit presenter mode. |
| Laptop dies | USB backup on any machine with a modern browser. No install needed. |
| Need to talk mid-run | `F` freezes everything (clock included) without a banner; `F` again resumes. "Pause squad" is for making the point that a person can stop the agents: the clock keeps running and the pause counts toward the outcome. |
| Running long | Press `+` for 1.5× or 2×: the agents still pause, just shorter. For a short slot, open with `pace=1` in the URL (about 2½ minutes). |

## 5. Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Start, pause the squad (the incident clock keeps running and the pause counts), resume |
| `F` | Freeze everything, clock included, for questions (no banner; the audience sees a still stage) |
| `→` / `←` | Next / previous beat |
| `1`–`7` | Jump to act |
| `A` / `X` | Approve / reject at an open gate |
| `C` | Chaos test (from Act 4 onward) |
| `L` | Poisoned log test (from Act 3 onward) |
| `S` | Human vs agent split view |
| `I` | Toggle inspector for the focused agent |
| `P` | Presenter mode |
| `N` | Toggle presenter notes strip |
| `M` | Switch mode (scripted ↔ live, if available) |
| `+` / `-` | Speed up / down (1×, 1.5×, 2×) |
| `R` | Reset to title |
| `Esc` | Close the open overlay; at the end, close the scorecard or end card ("Show summary" brings it back) |
| `?` | Show shortcuts |

## 6. Likely questions

| Question | Answer |
|---|---|
| Is this real AI or a recording? | "The default run is scripted so it's reliable in any room. Live mode runs the same agents on Claude through Amazon Bedrock — happy to switch." |
| Can an agent push code to production? | "No. It can open a draft pull request with tests. Your pipeline and a reviewer decide; there is no merge tool." |
| What about prompt injection? | "Text from logs, tickets, or customers is evidence, never instructions. A deterministic check quarantines it, and agents can only call the tools they are granted, with policy and a person in the way." |
| What about shadow AI? | "The answer is a sanctioned path that's faster than the workaround: approved models in your account, audited." |
| What stops an agent doing damage? | "Three things: policies enforced in code, tools granted per agent, and human approval for production changes. Everything is audited." |
| What if it's wrong about the root cause? | "It states confidence and shows its evidence. The human sees both before approving, and every action is reversible or blocked." |
| Where does our data go? | "In a real deployment it stays in your AWS account; the model runs through Bedrock in the region you choose. This demo uses only fictional data." |
| Would this replace our SREs? | "No. It removes the 2 AM grind of gathering evidence. Engineers make the call and own the follow-ups." |
| How long to pilot? | "About six weeks on one workflow, measured against your own baseline." |
| Which models? | "Claude models on Amazon Bedrock; the provider is swappable behind one interface." |
