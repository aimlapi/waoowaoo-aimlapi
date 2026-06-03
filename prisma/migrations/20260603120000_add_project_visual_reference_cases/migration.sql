CREATE TABLE `project_visual_reference_cases` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NOT NULL,
  `screenplayId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(128) NOT NULL,
  `description` LONGTEXT NOT NULL,
  `prompt` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'processing',
  `taskId` VARCHAR(191) NULL,
  `errorMessage` LONGTEXT NULL,
  `imageUrl` TEXT NULL,
  `imageMediaId` VARCHAR(191) NULL,
  `isSelected` BOOLEAN NOT NULL DEFAULT false,
  `sortIndex` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `project_visual_reference_cases_projectId_idx` ON `project_visual_reference_cases`(`projectId`);
CREATE INDEX `project_visual_reference_cases_episodeId_idx` ON `project_visual_reference_cases`(`episodeId`);
CREATE INDEX `project_visual_reference_cases_screenplayId_idx` ON `project_visual_reference_cases`(`screenplayId`);
CREATE INDEX `project_visual_reference_cases_imageMediaId_idx` ON `project_visual_reference_cases`(`imageMediaId`);
CREATE INDEX `project_visual_reference_cases_taskId_idx` ON `project_visual_reference_cases`(`taskId`);

ALTER TABLE `project_visual_reference_cases`
  ADD CONSTRAINT `project_visual_reference_cases_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_visual_reference_cases`
  ADD CONSTRAINT `project_visual_reference_cases_episodeId_fkey`
  FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_visual_reference_cases`
  ADD CONSTRAINT `project_visual_reference_cases_screenplayId_fkey`
  FOREIGN KEY (`screenplayId`) REFERENCES `project_edit_screenplays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_visual_reference_cases`
  ADD CONSTRAINT `project_visual_reference_cases_imageMediaId_fkey`
  FOREIGN KEY (`imageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
