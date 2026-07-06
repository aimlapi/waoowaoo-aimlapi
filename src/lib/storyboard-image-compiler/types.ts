import type { NumberedReferenceImage } from '@/lib/workers/handlers/image-task-handler-shared'

export type StoryboardImageCompilerDiagnosticCode =
  | 'GLOBAL_SCENE_LOCK_CROPPED_FOR_DETAIL_SHOT'
  | 'LOCATION_ANCHORS_CROPPED_FOR_DETAIL_SHOT'
  | 'OMITTED_CHARACTER_REMOVED'
  | 'OMITTED_PROP_REMOVED'
  | 'REFERENCE_IMAGE_FILTERED'
  | 'MICRO_DETAIL_REMOVED_FOR_WIDE_SHOT'

export type StoryboardImageCompilerDiagnostic = {
  readonly code: StoryboardImageCompilerDiagnosticCode
  readonly message: string
  readonly target?: string
}

export type ShotScaleClass = 'extreme_detail' | 'detail' | 'medium' | 'wide'

export type SceneAssetOmission = {
  readonly name: string
  readonly kind: 'character' | 'prop'
  readonly reason: string
}

export type SpatialHardLocks = {
  readonly anchor_layout: readonly string[]
  readonly screen_direction_locks: readonly string[]
  readonly forbidden_spatial_changes: readonly string[]
}

export type LocationZone = {
  readonly source: 'panel.photography_rules.scene_zone'
  readonly location_name: string | null
  readonly zone_id: string | null
  readonly zone_name: string | null
  readonly overall_position: string | null
  readonly must_include: readonly string[]
  readonly spatial_hard_locks: SpatialHardLocks | null
  readonly subject_position: string | null
  readonly camera_position: string | null
  readonly screen_composition: string | null
  readonly character_placements: readonly {
    readonly character_name: string
    readonly subject_position: string | null
    readonly facing: string | null
    readonly eyeline: string | null
  }[]
  readonly omitted_scene_assets: readonly SceneAssetOmission[]
}

export type GlobalSceneLock = {
  readonly source: 'location_reference.spatial_profile'
  readonly summary: string | null
  readonly lighting: string | null
  readonly stable_background: readonly string[]
}

export type SegmentContinuityLock = {
  readonly source: 'panel.photography_rules.segment_continuity'
  readonly production_segment_id: string | null
  readonly original_order_key: string | null
  readonly screenplay_scene_number: number | null
  readonly dramatic_context: string | null
  readonly temporal_state: string | null
  readonly atmosphere_state: string | null
  readonly crowd_state: string | null
  readonly spatial_continuity: readonly string[]
  readonly persistent_set_state: readonly string[]
  readonly character_continuity: readonly string[]
  readonly screen_direction_rules: readonly string[]
  readonly inherited_continuity: readonly string[]
  readonly changed_continuity: readonly string[]
  readonly visible_continuity_elements: readonly string[]
  readonly forbidden_discontinuity: readonly string[]
}

export type CharacterGraph = {
  readonly references: readonly NumberedReferenceImage[]
  readonly characters: readonly {
    readonly id: string
    readonly name: string
    readonly appearance: string | null
    readonly description: string | null
    readonly referenceImage: string | null
    readonly identity_lock: readonly string[]
    readonly wardrobe_lock: string | null
  }[]
}

export type PropGraphItem = {
  readonly id: string
  readonly name: string
  readonly visualDescription: string
  readonly referenceImage: string | null
  readonly source: 'panel.props'
}

export type StillFrame = {
  readonly shot_scale: string | null
  readonly static_framing: string | null
  readonly shot_priority: readonly string[]
  readonly explicit_image_prompt: string | null
  readonly visible_subjects: readonly string[]
  readonly action: string | null
  readonly emotion: string | null
  readonly visible_props: readonly string[]
  readonly crop_priority: string
}

export type StoryboardImageCompilerLayerPlan = {
  readonly version: 'storyboard-image-prompt-compiler-v2'
  readonly shot_scale_class: ShotScaleClass
  readonly global_style_layer: {
    readonly source: 'style_bible_negative_boundary_rules'
    readonly rule: string
  }
  readonly adaptive_spatial_layer: {
    readonly active_location_zone: string | null
    readonly active_anchors: readonly string[]
    readonly lighting_lock: string | null
    readonly global_summary_used: boolean
  }
  readonly subject_prop_state_layer: {
    readonly visible_characters: readonly string[]
    readonly visible_props: readonly string[]
    readonly omitted_assets: readonly SceneAssetOmission[]
  }
  readonly cinematography_framing_layer: {
    readonly shot_scale: string | null
    readonly depth_strategy: string
    readonly focus_subjects: readonly string[]
    readonly crop_priority: string
  }
  readonly action_performance_layer: {
    readonly action: string | null
    readonly emotion: string | null
    readonly readable_physical_detail: string
  }
  readonly compiler_validator: {
    readonly diagnostics: readonly StoryboardImageCompilerDiagnostic[]
  }
}

export type StoryboardStillPromptFacts = {
  readonly panel: {
    readonly panel_id: string
    readonly shot_type: string | null
    readonly still_frame: StillFrame
  }
  readonly context: {
    readonly reference_images: readonly NumberedReferenceImage[]
    readonly COMPILER_V2: StoryboardImageCompilerLayerPlan
    readonly LOCATION_ZONE: LocationZone | null
    readonly SEGMENT_CONTINUITY: SegmentContinuityLock | null
    readonly GLOBAL_SCENE_LOCK: GlobalSceneLock | null
    readonly CHARACTER_GRAPH: CharacterGraph
    readonly PROP_GRAPH: readonly PropGraphItem[]
    readonly NEGATIVE: readonly string[]
  }
}
