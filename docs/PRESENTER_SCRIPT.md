# Presenter script — "When the pager rings at 2 AM"

The full talk track for the executive deck (`deck/out/night-shift-executive.pptx`) and the live demo in the middle of it. The quoted paragraphs under each slide are what you say. They are also the speaker notes in the deck: `npm run deck` copies them in, so the presenter view and this page never drift apart.

Lines in *italics* are stage directions. *(pause)* means stop talking for a beat and let the slide do the work.

## At a glance

| Part | Slides | Time | What the room should feel |
|---|---|---|---|
| Opening | 1 | 0:45 | "This is a story, not a pitch." |
| 1 · We push the code | 2–3 | 1:45 | "That could have been us." |
| 2 · The traditional night | 4–8 | 4:30 | Recognition, slightly uncomfortable |
| 3 · The same night, with a squad | 9–14 | 9:00 (demo about 5–6) | Curiosity, then "they stayed in control" |
| 4 · What changed | 15–20 | 4:30 | "Where would this fit for us?" |
| **Total** | | **about 20 min** | Leave 10 minutes for questions |

For a 10-minute slot, see [the short version](#short-version-10-minutes) at the end.

## Before you walk in

- Fill `config/branding.json` and rebuild the deck, so no `{{…}}` placeholders show. Add your own use cases on slide 17.
- Have two windows ready: the deck in presenter view, and the offline app (`apps/web/dist-offline/index.html`) full screen with presenter mode on (`P`), reset (`R`).
- Decide who approves at the gate. Handing the tablet or the laptop to the most senior client person is the strongest moment of the session. Warn them in advance if you think they would rather not be surprised.
- Rehearse the switch from slide 11 to the app and back to slide 12 at least twice. It is the only mechanical risk in the talk.
- Delivery: the amber times on the night slides are the story's heartbeat. Say the time first, then the line. Slow down on Part 2; speed up in Part 4.

---

## Opening

### Slide 1 · When the pager rings at 2 AM

*Night sky. Wait until the room is quiet before you speak.*

> I want to start with a story rather than a slide of bullet points. It is about one night and one bad deploy.
>
> We'll live through that night twice. First the way it usually goes, with people. Then the same night again, with a squad of AI agents on call, and a person still in charge.
>
> And then we'll talk about what that could mean for you.

---

## Part 1 · We push the code

### Slide 2 · 01:55 — A small change ships. Every check is green.

> Five to two in the morning. A routine release goes out. It's a tidy-up: someone cleaned up the deployment settings.
>
> The pipeline does everything we ask of it. Build: green. Tests: green. Six out of six pods healthy. *(pause)*
>
> But look at the bottom of the screen. One setting was renamed, the database connection pool size, and the application still reads the old name. So it quietly falls back to a default of ten connections instead of forty.
>
> Nothing fails. Yet.
>
> I'd ask you to keep this in mind: nobody did anything careless here. This is exactly the kind of change that passes every check we have.

### Slide 3 · 02:04 — Traffic doubles. Checkout starts failing.

> At 02:03 a promotional email goes out. Traffic more than doubles.
>
> Ten connections can't keep up. *(point at the line)* From 02:04, latency goes through the roof.
>
> And this is what a customer sees. *(point at the phone)* "Payment failed. Please try again." They try again. It fails again. Some of them give up.
>
> Nobody is awake to see it.

---

## Part 2 · The traditional night

### Slide 4 · 02:07 — The pager goes off.

> 02:07. The monitoring works. An alert fires and pages the on-call engineer.
>
> Somewhere, a phone lights up on a bedside table. *(pause)*
>
> Let's follow what usually happens next. None of it is dramatic. That's the point.

### Slide 5 · 02:19 — Twelve minutes before anyone looks at the data.

> The first twelve minutes are the part nobody draws in an architecture diagram.
>
> The phone buzzes. Then buzzes again. The engineer finds it, reads it, acknowledges it: 02:12.
>
> Then laptop, VPN, single sign-on, and "which dashboard was it again?" By 02:19 someone is finally looking at data.
>
> *(beat)* And meanwhile, customers keep failing to pay.

### Slide 6 · 02:27 — The war room fills up.

> By 02:27 there's an incident channel and it is filling up.
>
> The engineer sees connection timeouts, so, reasonably, they page the database admin. The DBA looks: CPU is 22%, "not us". Platform: "no infrastructure changes tonight". A manager joins: "customers are affected, any ETA?"
>
> Then somebody asks the question that matters: did anything ship today? It takes until 02:40 to connect it to the 01:55 release, and until 02:44 for a developer to spot the renamed key.
>
> Six people woken up across six teams. Every one of them is competent. Every one of them checked their own piece, and was right about it. *(pause)* Nobody could see the whole picture.

### Slide 7 · 02:29–02:44 — Page, wait, check, hand off. Repeat.

> If you draw it, it looks like this. The on-call engineer in the middle, and a loop: page someone, wait for them to wake up, wait for them to log in, they check one system, they hand it back.
>
> Each answer is correct. None of them is the whole picture.
>
> I want to be clear: this isn't anyone's fault. This is how the work is shaped. It is shaped around people who have to be woken up, one at a time.

### Slide 8 · 02:55 — Recovered. 48 minutes after the alert.

> The rollback is approved at 02:49, and recovery is confirmed at 02:55.
>
> Forty-eight minutes from alert to fix. Look at the red bar. That is how long customers couldn't pay, and most of that time went on finding the right people and the right facts, not on fixing anything.
>
> These times are illustrative; they are a dramatization of a typical night. You will each have your own version of this story. In a pilot, we'd use your real incident history instead.

---

## Part 3 · The same night, with a squad

### Slide 9 · Rewind.

*Let the word land before you speak.*

> So let's rewind. *(pause)*
>
> Same deploy. Same night. Same alert at 02:07.
>
> This time a squad of AI agents is on call. And a person still makes every decision that touches production.

### Slide 10 · Seven specialists and one human

> Here's the squad. Think of it as the war room from a moment ago, except it is already awake.
>
> Sentinel watches the numbers and raises the alarm. The Orchestrator runs the incident: it plans, asks the questions, and pulls the answers together. Log Detective reads the logs and runtime metrics. Code Archaeologist looks at what changed and reads the diffs. Fixer proposes the fix and, only once it is approved, carries it out. Guardian checks every proposed action against policy, and can block it. And Scribe writes things down: the status update and the postmortem.
>
> Each one has a narrow job and narrow permissions. *(point to the right)* And then there is one human, the on-call engineer, who has the final say on anything that touches production.

### Slide 11 · Let's watch the squad work.

> Enough slides. Let's watch it.
>
> One thing before I switch over. At some point the squad will ask for approval, and *(turn to your chosen approver)* I'm going to ask you to make that call. Take your time. The incident clock keeps running while you decide, just as it would for real.

*Switch to the app and run the live demo: alert, fan-out, investigation, the timing challenge, root cause, proposal, the gate (hand over, then stop talking), recovery, Scribe, scorecard, then the bad idea (`C`). Come back to slide 12 when it ends.*

---

### Live demo · about 5–6 minutes

*App full screen, presenter mode, reset. Press `Space` (Start). The clock on screen runs in real time from 02:07; read times off the screen, not from this page.*

**The alert.** *As Sentinel's lines appear:*

> This is 02:07 again. Sentinel has noticed that latency is six times over the target, and errors are climbing. It waits to make sure it isn't a blip, and then it raises a SEV-2 and wakes the squad. Not a person yet.

**The fan-out.** *When the three packets fly out from the Orchestrator:*

> Now the Orchestrator does what a good incident lead does. It asks three questions at the same time: what is failing, what changed, and how far does it spread. Three specialists, working in parallel.

**The investigation.** *This is the longest stretch. Don't narrate every line; pick two or three.*

> Watch how they work. They pause to think. They call tools and wait for results. *(when the trace call fails)* That tool call just failed. It retries with a narrower window, like an engineer would.
>
> *(when "the database is overloaded" appears)* Log Detective's first suspect is the database. The same instinct our engineer had at 02:27. But Sentinel checks: the database is at 22% CPU. Ruled out, in seconds, without waking the DBA.
>
> *(when the Spring Boot suspect appears)* Code Archaeologist suspects the framework upgrade. It reads the diff: a patch release, nothing relevant changed. Ruled out too.
>
> *(when the pool reads 10 of 10)* And here it is. Ten out of ten connections in use on every pod, hundreds of requests waiting. And the renamed setting in the release.

*Optional, once, during the investigation: press `Space` (Pause squad), then again to resume.*

> By the way, I can stop them at any time. *(Space)* The squad is holding. The clock keeps running, because that's honest: a pause costs time. *(Space)* And they carry on.

**The challenge.** *When the Orchestrator asks "why did it break at 02:04, not 01:55?":*

> I love this bit. Before accepting the answer, the Orchestrator challenges it: if the release went out at 01:55, why did it only break at 02:04? The answer: traffic doubled at 02:03. The traffic is the trigger; the smaller pool is the cause. That's the difference between a plausible answer and a correct one.

**Root cause.** *When the root-cause card forms:*

> Three independent signals agree, with a confidence score, not a guess. Check the clock: a couple of minutes after the alert. In our first night, at this point, the engineer was still logging on to the VPN.

**The proposal.** *When Fixer and Guardian speak:*

> Fixer proposes options, with the time each would take, the risk, and whether it can be undone. It recommends rolling back the release. Guardian checks that against policy. Everything passes, except one rule, and it's the rule we want: a human must approve production changes.

**The gate.** *The approval sheet opens. Hand over the tablet or the laptop. Then stop talking.*

> You're the on-call engineer. You've got the evidence, the plan, and the policy checks. Your call. *(silence until they decide)*

- *If they approve:* "Thank you. Now watch the line."
- *If they reject:* "Good. Let's see what it does with a no." *(the squad proposes an alternative that keeps the release)* "It found another way. And if you say no again, it stops and escalates to a person. It stops where people say stop."

**Recovery.** *The rollout runs as a labelled fast-forward.*

> It rolls back one pod at a time, and we've sped this part up; you can see the label. *(as the line drops)* Errors stopping... and back under target. *(the +5 min time-lapse)* We skip ahead five minutes to confirm it's stable.

**The paperwork.** *When Scribe writes:*

> And then the part nobody wants to do at three in the morning. Scribe writes two things: a plain-language update for stakeholders, and a blameless postmortem for the engineers. Owners for the follow-ups are suggested, not assigned. The team decides.

**The scorecard.** *When the scorecard appears:*

> These numbers aren't from a slide. They're measured from the run you just watched, including the time you took to decide. *(read the time to mitigate and the human time from the screen)*

*Close the scorecard (`Esc`).*

**The bad idea.** *Press `C` (Test a bad idea).*

> Now the question I always get: what if an agent gets it wrong? Let's make one try something dangerous. Fixer suggests restarting the production database to raise its connection limit. *(Guardian blocks)* Blocked. That would take down nine services to treat a symptom in one, and it wouldn't even help. And even if the policy check had failed, that agent was never given the tool to do it. Two independent layers.

*Optional, if time allows: `S` (Compare with manual response) for the side-by-side, then back to the deck.*

*Switch back to the deck, slide 12.*

---

### Slide 12 · What you just saw

*A quick recap. If the live demo could not run, this slide is your backup: walk through the six frames using the demo lines above.*

> Let me replay that in six frames. Sentinel detects the breach. The Orchestrator asks three questions at once. Suspects are checked and ruled out. A root cause with a confidence score. A person approves the fix. And recovery, one pod at a time.

### Slide 13 · They investigate like engineers: suspect, check, rule out

> I want to come back to one thing, because this is what makes it agentic rather than a script with extra steps.
>
> They form a hypothesis. They check it with a real tool. And they drop it when the evidence says so: the database, then the framework upgrade. And the Orchestrator challenges the timing before it accepts the answer.
>
> That's how your best engineers work. The difference is that nobody had to be woken up to do it.

### Slide 14 · People stay in charge

> And through all of it, people stay in charge.
>
> On the left, every production change waits for a person. The clock keeps running while they decide, and that time is counted, because we don't want numbers that flatter the machine.
>
> On the right, a bad idea is blocked twice. Policy is checked by code, not by the model's good judgement. And the dangerous tool is simply not granted to the agent. Everything is written to an audit trail.

---

## Part 4 · What changed

### Slide 15 · Same night, two timelines

> Here are the two nights on one clock.
>
> The top line is the manual response: forty-eight minutes. The bottom line is the squad: about four. *(pause)* The squad has fixed it before, in the first night, anyone had even opened a dashboard.
>
> Same alert, same root cause, same fix. What changed is who does the gathering.

### Slide 16 · Minutes, not most of an hour

> The same thing as numbers, and I'll be careful here: these are illustrative for this scenario, not a benchmark.
>
> Time to root cause goes from over half an hour to under two minutes. Time to fix from most of an hour to a few minutes.
>
> But the two numbers I'd point you to are on the right. Six people woken up becomes one. And the human time is about thirty seconds: the time it takes to read the evidence and approve.
>
> In a pilot, we'd baseline your own incidents first, and measure against those.

### Slide 17 · Where this sits in our AI journey

*Fill the four stages with your own examples before the session.*

> Stepping back: where does this sit?
>
> Most organisations start by exploring, then they assist people with copilots, then they automate fixed steps. *(name one or two of your own examples per stage)*
>
> Tonight's squad is the fourth stage: governed autonomy. Agents that act, inside policy, with human gates. And it only works because the first three are in place: the data access, the tooling, and the governance.

### Slide 18 · Where agents fit first

> So where should you start? Two questions: how repeatable is the work, and how bad is a wrong action?
>
> Start bottom right: repeatable work where actions are reversible or low-risk, like drafting RFP responses. Incident triage sits top right: repeatable, higher risk, so it runs with human gates, like you just saw.
>
> And top left, things like payment changes, stay human-led. Agents can help there, but a person does the work.

### Slide 19 · Proposed next step: a six-week pilot

> Here's what we'd propose: six weeks, one workflow.
>
> In the first two weeks, we pick the workflow with you and write down its policies. In weeks three and four, we build on your data in shadow mode: the squad investigates alongside your team and changes nothing. In weeks five and six, it goes live with human gates. And at the end, we measure it against your own baseline, not against our demo.

### Slide 20 · Let the squad take the first shift.

*Dawn. Say the two lines slowly.*

> Let the squad take the first shift.
>
> People keep the last word.
>
> *(pause)* So I'll leave you with one question: where would you want a squad like this first?

*Then stop talking. Let them answer. For likely questions, see RUNBOOK §6.*

---

## Short version (10 minutes)

For a tight slot, open the app with `pace=1` in the URL (the demo takes about 2½ minutes plus the gate), and:

- Keep slides 1–4, 8, 9, 11 (demo), 15, 19, 20.
- Skip slides 5–7: on slide 4, add "What follows is forty-eight minutes of paging, waiting and handing off" and go straight to slide 8.
- Skip slide 10 (introduce the agents during the demo as they appear), 12–14 (the demo covers them), and 16–18.
- In the demo, skip Pause squad and the side-by-side. Keep the gate and the bad idea.

## If something goes wrong

- **The app won't start or freezes:** use slide 12 as the demo. "Let me show you the run as a storyboard instead." Then carry on; nobody minds.
- **You need to talk mid-run:** `F` freezes everything, clock included, with no banner. `F` again resumes.
- **Running long:** `+` speeds the squad up (1.5×, 2×); they still pause, just shorter.
- **The approver is hesitant:** "There's no wrong answer; if you say no, you'll see what it does next." Both choices make a good demo.
- Everything else: RUNBOOK §4.
