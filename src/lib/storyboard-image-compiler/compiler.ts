import type {
  StoryboardImageCompilerDiagnostic,
  StoryboardStillPromptFacts,
} from './types'
import { runActionPerformanceLayer } from './action-performance-layer'
import { runAdaptiveSpatialLayer } from './spatial-layer'
import { runCinematographyFramingLayer } from './cinematography-framing-layer'
import { runReferenceImageLayer } from './reference-layer'
import { classifyShotScale } from './shot-scale'
import { runSubjectPropStateLayer } from './subject-prop-state-layer'
import { buildCompilerLayerPlan } from './validator'

export { filterReferenceImageUrlsByPromptMap } from './reference-layer'

export function compileStoryboardStillPromptFactsV2(
  facts: StoryboardStillPromptFacts,
): {
  readonly facts: StoryboardStillPromptFacts
  readonly diagnostics: readonly StoryboardImageCompilerDiagnostic[]
} {
  const diagnostics: StoryboardImageCompilerDiagnostic[] = []
  const shotScale = classifyShotScale(facts.panel.still_frame.shot_scale ?? facts.panel.shot_type)

  const spatialLayer = runAdaptiveSpatialLayer({
    locationZone: facts.context.LOCATION_ZONE,
    globalSceneLock: facts.context.GLOBAL_SCENE_LOCK,
    shotScale,
    diagnostics,
  })

  const subjectPropLayer = runSubjectPropStateLayer({
    characterGraph: facts.context.CHARACTER_GRAPH,
    propGraph: facts.context.PROP_GRAPH,
    locationZone: spatialLayer.locationZone,
    diagnostics,
  })

  const framingLayer = runCinematographyFramingLayer({
    stillFrame: facts.panel.still_frame,
    characterGraph: subjectPropLayer.characterGraph,
    propGraph: subjectPropLayer.propGraph,
    shotScale,
  })

  const performanceLayer = runActionPerformanceLayer({
    stillFrame: framingLayer.stillFrame,
    shotScale,
    diagnostics,
  })

  const referenceImages = runReferenceImageLayer({
    references: facts.context.reference_images,
    characterGraph: subjectPropLayer.characterGraph,
    propGraph: subjectPropLayer.propGraph,
    shotScale,
    diagnostics,
  })

  const compiledWithoutLayerPlan: StoryboardStillPromptFacts = {
    ...facts,
    panel: {
      ...facts.panel,
      still_frame: performanceLayer.stillFrame,
    },
    context: {
      ...facts.context,
      reference_images: referenceImages,
      LOCATION_ZONE: spatialLayer.locationZone,
      GLOBAL_SCENE_LOCK: spatialLayer.globalSceneLock,
      CHARACTER_GRAPH: subjectPropLayer.characterGraph,
      PROP_GRAPH: subjectPropLayer.propGraph,
      COMPILER_V2: {
        ...facts.context.COMPILER_V2,
        shot_scale_class: shotScale,
        compiler_validator: {
          diagnostics,
        },
      },
    },
  }

  const compiledFacts: StoryboardStillPromptFacts = {
    ...compiledWithoutLayerPlan,
    context: {
      ...compiledWithoutLayerPlan.context,
      COMPILER_V2: buildCompilerLayerPlan({
        facts: compiledWithoutLayerPlan,
        locationZone: spatialLayer.locationZone,
        globalSceneLock: spatialLayer.globalSceneLock,
        depthStrategy: framingLayer.depthStrategy,
        focusSubjects: framingLayer.focusSubjects,
        readablePhysicalDetail: performanceLayer.readablePhysicalDetail,
      }),
    },
  }

  return {
    facts: compiledFacts,
    diagnostics,
  }
}
