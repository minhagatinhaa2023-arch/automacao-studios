CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`key` varchar(128) NOT NULL,
	`label` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `bot_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`queueId` int,
	`status` enum('idle','running','completed','error') NOT NULL DEFAULT 'idle',
	`currentStep` varchar(255),
	`logMessages` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manus_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`password` varchar(255) NOT NULL,
	`phone` varchar(20),
	`status` enum('pending','creating','success','failed') NOT NULL DEFAULT 'pending',
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `manus_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signup_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`queueId` int,
	`email` varchar(320),
	`password` varchar(255),
	`phone` varchar(20),
	`status` enum('success','failed') NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signup_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signup_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`inviteUrl` varchar(512) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`processed` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`status` enum('pending','processing','completed','cancelled','failed') NOT NULL DEFAULT 'pending',
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signup_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `credits` int DEFAULT 0 NOT NULL;