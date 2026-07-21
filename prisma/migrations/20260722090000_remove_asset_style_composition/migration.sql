-- Style Bible no longer owns asset-image layout. These two tables are mutable
-- current-state projections, so remove only the obsolete asset composition key.
-- Immutable CreativeResource revisions are migrated by the companion successor
-- script; completed Task results and historical provenance remain untouched.
UPDATE `project_edit_bibles`
SET `styleBibleJson` = JSON_REMOVE(
  `styleBibleJson`,
  '$.assetImageStyle.composition'
)
WHERE `styleBibleJson` IS NOT NULL
  AND JSON_CONTAINS_PATH(`styleBibleJson`, 'one', '$.assetImageStyle.composition') = 1;

UPDATE `project_edit_style_previews`
SET `styleBibleJson` = JSON_REMOVE(
  `styleBibleJson`,
  '$.assetImageStyle.composition'
)
WHERE JSON_CONTAINS_PATH(`styleBibleJson`, 'one', '$.assetImageStyle.composition') = 1;
