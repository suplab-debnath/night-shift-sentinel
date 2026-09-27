import { copy } from '../copy';
import styles from './IllustrativeTag.module.css';

export function IllustrativeTag() {
  return <span className={styles.tag}>{copy.illustrative}</span>;
}
