import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
    id: int("id").primaryKey({ autoIncrement: true }),
    filePath: text("file_path").notNull().unique(),
    artist: text("artist"),
    title: text("title"),

    // Core analysis metrics
    bpm: real("bpm"),
    energy: real("energy"),
    key: text("key"),

    // Fingerprint metrics (0-100 scale)
    danceability: real("danceability"),
    brightness: real("brightness"),
    acousticness: real("acousticness"),
    groove: real("groove"),

    // Analysis status
    analyzed: int("analyzed", { mode: "boolean" }).default(false),
});
