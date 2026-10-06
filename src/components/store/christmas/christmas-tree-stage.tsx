"use client";

import dynamic from "next/dynamic";
import styles from "./christmas.module.css";

// three.js is loaded only on this page, and only in the browser.
const Tree3D = dynamic(
  () => import("./christmas-tree-3d").then((m) => m.ChristmasTree3D),
  {
    ssr: false,
    loading: () => (
      <div className={styles.treeColumn}>
        <div className={styles.canvasWrap} aria-hidden="true" />
      </div>
    ),
  },
);

export function ChristmasTreeStage() {
  return <Tree3D />;
}
