/**
 * Tempo Feedback Tracking
 *
 * Track tempo preferences from dancers (faster/slower/perfect)
 * Each vote has a timestamp for decay (votes fade after 5 minutes)
 */

export interface TempoVote {
  preference: "faster" | "slower" | "perfect";
  timestamp: number;
}

// Map: sessionId -> Map<clientId, TempoVote>
const tempoVotes = new Map<string, Map<string, TempoVote>>();

// Vote expires after 5 minutes (300,000ms)
const TEMPO_VOTE_TTL = 5 * 60 * 1000;

/**
 * Get aggregated tempo feedback for a session
 * Excludes AND DELETES expired votes from the calculation (production behavior)
 */
export function getTempoFeedback(sessionId: string): {
  slower: number;
  perfect: number;
  faster: number;
  total: number;
  votes: TempoVote[];
} {
  const votes = tempoVotes.get(sessionId);
  if (!votes) {
    return { slower: 0, perfect: 0, faster: 0, total: 0, votes: [] };
  }

  const now = Date.now();
  const validVotes: TempoVote[] = [];
  let slower = 0;
  let perfect = 0;
  let faster = 0;

  for (const [clientId, vote] of votes.entries()) {
    // Production behavior: DELETE expired votes (index.ts line 345)
    if (now - vote.timestamp > TEMPO_VOTE_TTL) {
      votes.delete(clientId);
      continue;
    }

    validVotes.push(vote);
    switch (vote.preference) {
      case "slower":
        slower++;
        break;
      case "perfect":
        perfect++;
        break;
      case "faster":
        faster++;
        break;
    }
  }

  return { slower, perfect, faster, total: slower + perfect + faster, votes: validVotes };
}

/**
 * Record a tempo vote from a client
 */
export function recordTempoVote(
  sessionId: string,
  clientId: string,
  preference: "faster" | "slower" | "perfect",
): void {
  if (!tempoVotes.has(sessionId)) {
    tempoVotes.set(sessionId, new Map());
  }
  tempoVotes.get(sessionId)?.set(clientId, {
    preference,
    timestamp: Date.now(),
  });
}

/**
 * Clear all tempo votes for a session (called on track change)
 */
export function clearTempoVotes(sessionId: string): void {
  tempoVotes.delete(sessionId);
}
