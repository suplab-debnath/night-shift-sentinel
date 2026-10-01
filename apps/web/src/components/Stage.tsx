import { useRef } from 'react';
import { copy } from '../copy';
import { useElementSize } from '../hooks/useElementSize';
import { useApp } from '../state/store';
import { AgentInspector } from './AgentInspector';
import { AgentNode } from './AgentNode';
import { AlertPulse } from './AlertPulse';
import { ChannelToast } from './ChannelToast';
import { ChaosBanner } from './ChaosBanner';
import { SquadBanner } from './SquadBanner';
import { EndCard } from './EndCard';
import { EvidenceBoard } from './EvidenceBoard';
import { GateLayer } from './GateLayer';
import { HeartbeatLine } from './HeartbeatLine';
import { PacketLayer } from './PacketLayer';
import { PermissionToast } from './PermissionToast';
import { ProgressChip } from './ProgressChip';
import { ScorecardSheet } from './ScorecardSheet';
import { ShowSummary } from './ShowSummary';
import styles from './Stage.module.css';
import { TitleCard } from './TitleCard';
import { WorkSheet } from './WorkSheet';

export function Stage() {
  const floorRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(floorRef);
  const agents = useApp((s) => s.bundle.agents.agents);
  const human = agents.find((a) => a.id === 'human');
  const gateOpen = useApp((s) => s.snap.state.gate?.status === 'open' && !s.snap.state.overlay.active);
  const paused = useApp((s) => s.snap.clockHold?.kind === 'squad' || s.snap.frozen);

  return (
    <section className={styles.stage} aria-label={copy.stage.label} data-gate-open={gateOpen || undefined} data-paused={paused || undefined}>
      <div className={styles.floor} ref={floorRef}>
        {human && <div className={styles.boundary} style={{ left: `${human.position.x - 7}%` }} aria-hidden />}
        <PacketLayer size={size} />
        {agents.map((a) => (
          <AgentNode key={a.id} agent={a} />
        ))}
        <ProgressChip />
        <EvidenceBoard />
        <WorkSheet />
        <ScorecardSheet />
        <PermissionToast />
        <ChannelToast />
        <AgentInspector />
      </div>
      <HeartbeatLine />
      <AlertPulse />
      <ChaosBanner />
      <SquadBanner />
      <TitleCard />
      <GateLayer />
      <EndCard />
      <ShowSummary />
    </section>
  );
}
