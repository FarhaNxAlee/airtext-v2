import { sqliteTable, text, integer, index, primaryKey, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Mirrors the live production schema created by ensureD1Schema() in
 * airtext-worker-modern.js:1457-1567 — column names/types/constraints must
 * match exactly since this binds to the real `airtext` D1 database.
 */

export const siteSettings = sqliteTable(
  "site_settings",
  {
    id: integer("id").primaryKey(),
    data: text("data").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    idCheck: check("site_settings_id_check", sql`${table.id} = 1`),
  }),
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    locked: integer("locked").notNull().default(0),
    pinSalt: text("pin_salt"),
    pinHash: text("pin_hash"),
    code: text("code").notNull().unique(),
    deleteTokenHash: text("delete_token_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => ({
    codeIdx: index("idx_notes_code").on(table.code),
    expiresIdx: index("idx_notes_expires").on(table.expiresAt),
    createdIdx: index("idx_notes_created").on(sql`${table.createdAt} desc`),
  }),
);

export const networkNotes = sqliteTable(
  "network_notes",
  {
    roomId: text("room_id").notNull(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["mine", "received"] }).notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.noteId] }),
    roomIdx: index("idx_network_notes_room").on(table.roomId, sql`${table.addedAt} desc`),
    sourceCheck: check("network_notes_source_check", sql`${table.source} IN ('mine', 'received')`),
  }),
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull(),
    r2Key: text("r2_key").notNull(),
    locked: integer("locked").notNull().default(0),
    pinSalt: text("pin_salt"),
    pinHash: text("pin_hash"),
    code: text("code").notNull().unique(),
    deleteTokenHash: text("delete_token_hash").notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => ({
    codeIdx: index("idx_files_code").on(table.code),
    expiresIdx: index("idx_files_expires").on(table.expiresAt),
    createdIdx: index("idx_files_created").on(sql`${table.createdAt} desc`),
  }),
);

export const networkFiles = sqliteTable(
  "network_files",
  {
    roomId: text("room_id").notNull(),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["mine", "received"] }).notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.fileId] }),
    roomIdx: index("idx_network_files_room").on(table.roomId, sql`${table.addedAt} desc`),
    sourceCheck: check("network_files_source_check", sql`${table.source} IN ('mine', 'received')`),
  }),
);

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    message: text("message").notNull(),
    email: text("email").notNull().default(""),
    rating: integer("rating").notNull().default(0),
    status: text("status").notNull().default("new"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => ({
    createdIdx: index("idx_feedback_created").on(sql`${table.createdAt} desc`),
    statusIdx: index("idx_feedback_status").on(table.status),
  }),
);

export const analytics = sqliteTable(
  "analytics",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    at: integer("at").notNull(),
    date: text("date").notNull(),
    network: text("network").notNull(),
    device: text("device").notNull(),
    via: text("via").notNull(),
    locked: integer("locked").notNull().default(0),
    category: text("category").notNull().default(""),
    actor: text("actor").notNull().default(""),
  },
  (table) => ({
    dateIdx: index("idx_analytics_date").on(table.date),
    typeIdx: index("idx_analytics_type").on(table.type),
  }),
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => ({
    expiresIdx: index("idx_rate_limits_expires").on(table.expiresAt),
  }),
);
