"use client";

import dynamic from "next/dynamic";
import styles from "./christmas-v1.module.css";

// three.js is loaded only on this page, and only in the browser. The loading
// state reserves the same box, so the tree arriving causes no layout shift.
const Tree3D = dynamic(
  () => import("./christmas-tree-3d").then((m) => m.ChristmasTree3D),
  {
    ssr: false,
    loading: () => (
      <div className={styles.treeColumn}>
        <div className={styles.canvasWrap} aria-hidden="true" />
        <div className={styles.controls} aria-hidden="true">
          <div className={styles.readoutBlock} />
        </div>
      </div>
    ),
  },
);

export function ChristmasTreeStage() {
  return <Tree3D />;
}
