import type {
  GlobalSceneLock,
  LocationZone,
  StoryboardImageCompilerLayerPlan,
  StoryboardStillPromptFacts,
} from './types'

export function buildCompilerLayerPlan(input: {
  readonly facts: StoryboardStillPromptFacts
  readonly locationZone: LocationZone | null
  readonly globalSceneLock: GlobalSceneLock | null
  readonly depthStrategy: string
  readonly focusSubjects: readonly string[]
  readonly readablePhysicalDetail: string
}): StoryboardImageCompilerLayerPlan {
  return {
    version: 'storyboard-image-prompt-compiler-v2',
    shot_scale_class: input.facts.context.COMPILER_V2.shot_scale_class,
    global_style_layer: {
      source: 'style_bible_negative_boundary_rules',
      rule: 'Style, negative prompt, and boundary rules are inherited globally; panel layers may not rewrite them.',
    },
    adaptive_spatial_layer: {
      active_location_zone: input.locationZone?.zone_name ?? input.locationZone?.zone_id ?? null,
      active_anchors: input.locationZone?.must_include ?? [],
      lighting_lock: input.globalSceneLock?.lighting ?? null,
      global_summary_used: input.globalSceneLock?.summary !== null && input.globalSceneLock?.summary !== undefined,
    },
    subject_prop_state_layer: {
      visible_characters: input.facts.context.CHARACTER_GRAPH.characters.map((character) => character.name),
      visible_props: input.facts.context.PROP_GRAPH.map((prop) => prop.name),
      omitted_assets: input.locationZone?.omitted_scene_assets ?? [],
    },
    cinematography_framing_layer: {
      shot_scale: input.facts.panel.still_frame.shot_scale,
      depth_strategy: input.depthStrategy,
      focus_subjects: input.focusSubjects,
      crop_priority: input.facts.panel.still_frame.crop_priority,
    },
    action_performance_layer: {
      action: input.facts.panel.still_frame.action ? 'STILL_FRAME.action' : null,
      emotion: input.facts.panel.still_frame.emotion ? 'STILL_FRAME.emotion' : null,
      readable_physical_detail: input.readablePhysicalDetail,
    },
    compiler_validator: {
      diagnostics: input.facts.context.COMPILER_V2.compiler_validator.diagnostics,
    },
  }
}

export function emptyCompilerLayerPlan(): StoryboardImageCompilerLayerPlan {
  return {
    version: 'storyboard-image-prompt-compiler-v2',
    shot_scale_class: 'medium',
    global_style_layer: {
      source: 'style_bible_negative_boundary_rules',
      rule: 'Style, negative prompt, and boundary rules are inherited globally; panel layers may not rewrite them.',
    },
    adaptive_spatial_layer: {
      active_location_zone: null,
      active_anchors: [],
      lighting_lock: null,
      global_summary_used: false,
    },
    subject_prop_state_layer: {
      visible_characters: [],
      visible_props: [],
      omitted_assets: [],
    },
    cinematography_framing_layer: {
      shot_scale: null,
      depth_strategy: 'balanced cinematic depth',
      focus_subjects: [],
      crop_priority: 'Keep the subject and key props readable inside a single still frame.',
    },
    action_performance_layer: {
      action: null,
      emotion: null,
      readable_physical_detail: 'Read the dramatic state through visible body language.',
    },
    compiler_validator: {
      diagnostics: [],
    },
  }
}
