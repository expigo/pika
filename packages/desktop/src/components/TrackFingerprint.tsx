import { useMemo } from "react";
import {
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import type { Track } from "../db/repositories/trackRepository";

interface Props {
    track: Track;
    size?: number;
    showLabels?: boolean;
}

interface DataPoint {
    metric: string;
    value: number;
    fullMark: number;
}

// Neon color palette matching the app's dark/neon aesthetic
const COLORS = {
    stroke: "#f472b6", // Pink
    fill: "rgba(244, 114, 182, 0.3)", // Semi-transparent pink
    grid: "#334155", // Slate
    axis: "#64748b", // Slate gray
    text: "#e2e8f0", // Light slate
};

/**
 * TrackFingerprint Component
 * 
 * A radar chart visualization of a track's audio fingerprint metrics.
 * Displays: Energy, Danceability, Brightness, Acousticness, Groove
 */
export function TrackFingerprint({
    track,
    size = 200,
    showLabels = true,
}: Props) {
    // Map track metrics to chart data, defaulting null values to 0
    const data: DataPoint[] = useMemo(() => [
        {
            metric: "Energy",
            value: track.energy ?? 0,
            fullMark: 100
        },
        {
            metric: "Dance",
            value: track.danceability ?? 0,
            fullMark: 100
        },
        {
            metric: "Bright",
            value: track.brightness ?? 0,
            fullMark: 100
        },
        {
            metric: "Acoustic",
            value: track.acousticness ?? 0,
            fullMark: 100
        },
        {
            metric: "Groove",
            value: track.groove ?? 0,
            fullMark: 100
        },
    ], [track]);

    // Check if track has any fingerprint data
    const hasData = useMemo(() =>
        data.some(d => d.value > 0),
        [data]
    );

    if (!hasData) {
        return (
            <div style={{ ...styles.container, width: size, height: size }}>
                <div style={styles.noData}>
                    <span style={styles.noDataText}>No analysis data</span>
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.container, width: size, height: size }}>
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    {/* Grid lines */}
                    <PolarGrid
                        stroke={COLORS.grid}
                        strokeOpacity={0.5}
                    />

                    {/* Axis labels */}
                    {showLabels && (
                        <PolarAngleAxis
                            dataKey="metric"
                            tick={{
                                fill: COLORS.text,
                                fontSize: 10,
                                fontWeight: 500,
                            }}
                            tickLine={false}
                        />
                    )}

                    {/* Radius axis (hidden but sets scale) */}
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                    />

                    {/* The radar shape */}
                    <Radar
                        name="Fingerprint"
                        dataKey="value"
                        stroke={COLORS.stroke}
                        strokeWidth={2}
                        fill={COLORS.fill}
                        animationDuration={500}
                        animationEasing="ease-out"
                    />

                    {/* Tooltip on hover */}
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={false}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}

// Custom tooltip component
interface TooltipProps {
    active?: boolean;
    payload?: Array<{ payload: DataPoint }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div style={tooltipStyles.container}>
                <div style={tooltipStyles.metric}>{data.metric}</div>
                <div style={tooltipStyles.value}>{Math.round(data.value)}</div>
            </div>
        );
    }
    return null;
}

const tooltipStyles: Record<string, React.CSSProperties> = {
    container: {
        background: "rgba(15, 23, 42, 0.95)",
        border: "1px solid #334155",
        borderRadius: "6px",
        padding: "0.5rem 0.75rem",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    },
    metric: {
        fontSize: "0.75rem",
        color: "#94a3b8",
        marginBottom: "0.125rem",
    },
    value: {
        fontSize: "1rem",
        fontWeight: "bold",
        color: "#f472b6",
    },
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        position: "relative",
    },
    noData: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    noDataText: {
        fontSize: "0.75rem",
        color: "#64748b",
    },
};

export default TrackFingerprint;
