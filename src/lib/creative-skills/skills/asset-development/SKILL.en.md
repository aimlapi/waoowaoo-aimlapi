# Asset Development and Generation Prompts

## Purpose

Translate story facts, user requirements, reference materials, and any confirmed Style Bible supplied in the input into reusable character, location, prop, and reference-asset designs. This Skill uses the union of all still-valid rules from the existing Chinese and English asset prompts so both languages follow the same discipline. Assets may be designed independently when no Style Bible exists. It returns asset design and generation prompts only; it does not generate images or write project state.

## Style-consumption boundary

- When the input supplies a confirmed Style Bible, it is the sole authority for visual style. This Skill consumes its cross-media `visualStyle` and asset-only `assetImageStyle`; it must not redefine project style from one reference image or one asset. Without a Style Bible, the asset identity may still be designed, but the result must state that it is not bound to project style.
- Always put style-free stable asset identity in `stableDescription`, then compose that identity with an actually supplied Style Bible in the creative `generationPrompt` that precedes the execution policy. Never use that generation prompt to rewrite stable identity.
- A stable character identity description excludes artistic style, filters, and lighting; the final image prompt appends them consistently.
- A foundational location description preserves real spatial structure, materials, and physical lighting conditions. Stylized lighting and material treatment are composed with the Style Bible only in the final image prompt.
- The execution layer's sole asset-image format policy appends and enforces the fixed format by asset kind. A `generationPrompt` must not introduce conflicting layout, background, or subject-count requirements.
- These fixed formats govern asset images only; they do not own, override, or constrain video composition. Video framing, scale, camera placement, movement, and editing remain entirely within directing and video design.
- User or project style outranks source-image style. A reference preserves identity and structure and cannot override explicit art direction. Ignore incidental source color cast, lighting, blur, noise, and defects.

## Fixed asset-image formats and execution boundary

- A character asset is one image divided into equal left and right halves: the left half is a face close-up of the character, and the right half shows the same character completely from head to toe. The background is pure white. Only that character may appear; no location, prop, or other person may appear.
- A location asset is a complete panoramic environment seen straight on. It contains no people and no prop presented as an independent asset subject. Fixed structures and built-in elements that constitute the location itself—such as walls, floors, doors, windows, and stairs—remain allowed.
- A prop asset shows exactly one prop, squared to the view and completely visible, on a pure white background. It contains no person, other prop, or location.
- These are asset-kind contracts, not style or composition candidates for a model to choose. The Skill keeps design content compatible with them; the execution policy is the sole writer of exact layout, aspect ratio, and final suffix.

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

- Candidates are different design directions for the same character identity, not different characters.
- Useful emphases include identity and silhouette fidelity, wardrobe/material/era texture, and role energy with video-reference usability.
- Differences must be legible while preserving the shared core identity. Do not manufacture variety by changing age, species, relationship, or plot facts.
- When a Style Bible exists, casting, clothing, palette, material, and atmosphere must remain compatible with it.

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

- Select the single scene most useful for later video reference instead of mechanically repeating the first mentioned place.
- A baseline direction faithfully renders identity, fixed structure, structural anchors, materials, and lighting.
- A narrative-core direction chooses the location that best carries conflict, revelation, reversal, recurring pressure, or emotional turn. Express tension through architecture, negative space, fixed structures, motivated light, color, and material rather than explanatory prose.
- A production-texture direction infers era, genre, class texture, emotional temperature, and subtext, then strengthens spatial structure, surfaces, use traces, practical sources, air, reflections, and shadows. It must not add visual density through people, independent furniture, or prop dressing.
- Every candidate remains an empty, complete, reusable environment. Do not create differences by adding contradictory story facts.

## Prop design

- Describe only the prop's static visible body: primary structure, silhouette, quantity relationships, material, color, surface treatment, pattern, decoration, and wear.
- Do not describe use, plot, character action, people, hands, tables, rooms, background, camera, or atmospheric lighting.
- The design text contains only the single prop itself and remains compatible with the execution policy's fixed prop-asset format.
- A reference image may contribute silhouette, construction, material, pattern, and palette, but not incidental people or background.

## Modifying an existing asset

- First identify the exact visual features requested for change, then replace or add only the relevant material.
- Preserve every unmodified identity, structure, material, color, decoration, and style fact.
- When a reference image is present, absorb only features relevant to the requested change. Do not let the reference overwrite user-approved content or the Style Bible.
- Recheck fluency, internal consistency, era fit, and asset-type boundaries after modification.
- If a location modification adds or removes a major anchor, update spatial structure, depth layers, and placement space accordingly; never let the description collapse into a generic scene.

## Review

- If a confirmed Style Bible was supplied, does the design follow it and clearly separate cross-media style from asset-only lighting and material? If none was supplied, does the result clearly keep style unbound?
- Is the character stable, complete, era-consistent, explicit about footwear, and free of body color, action, background, uncertainty, and abstract aura?
- Is a non-human identity described through its real form rather than a human template?
- Is the location faithful, complete and straight-on, structurally clear, stably anchored, and free of people and independent prop assets?
- Does the prop contain static object information only?
- Do candidates create meaningful variation without changing identity or plot facts?
- Does a modification preserve everything not requested to change?

## Boundary

This Skill provides visual-design methods for characters, locations, props, reference images, asset candidates, and existing-asset modifications. The visual-style Skill owns Style Bibles, style candidates, and style previews. The execution layer's sole asset-image format policy owns image aspect ratio, exact fixed asset-image layout, and final image-prompt suffixes; this Skill does not duplicate the suffix and does not touch directing, shots, or video composition.
