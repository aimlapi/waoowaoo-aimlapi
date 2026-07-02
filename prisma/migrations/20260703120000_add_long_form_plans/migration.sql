CREATE TABLE `project_long_form_plans` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `sourceEpisodeId` VARCHAR(191) NULL,
  `userPrompt` LONGTEXT NOT NULL,
  `totalDurationSec` INTEGER NOT NULL,
  `segmentDurationSec` INTEGER NOT NULL DEFAULT 120,
  `segmentCount` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'generating',
  `screenplayText` LONGTEXT NULL,
  `globalAssetsJson` JSON NULL,
  `styleBibleJson` JSON NULL,
  `errorMessage` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `project_long_form_plans_projectId_idx`(`projectId`),
  INDEX `project_long_form_plans_sourceEpisodeId_idx`(`sourceEpisodeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_long_form_segments` (
  `id` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NOT NULL,
  `segmentIndex` INTEGER NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `synopsis` LONGTEXT NOT NULL,
  `screenplayText` LONGTEXT NOT NULL,
  `targetDurationSec` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'screenplay_ready',
  `assetRefsJson` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `project_long_form_segments_episodeId_key`(`episodeId`),
  UNIQUE INDEX `project_long_form_segments_planId_segmentIndex_key`(`planId`, `segmentIndex`),
  INDEX `project_long_form_segments_projectId_idx`(`projectId`),
  INDEX `project_long_form_segments_episodeId_idx`(`episodeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_long_form_plans`
  ADD CONSTRAINT `project_long_form_plans_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_long_form_plans`
  ADD CONSTRAINT `project_long_form_plans_sourceEpisodeId_fkey`
  FOREIGN KEY (`sourceEpisodeId`) REFERENCES `project_episodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_long_form_segments`
  ADD CONSTRAINT `project_long_form_segments_planId_fkey`
  FOREIGN KEY (`planId`) REFERENCES `project_long_form_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_long_form_segments`
  ADD CONSTRAINT `project_long_form_segments_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_long_form_segments`
  ADD CONSTRAINT `project_long_form_segments_episodeId_fkey`
  FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
