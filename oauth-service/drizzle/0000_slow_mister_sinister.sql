CREATE TABLE `oauth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`oauth_state_hash` text NOT NULL,
	`local_state` text NOT NULL,
	`callback_uri` text NOT NULL,
	`handoff_challenge` text NOT NULL,
	`client_fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`handoff_code_hash` text,
	`token_ciphertext` text,
	`token_iv` text,
	`token_expires_at` integer,
	`member_urn` text,
	`member_name` text,
	`scopes` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_sessions_oauth_state_hash_unique` ON `oauth_sessions` (`oauth_state_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_sessions_handoff_code_hash_unique` ON `oauth_sessions` (`handoff_code_hash`);