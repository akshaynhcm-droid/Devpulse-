-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE `subscriptions` (
    `id` varchar(64) NOT NULL,
    `userId` int NOT NULL,
    `plan` enum('free','pro','enterprise') NOT NULL DEFAULT 'free',
    `razorpaySubscriptionId` varchar(255),
    `razorpayCustomerId` varchar(255),
    `status` enum('active','paused','cancelled','past_due','pending') NOT NULL DEFAULT 'pending',
    `currentPeriodStart` timestamp,
    `currentPeriodEnd` timestamp,
    `cancelledAt` timestamp,
    `cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
    `createdAt` timestamp NOT NULL DEFAULT (now()),
    `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
    CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`),
    CONSTRAINT `subscriptions_razorpaySubscriptionId_unique` UNIQUE(`razorpaySubscriptionId`)
);

--> statement-breakpoint

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE `payments` (
    `id` varchar(64) NOT NULL,
    `userId` int NOT NULL,
    `subscriptionId` varchar(64),
    `razorpayPaymentId` varchar(255) NOT NULL,
    `razorpayOrderId` varchar(255),
    `amount` decimal(10,2) NOT NULL,
    `currency` varchar(3) NOT NULL DEFAULT 'INR',
    `status` enum('created','authorized','captured','failed','refunded','partially_refunded') NOT NULL DEFAULT 'created',
    `receipt` varchar(255),
    `description` text,
    `metadata` json,
    `refundAmount` decimal(10,2) DEFAULT '0',
    `refundStatus` enum('null','partial','full') DEFAULT 'null',
    `createdAt` timestamp NOT NULL DEFAULT (now()),
    `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `payments_id` PRIMARY KEY(`id`),
    CONSTRAINT `payments_razorpayPaymentId_unique` UNIQUE(`razorpayPaymentId`)
);

--> statement-breakpoint

-- ============================================================================
-- ADD PLAN COLUMN TO USERS TABLE (for quick access without joins)
-- ============================================================================
ALTER TABLE `users` ADD `plan` enum('free','pro','enterprise') NOT NULL DEFAULT 'free';
ALTER TABLE `users` ADD `planUpdatedAt` timestamp;

--> statement-breakpoint

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX `userId_idx` ON `subscriptions` (`userId`);
CREATE INDEX `razorpaySubscriptionId_idx` ON `subscriptions` (`razorpaySubscriptionId`);
CREATE INDEX `status_idx` ON `subscriptions` (`status`);
CREATE INDEX `currentPeriodEnd_idx` ON `subscriptions` (`currentPeriodEnd`);

--> statement-breakpoint

CREATE INDEX `userId_idx` ON `payments` (`userId`);
CREATE INDEX `subscriptionId_idx` ON `payments` (`subscriptionId`);
CREATE INDEX `razorpayPaymentId_idx` ON `payments` (`razorpayPaymentId`);
CREATE INDEX `status_idx` ON `payments` (`status`);
CREATE INDEX `createdAt_idx` ON `payments` (`createdAt`);

--> statement-breakpoint

CREATE INDEX `plan_idx` ON `users` (`plan`);
