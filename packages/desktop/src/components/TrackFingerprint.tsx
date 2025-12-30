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

/**
 * Generic fingerprint metrics interface
 * Used for both individual tracks and set averages
 */
export interface FingerprintMetrics {
    energy: number | null;
    danceability: number | null;
    brightness: number | null;
    acousticness: number | null;
    groove: number | null;
}

interface Props {
    metrics: FingerprintMetrics;
    size?: number;
    showLabels?: boolean;
    /** Optional title to show above the chart */
    title?: string;
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
 * A radar chart visualization of audio fingerprint metrics.
 * Displays: Energy, Danceability, Brightness, Acousticness, Groove
 * 
 * Can be used for individual tracks or set averages.
 */
export function TrackFingerprint({
    metrics,
    size = 200,
    showLabels = true,
    title,
}: Props) {
    // Map metrics to chart data, defaulting null values to 0
    const data: DataPoint[] = useMemo(() => [
        {
            metric: "Energy",
            value: metrics.energy ?? 0,
            fullMark: 100
        },
        {
            metric: "Dance",
            value: metrics.danceability ?? 0,
            fullMark: 100
        },
        {
            metric: "Bright",
            value: metrics.brightness ?? 0,
            fullMark: 100
        },
        {
            metric: "Acoustic",
            value: metrics.acousticness ?? 0,
            fullMark: 100
        },
        {
            metric: "Groove",
            value: metrics.groove ?? 0,
            fullMark: 100
        },
    ], [metrics]);

    // Check if there's any fingerprint data
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
            {title && <div style={styles.title}>{title}</div>}
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
    title: {
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: "0.625rem",
        fontWeight: "bold",
        textTransform: "uppercase",
        color: "#64748b",
        letterSpacing: "0.05em",
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
