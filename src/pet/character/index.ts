/**
 * Famling Character Interface (FCI) — data-only character/pet extensibility layer.
 *
 * This module is additive: it never executes pack code and does not replace the
 * existing `hero.ts` renderer or touch kernel/save/voice. v0.2 adds optional
 * renderer selection (`render`), runtime version negotiation (`apiVersion` /
 * `minRuntime`) and render-format registration hooks while still loading v0.1
 * documents. v0.3 is an opt-in **preview layer** (`v03.ts`) that adds optional
 * voice/audio/idle/zones/responses/moods/schedule interfaces while the shipping
 * runtime contract stays frozen at 0.2. See docs/CHARACTER-INTERFACE.md (v0.1
 * baseline), docs/CHARACTER-INTERFACE-V0.2.md (shipping contract) and
 * docs/CHARACTER-INTERFACE-V0.3.md (optional extensions).
 */
export {
  CHARACTER_API_VERSION,
  CHARACTER_API_MIN_VERSION,
  CHARACTER_API_VERSIONS,
  CHARACTER_RUNTIME_VERSION,
  KNOWN_RENDER_FORMATS,
  BEHAVIOR_PROFILE,
  CharacterInterfaceError,
  type AnimCategory,
  type BehaviorDecision,
  type BehaviorProfile,
  type BehaviorRule,
  type BehaviorState,
  type CharacterApiVersion,
  type CharacterDocument,
  type CharacterRenderSpec,
  type CharacterTag,
  type CharacterType,
  type CharacterValidationOptions,
  type CharacterValidationResult,
  type CharacterValidationWarning,
  type Guard,
  type InterruptMode,
  type KnownRenderFormat,
  type RenderFormatResolution,
  type SpeechMode,
} from './types.ts'
export {
  compareSemver,
  inferRenderFormat,
  isRuntimeVersionSatisfied,
  legacyManifestToCharacter,
  negotiateCharacterApiVersion,
  resolveRenderFormat,
  validateBehaviorProfile,
  validateCharacterDocument,
  validateCharacterDocumentDetailed,
  type CharacterApiVersionNegotiation,
} from './validate.ts'
export { BehaviorRuntime, mulberry32, requiredTags, missingTags, type BehaviorRuntimeOptions, type DecisionContext } from './behavior.ts'
export { CharacterRegistry, loadCharacter, loadCharacterV03, registerLegacyManifest, resolveFallbackTag, type LoadedCharacter, type LoadedCharacterV03 } from './registry.ts'
export { Actor, Scene, type ActorInit, type SceneEmission } from './scene.ts'
// FCI 0.3 preview layer (optional extensions; the shipping runtime contract
// stays frozen at 0.2 until the version-promotion task flips the constants).
export {
  FCI_V03_API_VERSION,
  FCI_V03_API_VERSIONS,
  FCI_V03_RUNTIME_VERSION,
  FCI_V03_ONLY_FIELDS,
  VOICE_LINES_PROFILE,
  STATE_CATEGORIES,
  ZONE_ROLES,
  ZONE_SPACES,
  ZONE_CURSORS,
  AUDIO_KINDS,
  AUDIO_AI_STATUSES,
  AUDIO_PROVENANCE_SOURCES,
  AUDIO_FILE_EXTENSIONS,
  WEEKDAYS,
  collectFci03Emotes,
  collectFci03IdleTags,
  collectFci03SfxRefs,
  collectFci03VoiceLineRefs,
  findFci03BehaviorFields,
  validateAudioAssets,
  validateBehaviorProfileV03,
  validateCharacterDocumentV03,
  validateCharacterDocumentV03Detailed,
  validateVoiceLineLibrary,
  FciV03Error,
  type AudioAiDisclosure,
  type AudioAsset,
  type AudioAssetsValidation,
  type AudioKind,
  type AudioProvenance,
  type BehaviorProfileV03,
  type BehaviorProfileV03Options,
  type BehaviorRuleV03,
  type BehaviorStateV03,
  type CharacterApiVersionV03,
  type CharacterDocumentV03,
  type CharacterDocumentV03Options,
  type Fci03Reference,
  type FciV03OnlyField,
  type FocusSpec,
  type IdleSpec,
  type IdleVariant,
  type MoodDefinition,
  type MoodsSpec,
  type NumericRange,
  type ResponseCondition,
  type ResponseSpec,
  type RuleConditionV03,
  type RuleSfx,
  type ScheduleSegment,
  type ScheduleSpec,
  type SfxClip,
  type SfxSpec,
  type StateCategory,
  type TimeOfDayPeriod,
  type TimeOfDaySpec,
  type VoiceLineEntry,
  type VoiceLineLibrary,
  type VoiceLineLibraryOptions,
  type VoiceSpec,
  type VoiceTimbre,
  type Weekday,
  type ZoneCursor,
  type ZonePolygonShape,
  type ZoneRectShape,
  type ZoneRole,
  type ZoneShape,
  type ZoneSpace,
  type ZoneSpec,
} from './v03.ts'

export { CharacterRuntime03, periodIdAt, type CharacterRuntime03Options, type RuntimeContext, type RuntimeDecision, type RuntimeLevel, type VoiceGateResult } from './runtime03.ts'
