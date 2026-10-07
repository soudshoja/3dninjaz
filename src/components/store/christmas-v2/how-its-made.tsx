import { MousePointerClick, Printer, Truck, type LucideIcon } from "lucide-react";
import { RevealGroup } from "./reveal-group";
import styles from "./christmas-v2.module.css";

/**
 * A real three-step sequence, so numbering is earned. Facts come only from the
 * store's own copy: made to order in Kuala Lumpur, shipped across Malaysia.
 */
const STEPS: { title: string; text: string; Icon: LucideIcon }[] = [
  { title: "Pick a gift", text: "Choose from the Christmas gifts below.", Icon: MousePointerClick },
  { title: "We print it to order", text: "Made to order in Kuala Lumpur.", Icon: Printer },
  { title: "It ships to you", text: "Shipped across Malaysia.", Icon: Truck },
];

export function HowItsMade() {
  return (
    <section className={styles.process} aria-labelledby="xmas2-process-heading">
      <div className={styles.processInner}>
        <h2 id="xmas2-process-heading" className={`${styles.sectionTitle}`}>
          How your gift is made
        </h2>
        <RevealGroup as="ol" className={styles.steps}>
          {STEPS.map(({ title, text, Icon }, i) => (
            <li
              key={title}
              className={`${styles.step} ${styles.rev}`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className={styles.node} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className={styles.stepTitle}>
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  {title}
                </h3>
                <p className={styles.stepText}>{text}</p>
              </div>
            </li>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
