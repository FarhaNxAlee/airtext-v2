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

export const roles = sqliteTable(
  "roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rank: integer("rank").notNull().unique(), // 0 = admin, 1 = contributor, 2 = pro (lower = higher precedence)
    name: text("name").notNull(), // admin-editable display label
    isSystem: integer("is_system").notNull().default(0), // seeded rows (rank 0/1/2); prevents delete, allows rename
    defaultLimits: text("default_limits").notNull(), // JSON, see src/lib/limits.ts
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    rankIdx: index("idx_roles_rank").on(table.rank),
  }),
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    customLimits: text("custom_limits"), // nullable JSON override, merged over role defaults
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    lastLoginAt: integer("last_login_at"),
  },
  (table) => ({
    emailIdx: index("idx_users_email").on(table.email),
    roleIdx: index("idx_users_role").on(table.roleId),
    statusCheck: check("users_status_check", sql`${table.status} IN ('active', 'disabled')`),
  }),
);

export const fileGroups = sqliteTable(
  "file_groups",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    userId: text("user_id").references(() => users.id),
    title: text("title").notNull(),
    locked: integer("locked").notNull().default(0),
    pinSalt: text("pin_salt"),
    pinHash: text("pin_hash"),
    code: text("code").notNull().unique(),
    deleteTokenHash: text("delete_token_hash").notNull(),
    totalSizeBytes: integer("total_size_bytes").notNull(),
    burnAfterRead: integer("burn_after_read").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => ({
    codeIdx: index("idx_file_groups_code").on(table.code),
    expiresIdx: index("idx_file_groups_expires").on(table.expiresAt),
    createdIdx: index("idx_file_groups_created").on(sql`${table.createdAt} desc`),
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
    userId: text("user_id").references(() => users.id),
    burnAfterRead: integer("burn_after_read").notNull().default(0),
    bodyEncrypted: integer("body_encrypted").notNull().default(0),
    encryptionIv: text("encryption_iv"),
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

/**
 * One file within a file_groups batch. All the per-share metadata (title,
 * PIN, code, expiry, delete token, ownership) lives on the group, not
 * here -- a group of size 1 is just a normal single-file share, so
 * there's only one code path for file sharing (see Phase 5 in the plan).
 */
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => fileGroups.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull(),
    r2Key: text("r2_key").notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    groupIdx: index("idx_files_group").on(table.groupId),
  }),
);

export const networkFiles = sqliteTable(
  "network_files",
  {
    roomId: text("room_id").notNull(),
    groupId: text("group_id")
      .notNull()
      .references(() => fileGroups.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["mine", "received"] }).notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.groupId] }),
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
