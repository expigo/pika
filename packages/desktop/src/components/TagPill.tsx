/**
 * TagPill Component
 * Displays a single tag as a pill badge
 */

import { X } from "lucide-react";

interface Props {
  tag: string;
  onRemove?: () => void;
}

export function TagPill({ tag, onRemove }: Props) {
  const colors = getTagColor(tag);

  return (
    <span
      style={{
        ...styles.pill,
        background: colors.background,
        borderColor: colors.border,
        color: colors.text,
      }}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={styles.removeButton}
          title={`Remove ${tag}`}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

// Preset tag colors for common DJ categories
function getTagColor(tag: string): { background: string; border: string; text: string } {
  const tagLower = tag.toLowerCase();

  const presets: Record<string, { background: string; border: string; text: string }> = {
    blues: {
      background: "rgba(59, 130, 246, 0.2)",
      border: "rgba(59, 130, 246, 0.5)",
      text: "#3b82f6",
    },
    slow: {
      background: "rgba(139, 92, 246, 0.2)",
      border: "rgba(139, 92, 246, 0.5)",
      text: "#8b5cf6",
    },
    fast: {
      background: "rgba(249, 115, 22, 0.2)",
      border: "rgba(249, 115, 22, 0.5)",
      text: "#f97316",
    },
    opener: {
      background: "rgba(34, 197, 94, 0.2)",
      border: "rgba(34, 197, 94, 0.5)",
      text: "#22c55e",
    },
    closer: {
      background: "rgba(239, 68, 68, 0.2)",
      border: "rgba(239, 68, 68, 0.5)",
      text: "#ef4444",
    },
    competition: {
      background: "rgba(251, 191, 36, 0.2)",
      border: "rgba(251, 191, 36, 0.5)",
      text: "#fbbf24",
    },
    "crowd-pleaser": {
      background: "rgba(236, 72, 153, 0.2)",
      border: "rgba(236, 72, 153, 0.5)",
      text: "#ec4899",
    },
    pop: {
      background: "rgba(168, 85, 247, 0.2)",
      border: "rgba(168, 85, 247, 0.5)",
      text: "#a855f7",
    },
  };

  return (
    presets[tagLower] || {
      background: "rgba(148, 163, 184, 0.15)",
      border: "rgba(148, 163, 184, 0.4)",
      text: "#94a3b8",
    }
  );
}

const styles: Record<string, React.CSSProperties> = {
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "9999px",
    border: "1px solid",
    fontSize: "0.7rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  removeButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    opacity: 0.7,
    color: "inherit",
  },
};
