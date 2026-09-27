import { useApp } from '../state/store';
import styles from './TitleCard.module.css';

const HOLD = 1200;
const FADE = 800;

export function TitleCard() {
  const card = useApp((s) => s.snap.state.titleCard);
  const opacity = useApp((s) => {
    const c = s.snap.state.titleCard;
    if (!c) return 0;
    const age = s.snap.t - c.t;
    if (age <= HOLD) return 1;
    return Math.max(0, Math.round((1 - (age - HOLD) / FADE) * 100) / 100);
  });
  if (!card || opacity <= 0) return null;
  return (
    <div className={styles.card} style={{ opacity }} data-testid="title-card">
      <h1 className={styles.title}>{card.title}</h1>
    </div>
  );
}
