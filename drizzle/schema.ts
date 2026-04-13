import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, boolean, json } from "drizzle-orm/mysql-core";

/**
 * Core user table with credits system
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  credits: int("credits").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * API keys per user
 */
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Queue for signup tasks
 */
export const signupQueue = mysqlTable("signup_queue", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  inviteUrl: varchar("inviteUrl", { length: 512 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  processed: int("processed").default(0).notNull(),
  failed: int("failed").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "cancelled", "failed"]).default("pending").notNull(),
  priority: int("priority").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * History of individual signup attempts
 */
export const signupHistory = mysqlTable("signup_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  queueId: int("queueId"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Created Manus accounts
 */
export const manusAccounts = mysqlTable("manus_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  status: mysqlEnum("status", ["pending", "creating", "success", "failed"]).default("pending").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Bot sessions for live VNC view
 */
export const botSessions = mysqlTable("bot_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  queueId: int("queueId"),
  status: mysqlEnum("status", ["idle", "running", "completed", "error"]).default("idle").notNull(),
  currentStep: varchar("currentStep", { length: 255 }),
  logMessages: json("logMessages"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type SignupQueue = typeof signupQueue.$inferSelect;
export type SignupHistory = typeof signupHistory.$inferSelect;
export type ManusAccount = typeof manusAccounts.$inferSelect;
export type BotSession = typeof botSessions.$inferSelect;
