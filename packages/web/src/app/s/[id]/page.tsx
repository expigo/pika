"use client";

import { use } from "react";
import { LivePlayer } from "@/components/LivePlayer";

interface SessionPageProps {
    params: Promise<{ id: string }>;
}

export default function SessionPage({ params }: SessionPageProps) {
    // Next.js 15: params is a Promise, unwrap with React.use()
    const { id } = use(params);

    return <LivePlayer targetSessionId={id} />;
}
