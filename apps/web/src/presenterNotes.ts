// Presenter notes strip (DESIGN §11), from the RUNBOOK §3 presenter script.
import type { StageSnapshot } from './sources/types';

export function presenterNote(s: StageSnapshot, splitOpen: boolean): string {
  const st = s.state;
  if (splitOpen) return 'Here’s the same night done by hand.';
  if (st.overlay.active) {
    return st.permissionDenied
      ? 'Blocked twice: by policy, and because the tool isn’t even granted.'
      : 'Now the part people ask about. What if an agent gets it wrong?';
  }
  if (st.endCard) {
    return st.severity === 'Handed to humans'
      ? 'It stops where people say stop. That is a feature, not a failure.'
      : 'Press S for the manual timeline, C for the chaos test. Then ask: where would you want a squad like this first?';
  }
  if (s.status === 'awaitingGate') {
    return s.pendingGateId === 'g2'
      ? 'If you reject again, it stops and escalates. It stops where people say stop.'
      : 'Hand over the tablet or turn to the client: “You’re the on-call engineer. Your call.”';
  }
  if (st.scorecard) return 'Illustrative, but the shape is real: minutes instead of most of an hour, and thirty seconds of human time.';
  switch (s.currentAct) {
    case 1:
      return s.t === 0 && !s.playing
        ? 'It’s 2:07 in the morning. Checkout at an online retailer is slowing down. Nobody’s awake. Let’s see who is.'
        : 'Sentinel watches the numbers. Latency is six times over target. It’s not a blip, so it raises a SEV-2.';
    case 2:
      return 'The Orchestrator asks three questions at once: what’s failing, what changed, how far it spreads.';
    case 3:
      return st.evidence.conclusion
        ? 'Three independent clues agree. Root cause in under two minutes, with a confidence score, not a guess.'
        : 'Watch them think. Two suspects get ruled out, a trace call fails and is retried, and the Orchestrator asks why it broke at 02:04, not 01:55.';
    case 4:
      return 'Fixer proposes options with time, risk, and reversibility. Guardian checks the recommended one. One rule remains: a human must approve.';
    case 5:
      return 'Good. Let’s see what happens.';
    case 6:
      return 'Rolling back one pod at a time. Watch the line. Back under target.';
    case 7:
      return 'Scribe writes a plain update for stakeholders and a blameless postmortem. Owners are proposed, not assigned.';
    default:
      return '';
  }
}
