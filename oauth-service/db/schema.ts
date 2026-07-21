import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const oauthSessions = sqliteTable("oauth_sessions", {
  id: text("id").primaryKey(),
  oauthStateHash: text("oauth_state_hash").notNull().unique(),
  localState: text("local_state").notNull(),
  callbackUri: text("callback_uri").notNull(),
  handoffChallenge: text("handoff_challenge").notNull(),
  clientFingerprint: text("client_fingerprint").notNull(),
  status: text("status").notNull(),
  handoffCodeHash: text("handoff_code_hash").unique(),
  tokenCiphertext: text("token_ciphertext"),
  tokenIv: text("token_iv"),
  tokenExpiresAt: integer("token_expires_at"),
  memberUrn: text("member_urn"),
  memberName: text("member_name"),
  scopes: text("scopes"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
});
