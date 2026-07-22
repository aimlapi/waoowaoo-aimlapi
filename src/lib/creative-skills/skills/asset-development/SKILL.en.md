# Asset Development and Generation Prompts

## Purpose

For `outputKind=asset_prompt_set`, translate the exact confirmed structured screenplay and exact adopted Style Bible frozen by the server into reusable visual designs for every canonical character, location, and prop in the screenplay. Both frozen upstream inputs are required. This Skill uses the union of all still-valid rules from the existing Chinese and English asset prompts so both languages follow the same discipline. It returns asset designs and generation prompts only; it does not generate images or write project state.

## Authoritative inputs and asset identity

- `productionContext.asset.screenplay` is the exact confirmed structured screenplay frozen by the server; `productionContext.asset.style` is the exact adopted Style Bible frozen by the server. They are not optional references and cannot be replaced by the `goal`, `sourceMaterials`, a reference image, or model inference.
- Only `productionContext.asset.screenplay.snapshot.canonicalRegistries.characters`, `locations`, and `props` form the sole and exhaustive asset list. `facts`, screenplay prose, and scenes are not a second list.
- For every character, output `canonicalEntity={kind:"character",entityId:characterId}` exactly once; for every location, output `canonicalEntity={kind:"location",entityId:locationId}` exactly once; for every prop, output `canonicalEntity={kind:"prop",entityId:propId}` exactly once. Add none, omit none, duplicate none, merge none, and never rewrite an identity.
- Never scan a story synopsis, screenplay prose, dialogue, scenes, or Stage 05/05A to infer, add, or remove an asset. Stage 05/05A usage scenes and entity-state changes, as well as other facts and scenes, may inform visible design and continuity requirements for an already registered entity only; they cannot change asset count or identity.
- Top-level `source.screenplayRevision` must echo `resourceId`, `revisionId`, `fingerprint`, `bindingVersion`, and `schemaId` from `productionContext.asset.screenplay.source` field by field. `source.styleRevision` must echo the same identity fields from `productionContext.asset.style.source`. Never guess the "latest" revision, substitute another revision, or invent source identity.

## Style-consumption boundary

- The frozen adopted Style Bible is the sole authority for visual style. Consume its cross-media `visualStyle` and asset-only `assetImageStyle.lighting/texture` exactly and read-only. Never redefine project style from one reference image or one asset, and never modify, supplement, or output another Style Bible.
- Always put style-free stable asset identity in `stableDescription`, then compose that identity with the exact Style Bible in the creative `generationPrompt` that precedes the execution policy. Never use that generation prompt to rewrite stable identity or upstream style.
- A stable character identity description excludes artistic style, filters, and lighting; the final image prompt appends them consistently.
- A foundational location description preserves real spatial structure, materials, and physical lighting conditions. Stylized lighting and material treatment are composed with the Style Bible only in the final image prompt.
- The execution layer's sole asset-image format policy appends and enforces the fixed format by asset kind. A `generationPrompt` must not introduce conflicting layout, background, or subject-count requirements.
- These fixed formats govern asset images only; they do not own, override, or constrain video composition. Video framing, scale, camera placement, movement, and editing remain entirely within directing and video design.
- The exact adopted Style Bible outranks source-image style. A reference preserves identity and structure and cannot override confirmed art direction. Ignore incidental source color cast, lighting, blur, noise, and defects.

## Fixed asset-image formats and execution boundary

- A character asset is one fixed 4:3 landscape image divided into equal left and right halves: the left half is a face close-up of the character, and the right half shows the same character completely from head to toe. The background is pure white. Only that character may appear; no location, prop, or other person may appear.
- A location asset is one fixed 4:3 landscape image: a complete panoramic environment seen straight on, never a multi-view sheet. It contains no people, loose furniture, or prop presented as an independent asset subject. Fixed structures and built-in elements that constitute the location itself—such as walls, floors, doors, windows, and stairs—remain allowed.
- A prop asset is one fixed 4:3 landscape image that shows exactly one prop, squarely aligned, clearly oriented, centered, complete, and unobstructed, on a pure white background. It contains no person, other prop, or location.
- These are asset-kind contracts, not style or composition candidates for a model to choose. The Skill keeps design content compatible with them; the execution policy is the sole writer of the 4:3 aspect ratio, exact layout, and final suffix. A `generationPrompt` must not duplicate those execution instructions.

## Character design

### Visible information for human characters

- Establish gender presentation and a specific age impression.
- Describe face shape and visible facial features, including eye shape and size, but never eye color.
- Describe hair color, length, style, and texture.
- Describe height impression, posture, shoulder width, waistline, body type, and overall silhouette.
- For skin, describe only texture and visible marks such as smoothness, roughness, freckles, birthmarks, scars, or tattoos. Do not describe skin tone, lip color, complexion, eye color, or the color of any body part.
- Clothing includes silhouette, era, material, palette, construction, and detail. Shoes are mandatory in a complete character design and must include style, material, and color.
- Add only wearable accessories that strengthen identity and reuse, such as glasses, earrings, necklaces, watches, or rings.
- Clothing, hair, footwear, and accessories must fit the story's era and social context.

### Non-human characters

- Animals, mythic creatures, non-humanoid beings, and explicitly stylized identities must not be forced into a human appearance template.
- Begin from the character or species identity and describe form, silhouette, surface, defining anatomy, clothing, and core recognition anchors.
- During modification, preserve those identity anchors and change only what the user requests.

### Character-description discipline

- A character asset description contains stable appearance only: no expression, pose, action, background, environment, held story prop, or narrative sentence.
- Do not use uncertainty such as “or,” “possibly,” “maybe,” or “probably.” Every visual choice is concrete.
- Do not write invisible abstractions such as “powerful aura” or “an air of mature confidence.” Translate role energy into visible silhouette, clothing, material, and accessories.
- Explicit source appearance has highest priority while still respecting body-color restrictions and current safety boundaries.
- Preserve reasonable generative freedom. Unless the input demands it, do not lock every facial micro-feature, hair strand, color swatch, or accessory.

## Character reference images

- Extract stable identity from face structure, hairstyle, body type, garment construction, and wearable accessories.
- When the image shows only part of the body, infer compatible lower garments, shoes, arms, and hands from the visible clothing and identity. Added parts must coordinate with visible parts.
- Image-derived descriptions still exclude skin tone, eye color, expression, action, background, and pose.
- Reference analysis may include overall styling or character-impression keywords directly supported by the image. In a final generation description, translate those keywords into visible silhouette, clothing, material, and accessories rather than leaving an unrenderable abstraction.
- For a character asset, use attractive normal proportions, complete clothing and footwear, major wearable accessories, a calm neutral expression, and stable identity anchors. Do not request a styled background, multi-view sheet, action breakdown, or context sample. The final image must be clear, sharp, richly detailed, and production-quality rather than inheriting source blur, noise, or defects.

## Character candidates

- Candidates are internal design comparisons for one canonical character only. Select one final direction and write it into that `canonicalEntity`'s sole `assets` entry.
- Candidates are different design directions for the same character identity, not different characters.
- Useful emphases include identity and silhouette fidelity, wardrobe/material/era texture, and role energy with cross-scene identity-reference usability.
- Differences must be legible while preserving the shared core identity. Do not manufacture variety by changing age, species, relationship, or plot facts.
- Casting, clothing, palette, material, and atmosphere must remain compatible with the exact adopted Style Bible.

## Location design

- Start from an explicit scene name or spatial identity and turn a generic label such as “classroom” or “office” into a stable, controllable, real space.
- Faithfully preserve the user's core location identity, fixed structures, built-in elements, materials, era cues, and spatial relationships. Do not replace it with a familiar but unrelated location category.
- Specify architecture and spatial structure: walls, floor, ceiling, doors, windows, boundaries, openings, scale, and depth.
- Make material, color, and surface condition concrete. Use wear that belongs to the architecture or space itself rather than independent prop dressing to manufacture location identity.
- Establish clear foreground, midground, and background or near, middle, and far layers. Show a complete environment and understandable boundaries rather than a cropped or ambiguous background.
- Provide at least three stable, clearly visible structural anchors. Anchors must come from walls, floors, doors, windows, stairs, or other fixed structures and built-in elements rather than independent props used to fill the image.
- For a new final location-generation description, lighting includes a real source, position, time, and visible effect on space. When modifying a foundational location description stored as project fact, retain physical sources and illumination conditions but omit dramatic lighting effects supplied by the Style Bible; the final generation prompt composes that foundation with the asset-image style. Asset-only lighting rules must never become cross-media visual style.
- A location asset never adds people or props presented as independent asset subjects. An inherently busy setting does not justify anonymous crowds or loose prop dressing.
- A location asset is a reusable establishing environment, not a narrative action frame. It contains no dialogue, captions, explanation text, watermark, annotation, arrows, or logo.
- Natural diegetic text may remain only when it belongs to a fixed structure or built-in element, such as an integrated sign or door number. Keep it secondary and natural, without random gibberish or intrusive floating text.

## Location candidates

- Candidates are internal design comparisons for one canonical location only. Select one final direction and write it into that `canonicalEntity`'s sole `assets` entry.
- From the canonical location's usage scenes, select design evidence that best reveals its spatial identity and supports downstream visual reuse. Do not mechanically repeat its first appearance, and never replace it with another location.
- A baseline direction faithfully renders identity, fixed structure, structural anchors, materials, and lighting.
- A narrative-core direction strengthens how the same location carries conflict, revelation, reversal, recurring pressure, or emotional turn. Express tension through architecture, negative space, fixed structures, motivated light, color, and material rather than explanatory prose or a substituted location.
- A production-texture direction infers era, genre, class texture, emotional temperature, and subtext, then strengthens spatial structure, surfaces, use traces, practical sources, air, reflections, and shadows. It must not add visual density through people, independent furniture, or prop dressing.
- Every candidate remains an empty, complete, reusable environment. Do not create differences by adding contradictory story facts.

## Prop design

- Describe only the prop's static visible body: primary structure, silhouette, quantity relationships, material, color, surface treatment, pattern, decoration, and wear.
- Do not describe use, plot, character action, people, hands, tables, rooms, background, camera, or atmospheric lighting.
- The design text contains only the single prop itself and remains compatible with the execution policy's fixed prop-asset format.
- A reference image may contribute silhouette, construction, material, pattern, and palette, but not incidental people or background.

## Modifying an existing asset

- A modification must not change or create a `canonicalEntity`; every entity in the three canonical registries must still be output exactly once.
- First identify the exact visual features requested for change, then replace or add only the relevant material.
- Preserve every unmodified identity, structure, material, color, decoration, and style fact.
- When a reference image is present, absorb only features relevant to the requested change. Do not let the reference overwrite user-approved content or the Style Bible.
- Recheck fluency, internal consistency, era fit, and asset-type boundaries after modification.
- If a location modification adds or removes a major anchor, update spatial structure, depth layers, and placement space accordingly; never let the description collapse into a generic scene.

## Review

- Do the top-level screenplay and style source refs match the server-frozen identities field by field?
- Does `assets` contain only `canonicalRegistries.characters/locations/props`, with every entity appearing exactly once through its exact `canonicalEntity`?
- Does the design consume the exact adopted Style Bible read-only and clearly separate cross-media `visualStyle` from asset-only `assetImageStyle.lighting/texture`?
- Is the character stable, complete, era-consistent, explicit about footwear, and free of body color, action, background, uncertainty, and abstract aura?
- Is a non-human identity described through its real form rather than a human template?
- Is the location faithful, complete and straight-on, structurally clear, stably anchored, and free of people and independent prop assets?
- Does the prop contain static object information only?
- Do candidates create meaningful variation without changing identity or plot facts?
- Does a modification preserve everything not requested to change?

## Boundary

This Skill provides visual design for canonical characters, locations, and props. Reference images supply identity and structure evidence for already registered entities only, and candidates are internal comparisons for the same entity. The visual-style Skill owns Style Bibles, style candidates, and style previews; this Skill consumes the exact adopted revision read-only. The execution layer's sole asset-image format policy owns the 4:3 image aspect ratio, exact fixed asset-image layout, and final image-prompt suffixes. This Skill does not duplicate the suffix, create a new asset identity, or touch directing, shots, camera movement, video composition, editing, dialogue performance, sound, or music.
