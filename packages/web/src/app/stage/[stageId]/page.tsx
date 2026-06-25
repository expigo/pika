"use client";

import { use } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LivePlayer } from "@/components/LivePlayer";

/**
 * /stage/[stageId] - Join a persistent Stage (a venue floor that outlives any
 * single DJ set). The dancer stays connected across DJ rotation — when the DJ
 * changes, the music follows with no re-scan. This is the QR target for stages.
 */
export default function StagePage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = use(params);

  return (
    <ErrorBoundary>
      <LivePlayer targetStageId={stageId} />
    </ErrorBoundary>
  );
}
