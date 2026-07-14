ALTER TABLE `project_characters`
  DROP COLUMN `sourceGlobalCharacterId`;

ALTER TABLE `project_locations`
  DROP COLUMN `sourceGlobalLocationId`;

DROP TABLE `global_character_appearances`;
DROP TABLE `global_location_images`;
DROP TABLE `global_characters`;
DROP TABLE `global_locations`;
DROP TABLE `global_asset_folders`;

ALTER TABLE `projects`
  RENAME COLUMN `globalAssetText` TO `worldContextText`;
