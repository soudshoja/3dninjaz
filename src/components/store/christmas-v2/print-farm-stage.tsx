"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { FlatTree } from "./flat-tree";
import type { SceneStatus } from "./print-farm-scene";
import styles from "./christmas-v2.module.css";

// three.js loads only on this page, and only in the browser.
const Scene = dynamic(() => import("./print-farm-scene").then((m) => m.PrintFarmScene), {
  ssr: false,
  loading: () => <div className={styles.canvasWrap} aria-hidden="true" />,
});

/**
 * The tree column of the hero. It is the layout anchor the WebGL scene reads
 * (data-tree-anchor / data-tree-caption); the canvas itself is absolutely
 * positioned against the hero, so it can bleed under the copy.
 */
export function PrintFarmStage() {
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<SceneStatus>({ failed: false, reduced: false });
  const replayRef = useRef<() => void>(() => {});
  const canReplay = done && !status.reduced && !status.failed;

  return (
    <div className={styles.treeColumn} data-tree-anchor>
      {status.failed ? (
        <div className={styles.flatTree}>
          <FlatTree />
        </div>
      ) : (
        <Scene onDone={setDone} onStatus={setStatus} replayRef={replayRef} />
      )}

      <div className={styles.treeCaption} data-tree-caption>
        <button
          type="button"
          className={styles.replay}
          data-visible={canReplay}
          disabled={!canReplay}
          onClick={() => replayRef.current()}
        >
          <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
          Print it again
        </button>
        <p className={styles.displayNote}>Our tree is a display piece and isn&rsquo;t for sale.</p>
      </div>
    </div>
  );
}
