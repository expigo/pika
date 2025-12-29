import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
    id: int("id").primaryKey({ autoIncrement: true }),
    filePath: text("file_path").notNull().unique(),
    artist: text("artist"),
    title: text("title"),
    bpm: real("bpm"),
    energy: real("energy"),
    key: text("key"),
    analyzed: int("analyzed", { mode: "boolean" }).default(false),
});
