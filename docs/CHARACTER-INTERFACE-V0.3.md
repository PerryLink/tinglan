# Famling Character Interface v0.3（可选扩展 · 预览层）

Status: **v0.3 预览接口已实现（2026-11-15，纯增量）**。本文冻结 0.3 的**字段名与结构**，并明确哪些只是「声明/预留」：
- 运行时的**出厂契约仍是 FCI 0.2**（`CHARACTER_API_VERSIONS = ['0.1','0.2']` 未动，v0.2 测试文件未改一行）；0.3 通过 `src/pet/character/v03.ts` 预览层 + 校验 CLI 提供。
- 0.3 新增的语音/音频/待机/交互区/回应/心情/日程**全部只做数据声明与校验**：不合成语音、不播放音频、不做调度、不做点击派发。
- 未接 `pet.html`/`main.ts`；未改 kernel/存档/语音/`hero.ts`；未生成美术或音频；未调外部 API。

Related: [CHARACTER-INTERFACE.md](CHARACTER-INTERFACE.md)（v0.1 基线）· [CHARACTER-INTERFACE-V0.2.md](CHARACTER-INTERFACE-V0.2.md)（**出厂契约**）· [CHARACTER-VALIDATION.md](CHARACTER-VALIDATION.md) · [research/MODDING-CHARACTER-PACKS.md](research/MODDING-CHARACTER-PACKS.md)（二创包研究）· [research/PLUGIN-PLATFORM-ROADMAP.md](research/PLUGIN-PLATFORM-ROADMAP.md) · 作者向二创文档：[modding/README.md](modding/README.md)（动作/声音/形象/行为替换）· 法务与社区声明由另一条线负责：[legal/README.md](legal/README.md)（本文不写法律条款）

---

## 0. 一句话

v0.3 给「汀岚」这类角色预留了**可以先用、可以替换、可以校验**的扩展面：动作（idle 微动作 + 状态类别）、声音（voice/audio/sfx + 台词库）、交互区（zones）、回应（responses）、状态语义（moods/focus/schedule/timeOfDay 接口）与命名空间扩展；**0.1/0.2 文档继续照常加载**，0.3 文档由预览校验器接受。

## 1. 版本策略：为什么 0.2 常量不动

| 层 | 值/位置 | 说明 |
|---|---|---|
| 出厂运行时窗口 | `CHARACTER_API_VERSIONS = ['0.1','0.2']`（`src/pet/character/types.ts`） | **冻结**。v0.2 契约与 17 项 v0.2 测试保持原样 |
| 0.3 预览窗口 | `FCI_V03_API_VERSIONS = ['0.1','0.2','0.3']`（`src/pet/character/v03.ts`） | 校验器与未来宿主显式选用 |
| 0.3 运行时能力版本 | `FCI_V03_RUNTIME_VERSION = '0.3.0'` | `minRuntime` 在 0.3 校验中按它协商 |
| 0.3 文档写法 | `"apiVersion": "0.3"` | 必填；0.3-only 字段出现在 0.1/0.2 文档里会被拒绝 |

- `validateCharacterDocumentV03()` 是 0.3 的校验入口；它对 0.1/0.2 文档**与核心校验完全一致**，对 0.3 文档再做扩展块校验。
- **运行时装载（`loadCharacter`/`CharacterRegistry`）暂时不接受 0.3**：出厂契约仍是 0.2，`loadCharacter('…apiVersion 0.3')` 会按「newer than this runtime」拒绝。这是预期行为，不是 bug；把 0.3 提升为出厂契约是单独任务（见 §9）。
- 为什么不让 0.2 常量直接跳到 0.3：0.3 的语音/调度/音频播放都还没实现，提前写进出厂契约会让 `minRuntime`/apiVersion 语义撒谎；而把 0.3 做成显式预览层，作者/CI 今天就能校验、宿主可以按需 opt-in，0.2 用户完全无感。

## 2. 文档级字段总览（`character.json`）

0.3 只**新增可选块**，0.1/0.2 的字段语义不变：

| 块 | 用途 | 运行时会消费吗 |
|---|---|---|
| `voice` | 声线 profile、TTS 开关、语言、台词库引用、每事件 line id、音色预设 | **否**（仅声明/校验） |
| `audio[]` | 音频资产声明：path/sha256/license/ai/provenance/voiceId | **否**（不播放；文件缺失仅警告） |
| `sfx` | 音效 play 映射：clip → audio 资产 id + 音量/变体/冷却 | **否**（不播放） |
| `idle` | 主待机 + 微动作 variants（tag/state/weight/条件/间隔/优先级/可打断） | **否**（不做调度） |
| `zones[]` | 交互命中区（head/hand/tail/tablet/glasses/body…）矩形/多边形/坐标空间，关联事件/状态 | **否**（不做命中与派发） |
| `responses[]` | 事件 → 台词/音效/表情/时长/能力门 + `when.mood/focus/energy` | **否**（不执行回应） |
| `moods` | 心情目录接口（valence/arousal/emote/state） | **否** |
| `focus` | 专注值接口（范围/默认/衰减/休息态） | **否** |
| `schedule` | 星期×时段 → state/mood 接口 | **否** |
| `timeOfDay` | 时段命名接口（供 `when.timeOfDay` 引用） | **否** |
| `extensions` | 0.3 要求**命名空间键**（含 `.`），`extensionsRequired` 必须能在其中解析 | 数据保留 |
| `behavior.states.*.category` | 状态语义分类（scheduler/UI 提示） | 结构保留 |
| `behavior.rules[]` 新字段 | `voiceLineId`/`sfx`/`emote`/`durationMs`/`requiresAny` + `when.mood/focus/energy` | 仅校验 |

> 0.3 不动帧级动画契约：`tags` 仍是 `frames/fps/loop/offsets/category/priority/next`；新增字段一律是可选的**表现/资源声明**，不是新的动画格式。

## 3. 字段参考

### 3.1 `voice`：声线与台词绑定

```jsonc
"voice": {
  "profile": "voice.tinlan.calm",          // 稳定声线 id（宿主/TTS 预设表解析）
  "tts": true,                              // TTS 开关；默认 false（纯文本）
  "language": "zh-CN",                      // BCP-47-ish
  "provider": "system",                     // none | system | tts（宿主实现，不是包代码）
  "lines": "voice-lines.json",              // 台词库文件（包内相对路径，见 3.2）
  "lineIds": { "pat.head": "pat.1" },       // 每事件默认 line id
  "timbre": {                               // 音色参数：预设式，禁止真人克隆
    "presetId": "tinlan-soft",
    "pitch": 1.05, "rate": 0.95, "volume": 0.7,
    "style": "gentle"
  }
}
```

约束：
- `profile`/`presetId`/`style` 是 id/slug（`^[a-z0-9][a-z0-9._-]{0,63}$`），**没有**任何指向真人录音/声纹的字段。
- `timbre` 数值范围：`pitch`/`rate ∈ [0.25,4]`、`volume ∈ [0,1]`；`timbre` 至少一个参数；键封闭（拼错即报错）。
- `lines` 必须是包内相对路径、`.json`、不得 `..`/绝对路径/协议前缀。
- **禁止真人克隆**：整个文档任意层级出现 `clone*/referenceAudio/voiceSample/speakerEmbedding/voiceModel…` 一类键，0.3 校验直接拒绝（`VOICE_CLONE_FORBIDDEN`）。这是接口级不可协商项，不是许可建议。

### 3.2 台词库 `famling.voice-lines/0.1`

`voice.lines` 指向一个 JSON 文件（建议与 `character.json` 同目录）：

```jsonc
{
  "profile": "famling.voice-lines/0.1",
  "version": "0.1.0",
  "lines": {
    "pat.1": { "text": "……嗯。", "lang": "zh-CN", "audio": "a.voice.pat.1", "durationMs": 800 },
    "pat.hand.1": { "text": "平板先放一下。", "lang": "zh-CN" }
  }
}
```

- 行文本上限 500 字；`audio` 必须引用 `audio[]` 中已声明资产。
- 校验器会解析该文件，并检查 `voice.lineIds`、`responses[].voiceLineId`、`behavior.rules[].voiceLineId` 引用都存在（`VOICE_LINE_UNKNOWN`）。文件缺失是错误 `VOICE_LINES_MISSING`。
- 台词库与 `behavior.speech.lines`（0.1 内联台词）**并存不冲突**：后者是旧式文本表，`voiceLineId` 指向新库。

### 3.3 `audio[]`：音频资产声明

```jsonc
"audio": [
  {
    "id": "a.voice.pat.1",
    "kind": "voice",                          // sfx | voice | music
    "path": "audio/voice/pat_1.ogg",          // 包内相对路径；.ogg/.wav/.mp3/.webm
    "sha256": "…64 lowercase hex…",           // 可选但 release 应固定；文件存在时校验
    "license": "CC0-1.0（占位声明）",          // 人可读/SPDX，非法律结论
    "ai": { "status": "assisted", "tool": "TTS 预设", "disclosure": "…" },
    "provenance": { "source": "synthesized", "creator": "…", "note": "…" },
    "voiceId": "voice.tinlan.calm",           // kind=voice 时必填，且须等于 voice.profile
    "durationMs": 800
  }
]
```

- `kind:"voice"` ⇒ `voiceId` 必填且必须与 `voice.profile` 一致（0.3 一个角色一个声线）。
- 文件**缺失**目前只是 `AUDIO_FILE_MISSING` 警告（音频播放尚未实现，允许先占位）；文件存在时声明了 `sha256` 则强校验（`AUDIO_HASH_MISMATCH` 错误）。
- 路径必须是 POSIX 相对路径（禁绝对/`..`/协议/反斜杠），扩展名白名单。校验器不联网。

### 3.4 `sfx`：音效播放映射

```jsonc
"sfx": {
  "masterVolume": 0.8,
  "clips": {
    "sfx.pat":  { "asset": "a.sfx.pat.1", "variants": ["a.sfx.pat.2"], "volume": 0.7, "cooldownMs": 250, "randomize": true },
    "sfx.tap":  { "asset": "a.sfx.tap.1", "volume": 0.5 }
  }
}
```

- `clips` 里的 asset/variants 必须能在 `audio[]` 中解析（否则 `SFX_INVALID`）。
- 规则里可以写字符串 clip id（`"sfx": "sfx.pat"`）或沿用 0.2 的 `{ "clip": "...", "volume": 0.5 }` 对象。
- 0.3 校验器还会做一层跨引用检查：`responses[].sfx`、规则 `sfx` 的 clip id 必须已声明（`SFX_ASSET_UNKNOWN`）。

### 3.5 `idle`：主待机 + 微动作

```jsonc
"idle": {
  "main": "idle",                            // 主待机状态（须为 behavior.states 中已声明 state）
  "variants": [
    { "state": "look_out", "weight": 3, "intervalMs": [12000, 30000], "priority": 5,
      "interruptible": true, "when": { "mood": { "max": 75 } } },
    { "tag": "idle", "weight": 2, "intervalMs": [8000, 15000], "priority": 1, "interruptible": false }
  ]
}
```

- variant 必须**恰好**声明 `state` 或 `tag` 之一；`state` 须已声明，`tag` 由 CLI 做美术覆盖检查（`IDLE_TAG_MISSING`，strict 为 error）。
- `weight` 0–10000；`intervalMs` 为整数 `[min,max]` 且 `max>=min`；`priority` 0–100；`interruptible` 布尔；`when` 见 §3.7。
- 运行时目前仍走 0.2 的 `ambient` 加权选择；`idle` 只是**声明**，不会被调度。

### 3.6 `zones[]`：交互命中区

```jsonc
"zones": [
  { "id": "head",   "role": "head",   "space": "canvas",
    "shape": { "type": "rect", "x": 18, "y": 6, "w": 60, "h": 30 },
    "on": "pat.head", "state": "pat", "cursor": "pointer", "label": "head" },
  { "id": "tail",   "role": "tail",   "space": "normalized",
    "shape": { "type": "polygon", "points": [[0.62,0.58],[0.95,0.66],[0.9,0.95],[0.66,0.86]] },
    "on": "pat.tail", "state": "pat_tail" },
  { "id": "tablet", "role": "tablet", "space": "anchor",
    "shape": { "type": "rect", "x": -14, "y": -72, "w": 28, "h": 34 },
    "on": "pat.tablet", "state": "pat_hand" }
]
```

| 字段 | 说明 |
|---|---|
| `role` | `head`/`hand`/`tail`/`tablet`/`glasses`/`body`/`other`（语义提示，不是唯一 id） |
| `space` | `canvas`（画布像素，原点左上）/ `anchor`（相对 `anchor` 的像素，与 `footBox` 同帧）/ `normalized`（0..1 画布比例） |
| `shape` | `rect{x,y,w,h}`（w/h>0）或 `polygon{points:[[x,y]…]}`（3–32 点） |
| `on` | 命中后由宿主发出的事件名（宿主事件词表；如 `pat.head`） |
| `state` | 可选：命中时展示的 behavior state |
| `cursor` | `default`/`pointer`/`grab`/`help`（UI 提示） |
| `label` | ≤32 字展示标签（UI 负责转义） |

- 坐标越界：`canvas` 空间必须落在 `canvas` 内；`normalized` 必须在 0..1；`anchor` 允许落在画布外（挂件/拖拽目标）。错误码 `ZONE_OUT_OF_BOUNDS`。
- zone id 唯一；`on` 没有对应 rule/slot 时 CLI 只给 `ZONE_EVENT_UNHANDLED` info（声明与宿主派发解耦）。

### 3.7 `responses[]`：表现层回应

```jsonc
"responses": [
  {
    "on": ["pat.head", "pat.body"],
    "when": {
      "state": ["idle", "talk"],
      "mood": { "min": 20 },                  // 数值区间 {min?,max?}，0..100 约定
      "focus": { "max": 80 },
      "energy": { "min": 10 },
      "timeOfDay": ["work"]                    // 引用 timeOfDay.periods id
    },
    "voiceLineId": "pat.1",
    "sfx": "sfx.pat",
    "emote": "pat",                            // 引用动画 tag（可走 fallback）
    "durationMs": 900,
    "requiresAny": ["ability.speech"],         // 宿主能力 id；至少一个满足才执行
    "priority": 50
  }
]
```

- `when` 是**选择条件**，不改变状态机；`requiresAny` 是宿主能力门（能力词表由宿主定义，包不得自造语义）。
- `emote` 缺美术时报 `EMOTE_TAG_MISSING`（非 strict 警告，strict 错误）；有 `fallback` 链则 info `EMOTE_FALLBACK`。
- `durationMs` 0–600000；`priority` 0–100；`on` 支持字符串或数组（1–8）。

### 3.8 `moods` / `focus` / `schedule` / `timeOfDay`（只做接口）

```jsonc
"moods": {
  "default": "calm",
  "defs": {
    "calm":    { "label": "平静", "valence": 0.2, "arousal": 0.3, "emote": "idle", "state": "idle" },
    "focused": { "label": "专注", "valence": 0.3, "arousal": 0.5, "emote": "talk", "state": "focus" }
  }
},
"focus": { "default": 60, "min": 0, "max": 100, "decayPerHour": 3, "restingState": "idle" },
"schedule": {
  "segments": [
    { "id": "work", "days": ["mon","tue","wed","thu","fri"], "from": "09:00", "to": "18:00", "state": "focus", "mood": "focused" },
    { "id": "evening", "from": "18:00", "to": "23:00", "state": "idle", "mood": "calm" }
  ]
},
"timeOfDay": {
  "periods": [
    { "id": "morning",  "from": "06:00", "to": "09:00" },
    { "id": "work",     "from": "09:00", "to": "18:00" },
    { "id": "evening",  "from": "18:00", "to": "23:00" }
  ]
}
```

- 只校验结构与引用：`from < to`、`HH:MM`、同集合内不重叠、state/mood 引用存在；**不做**跨午夜 wrap。
- `when.timeOfDay` 引用 `timeOfDay.periods`；`schedule.segments[].mood` 引用 `moods.defs`；`state` 引用 `behavior.states`。
- **运行时不做**心情衰减、专注衰减、时段切换、日程推进；这些字段是给未来宿主/插件的接口预留。

### 3.9 `extensions` 命名空间

0.3 起 `extensions` 的键必须是**带点命名空间**（如 `x.famling.fork`、`x.someone.skin`），`extensionsRequired` 里的每个键都必须已在 `extensions` 声明。

```jsonc
"extensions": {
  "x.famling.fork": { "id": "famling.humanoid-default", "version": "0.1.0" },
  "x.famling.preview": { "reason": "interface demo" }
},
"extensionsRequired": ["x.famling.fork"]
```

- 数据性规则不变（任意层级禁止 `script/scripts/eval/code/execute/permissions`）。
- 0.3 仍**不实现**「不认识 `extensionsRequired` 就拒载」的宿主扩展注册表（见 §9）。

### 3.10 `behavior` 0.3 增量（仍 `famling.behavior/0.1`）

行为档协议号**不变**，只加可选字段：

```jsonc
"states": {
  "idle": { "tag": "idle", "loop": true, "category": "idle" },
  "pat":  { "tag": "pat", "priority": 50, "after": "idle", "category": "reaction" }
},
"rules": [{
  "on": "pat.head", "to": "pat",
  "voiceLineId": "pat.1", "sfx": "sfx.pat", "emote": "pat", "durationMs": 900,
  "requiresAny": ["ability.speech"],
  "when": { "state": ["idle"], "mood": { "min": 0 }, "focus": { "max": 80 } }
}]
```

- `states.*.category ∈ {idle, micro-idle, reaction, expression, locomotion, interaction, sleep, fx}`（新）。
- `states.*.interrupt/after/cooldownMs/timeoutMs` 是 0.1 已有字段，0.3 文档化并纳入闭合白名单。
- `rules[]` 新可选：`voiceLineId`、`sfx`（字符串 clip id 或 0.2 对象形式）、`emote`、`durationMs`、`requiresAny`；`when` 新可选 `mood/focus/energy` 区间。
- 0.3 校验器对 behavior 做**键白名单**（state/rule/when 的未知键直接报错），但 `famling.behavior/0.1` 的 0.2 路径不变。

## 4. 校验：TS / CLI / Schema

### 4.1 TS 预览 API（`src/pet/character/v03.ts`，由 `character/index.ts` 导出）

```ts
import {
  CHARACTER_API_VERSION,                  // '0.2'（出厂契约，冻结）
  FCI_V03_API_VERSION,                    // '0.3'
  FCI_V03_API_VERSIONS,                   // ['0.1','0.2','0.3']
  FCI_V03_RUNTIME_VERSION,                // '0.3.0'
  validateCharacterDocumentV03,
  validateCharacterDocumentV03Detailed,
  validateBehaviorProfileV03,
  validateVoiceLineLibrary,
  FciV03Error,
} from './src/pet/character/index.ts'

const { document, warnings } = validateCharacterDocumentV03Detailed(characterJson, {
  behavior: behaviorJson,           // inline behavior 可省略；behaviorFile 由调用方加载后传入
  renderFormats: ['pixel-hero'],    // 宿主已注册渲染格式
})
if (document.voice) { /* 声明可读，但不要在这里合成语音 */ }
```

- 0.3 块错误抛 `FciV03Error`（继承 `CharacterInterfaceError`），带稳定 `code` + `path`（如 `ZONE_OUT_OF_BOUNDS`、`VOICE_CLONE_FORBIDDEN`）；纯数据校验，无 fs/网络/代码执行 —— 台词库/音频文件的存在性与 sha256 由 CLI 负责。
- 0.1/0.2 文档经 `validateCharacterDocumentV03()` 结果与核心校验一致；0.3-only 字段出现在旧文档会抛 `FCI03_FIELD_REQUIRES_0_3`。

### 4.2 CLI（`scripts/validate-character.mjs`）

```bash
# 0.3 fixture（--json --strict）
node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v03/tinlan-v03 --json --strict

# 0.1/0.2/0.3 混合一次校验
node --import tsx scripts/validate-character.mjs public/characters/humanoid-default tests/fixtures/fci-v02/humanoid-v02 tests/fixtures/fci-v03/tinlan-v03 --json --strict
```

- Schema **按 `apiVersion` 自动路由**：0.1→`character-0.1`、0.2→`character-0.2`、0.3→`character-0.3`（新增）。
- `--json` 顶层：历史字段 `apiVersion`（=出厂运行时契约 `0.2`）与 `supportedApiVersions`（=运行时可直接加载窗口 `['0.1','0.2']`）保持不变；新增 `schemaApiVersions`（`['0.1','0.2','0.3']`，schema 路由覆盖）与 `previewApiVersions`（`['0.3']`）。
- 每个 target 的 `checks` 新增（仅 0.3）：`fci03`（声线/音频/zone/idle/回应/心情/日程计数）、`audio`（declared/present/missing/hashMismatch/paths）、`voice`（profile/tts/lines/refs/missing）、`voiceLines`、`fci03Tags`。
- `--strict` 的 0.3 附加规则：缺 `render.format` 是错误；`emote`/idle tag 缺美术是错误（0.2 的 tag/license/ai 规则不变）。**音频文件缺失始终只是警告**（播放未实现）。
- 失败退出码仍为 `0/1/2`。

主要 0.3 诊断码：

| 码 | 含义 |
|---|---|
| `FCI03_FIELD_REQUIRES_0_3` | 旧 apiVersion 文档里出现 0.3-only 字段（含 behaviorFile 增量） |
| `VOICE_INVALID` / `VOICE_CLONE_FORBIDDEN` | 声线块结构错误 / 真人克隆字段（不可协商） |
| `VOICE_LINES_MISSING` / `VOICE_LINES_INVALID` / `VOICE_LINE_UNKNOWN` | 台词库缺失/结构错误/引用不存在的 line id |
| `AUDIO_INVALID` / `AUDIO_PATH` / `AUDIO_FILE_MISSING`(warn) / `AUDIO_HASH_MISMATCH` | 音频声明/路径/文件/哈希 |
| `SFX_INVALID` / `SFX_ASSET_UNKNOWN` / `SFX_CLIPS_MISSING`(warn) | 音效映射错误 |
| `IDLE_INVALID` / `WHEN_INVALID` / `IDLE_TAG_MISSING` | 待机块/条件/美术 tag |
| `ZONE_INVALID` / `ZONE_OUT_OF_BOUNDS` | 交互区结构/越界 |
| `RESPONSE_INVALID` / `EMOTE_TAG_MISSING` | 回应结构/表情 tag |
| `MOODS_INVALID` / `FOCUS_INVALID` / `SCHEDULE_INVALID` / `TIMEOFDAY_INVALID` | 接口块结构/引用 |
| `EXTENSION_NAMESPACE` / `EXTENSION_REQUIRED_UNKNOWN` / `EXTENSION_INVALID` | 扩展命名空间 |
| `BEHAVIOR_INVALID` / `RUNTIME_INVALID` / `SCHEMA_INVALID` | 沿用 0.1/0.2 的失败归类 |

非阻塞警告（0.3 专属）：`AUDIO_FILE_MISSING`（音频文件缺失，播放未实现，始终是 warning）、`AUDIO_NO_HASH`（音频没声明 sha256）、`VOICE_PROFILE_MISSING`（有 voiceLineId 引用但没 voice 块）、`SFX_CLIPS_MISSING`（有 sfx 引用但没 sfx.clips）、`EMOTE_TAG_MISSING`/`IDLE_TAG_MISSING`（strict 下升级为 error）、`VOICE_TTS_WITHOUT_SPEECH`（tts 打开但 abilities.speech 不是 voice）、`FCI03_CROSSREFS_SKIPPED`（调用 `validateCharacterDocumentV03` 时没传已加载的 behavior，跨引用未检查 —— 宿主应传入 `{ behavior }`）。info 级提示：`EMOTE_FALLBACK`、`IDLE_TAG_FALLBACK`、`ZONE_EVENT_UNHANDLED`。

### 4.3 JSON Schema

`content/schema/character-0.3.schema.json`（新增，`apiVersion.const = "0.3"`）是 0.2 schema 的**超集增量**：新增 10 个文档块定义 + `behaviorState.category` + `behaviorRule` 表现字段 + `when.mood/focus/energy`；`audio/voice/timbre/provenance` 等块内 `propertyNames` 拒绝克隆类键。0.1/0.2 schema **未改**（仍是 0.1/0.2 的 `const`，不接受 0.3 文档）。

## 5. 二创替换点（作者/社区视角）

> 下表的「可覆盖」指**同一角色/皮肤数据包内可替换的字段**；跨角色二创必须使用**新 id**（见 §5.2）。运行时安全边界不变：角色包永远是纯数据，社区不得分发代码。

### 5.1 只读 vs 可覆盖

| 类别 | 只读（宿主/契约强制） | 可覆盖（0.3 数据替换点） |
|---|---|---|
| 身份 | `spec`、`id`（全局唯一，fork 必须新 id）、`version`（semver 只递增）、`apiVersion`（用 0.3 字段必须 `0.3`） | `species`/`traits`/`meta`（自由描述）、`extensions` 命名空间（记录 fork 链） |
| 画布/渲染契约 | `canvas`、`anchor`、`footBox`（须与美术包几何一致）、`render.format` 必须是已注册格式 | `packBase`（换兼容美术包）、内联 `tags`、`palette`、`display`、`render.params`、`fallback` |
| 行为核心 | state/rules/slots/ambient 的**语义**由宿主解释；`famling.behavior/0.1` 协议号；事件词表由宿主定义 | behavior 数据本身（states/rules/slots/ambient/priority/cooldown）、`states.category`、`idle`、`responses`、`moods/focus/schedule/timeOfDay`（接口） |
| 声音 | 克隆/冒充真人的字段（永久禁止）；`audio.path` 必须在包内；`kind:"voice"` 必须匹配 `voice.profile` | `voice.profile`/`tts`/`language`/`provider`/`timbre`、`voice.lines` + `lineIds`、`audio[]`（换文件/换许可声明）、`sfx.clips` |
| 交互/UI | 同一 `id` 的 `canvas/anchor` 不改；数据性/克隆/许可字段不可绕过校验 | `zones[]`（几何/role/cursor/label）、`responses[]`（emote/durationMs/priority/requiresAny）、`display` |
| 素材字段 | `script/scripts/eval/code/execute/permissions` 任意层级禁止 | `assets`、`packBase`、`tags`、`audio[]`、`voice.lines` |

### 5.2 DLC / 二创包怎么做

**步骤（数据包，无需改 TS）：**

1. 复制基础角色目录，改 `id`（新全局唯一 id）与 `version`（从 `0.0.0`/`1.0.0` 起）；
2. 在 `extensions` 里用命名空间记录来源（约定示例：`"x.famling.fork": { "id": "原角色 id", "version": "原版本" }`；宿主不会执行这条语义，但校验会保留它）；
3. 只改你要替换的块（见 §5.3 示例），其余保持或删掉；
4. 跑 `node --import tsx scripts/validate-character.mjs <dir> --json --strict`；
5. 用官方模板/索引签名流程分发（签名、许可、AI 披露、审核与法务声明在另一条线： [legal/README.md](legal/README.md)）。

**插件边界（0.3 不开新口子）：**

- **渲染器插件仍是第一方**：render API 1.2 契约不变，`RendererOrigin` 仍只有 `first-party`；社区不能随包分发渲染器代码，只能选择宿主已注册的 `render.format`。
- **TTS/音频播放器是宿主能力**：`voice.provider`/`sfx` 只声明数据；供应商/播放器由宿主实现，角色包不携带 JS/WASM/原生库。
- **`audio[]` 的 `license/ai/provenance` 是声明字段**，用于未来分发/审核流程；校验器只保证字段存在与形状，不对声明真实性背书（法务/审核由另一条线负责）。
- 0.3 里的 `moods/focus/schedule/timeOfDay` 不会与未来的签名 DLC 外壳（`manifest.contentApi/minBase/sha256`，见 `packs/` 与 [modding/COMPATIBILITY-AND-VERSIONING.md](modding/COMPATIBILITY-AND-VERSIONING.md)）混用：外壳管分发完整性，FCI 管文档结构。

### 5.3 典型替换示例

| 二创目标 | 改哪些字段 | 注意 |
|---|---|---|
| 换皮肤/换美术 | `packBase` 或内联 `tags`/`assets`、`palette`、`display`、`fallback` | 新美术包必须与 `canvas/anchor/footBox` 几何一致（校验器查 canvas，warning 查 anchor/footBox/palette） |
| 换声音（同人声线） | `voice.profile`、`voice.timbre`、`voice.lines`、`audio[]`、`sfx`、规则/回应里的 `voiceLineId`/`sfx` | 只能换预设/合成声明；克隆真人字段会被拒 |
| 换台词/本地化 | `voice.lines` 文件 + `voice.lineIds`；旧式文本可继续放 `behavior.speech.lines` | 引用不存在 line id → `VOICE_LINE_UNKNOWN` |
| 加微动作/待机 | behavior `states` + `idle.variants`（复用现有 tag 或新 tag + 美术） | `idle.main` 必须是已声明 state；tag 缺美术 strict 报错 |
| 改触摸分区 | `zones[]` 的 geometry/role/on/state + 对应 `responses[]` | 事件要有宿主派发者，否则只有声明价值（`ZONE_EVENT_UNHANDLED` info） |
| 改回应话术/表情 | `responses[]` 的 `voiceLineId/sfx/emote/durationMs/priority/when/requiresAny` | `emote` 引用动画 tag，遵守 fallback |
| 加 UI 提示 | `zones[].cursor/label`、`display` | label 由 UI 转义，≤32 字 |
| 加自有元数据 | `extensions["x.<author>.<name>"]` | 键必须命名空间化；不得夹带脚本 |

## 6. 迁移

### 6.1 0.2 → 0.3

1. `apiVersion` 改 `"0.3"`；若打算使用 0.3 字段，建议 `minRuntime: "0.3.0"`（0.2 运行时会因此拒载，这是预期）；
2. 按需加块：先 `voice`/`audio`/`sfx`，再 `idle`/`zones`/`responses`，最后 `moods`/`focus`/`schedule`/`timeOfDay`；
3. behavior 里给 states 补 `category`、给 rules 补 `voiceLineId/sfx/emote/durationMs/requiresAny`（都是可选）；
4. 运行 `node --import tsx scripts/validate-character.mjs <dir> --json --strict`；
5. 若 `voice.lines` 已声明：确保台词库文件随包、引用 id 全部存在。

### 6.2 0.1 → 0.3

先按 v0.2 迁移补 `render.format`（见 [CHARACTER-INTERFACE-V0.2.md §6](CHARACTER-INTERFACE-V0.2.md)），再做 §6.1。

### 6.3 不迁移

0.1/0.2 文档在新校验器与 0.2 运行时下行为完全不变；0.3 是**可选**扩展。反向不保证：0.3 文档在 0.2 运行时会被拒载（`newer than this runtime`，需 0.3 预览宿主/升级）。

## 7. 兼容矩阵

| 文档 | 0.2 运行时 | 0.3 预览校验器/CLI | 未来 0.3 运行时 |
|---|---|---|---|
| 0.1 | 加载 | 通过（原样返回） | 加载 |
| 0.2 | 加载 | 通过（原样返回；0.3-only 字段会被拒） | 加载 |
| 0.3 + 合法块 | **拒载**（apiVersion 更新） | 通过（schema/runtime/CLI 三层） | 加载（待 promote） |
| 0.3 + 未知块/坏引用 | 拒载 | 各级报错（见 §4.2 码表） | 拒载 |
| 0.2 文档 + 0.3-only 字段 | 运行时忽略（schema 拒） | `FCI03_FIELD_REQUIRES_0_3`（TS/behaviorFile 路径）或 schema 报错 | 拒载/忽略（按 schema） |

## 8. 实现位置与测试证据

| 文件 | 变更 |
|---|---|
| `src/pet/character/v03.ts` | **新增**：0.3 类型、块校验、`FciV03Error`、台词库校验、引用收集器 |
| `src/pet/character/validate.ts` | `negotiateCharacterApiVersion()` 支持显式窗口参数；`render` 推断对 0.1 以上版本生效（0.2 行为不变） |
| `src/pet/character/types.ts` | `CharacterValidationOptions.apiVersions`（默认仍冻结 0.1/0.2） |
| `src/pet/character/index.ts` | 导出 0.3 预览 API |
| `content/schema/character-0.3.schema.json` | **新增**；0.1/0.2 schema 未改 |
| `scripts/validate-character.mjs` | 0.3 schema 路由、预览校验、audio/voice-lines/sfx/emote/tag 检查、payload 新字段、错误码映射 |
| `tests/fci-v03.test.ts` + `tests/fixtures/fci-v03/tinlan-v03/*` | **新增** 23 项测试 + 汀岚 0.3 fixture（`character.json`/`behavior.json`/`voice-lines.json`） |
| `docs/CHARACTER-INTERFACE-V0.3.md` | 本文 |

证据（2026-11-15）：`npm test` 全绿（244 项既有 + 23 项新增）；`npx tsc --noEmit` 通过；`npm run preflight` 通过（含 `fci:validate`）；v0.2 测试文件与 `public/characters/**` **未改动**；0.1/0.2/0.3 混合 CLI `--strict` 0 error。

## 9. 未实现 / 下一步（边界）

1. **0.3 运行时 promote**：把 `CHARACTER_API_VERSIONS`/`CHARACTER_RUNTIME_VERSION` 升到 0.3、`loadCharacter` 接受 0.3、更新 v0.2 测试的版本断言 —— 需要单独任务与发布说明，本次刻意不做（保持 0.2 测试冻结）。
2. **调度**：`idle` 微动作调度、`moods`/`focus` 衰减、`schedule`/`timeOfDay` 时钟切换都未实现；运行时仍走 0.2 `ambient`。
3. **声音**：不合成 TTS、不播放音频、不校验音频时长/响度/格式内部合法性（只验扩展名/路径/文件存在与 sha256）；音频文件缺失仅是警告。
4. **交互**：`zones` 不做 alpha/几何命中测试，也不派发事件；`responses` 不执行。
5. **数值/存档**：mood/focus/energy 不进入存档，不参与 `guard`。
6. **`extensionsRequired` 拒载语义**：字段保留，但「不认识就拒载」的宿主扩展注册表未实现（需要签名/信任链）。
7. **签名/哈希/分发**：`audio[].sha256` 只是声明；角色包外壳签名/manifest 是另一套系统（见 [modding/COMPATIBILITY-AND-VERSIONING.md](modding/COMPATIBILITY-AND-VERSIONING.md)）。
8. **CI**：0.3 fixture 未接 `.github/workflows/ci.yml`（由发布工程线处理）。
9. **默认角色升级**：`public/characters/**` 仍 0.1；0.3 fixture 只存在于 `tests/`。

## 10. 相关文档

- v0.1 基线：[CHARACTER-INTERFACE.md](CHARACTER-INTERFACE.md)
- **出厂契约**：[CHARACTER-INTERFACE-V0.2.md](CHARACTER-INTERFACE-V0.2.md)
- 校验与错误码：[CHARACTER-VALIDATION.md](CHARACTER-VALIDATION.md)
- 二创包研究：[research/MODDING-CHARACTER-PACKS.md](research/MODDING-CHARACTER-PACKS.md)；作者向操作文档：[modding/README.md](modding/README.md)（[替换动作](modding/REPLACE-ACTIONS.md) / [替换声音](modding/REPLACE-VOICE-AND-SFX.md) / [替换形象](modding/REPLACE-ART-AND-CHARACTER.md) / [增加行为](modding/ADD-BEHAVIOR.md) / [兼容性](modding/COMPATIBILITY-AND-VERSIONING.md)）
- 生态路线：[research/PLUGIN-PLATFORM-ROADMAP.md](research/PLUGIN-PLATFORM-ROADMAP.md)
- 法务/社区声明（另一条线）：[legal/README.md](legal/README.md)

## 8. 已实现的运行时消费层（2026-11-15）

FCI 0.3 声明层之外，新增了**无渲染行为/交互引擎**，供页面/场景后续接线：

- `src/pet/character/runtime03.ts` — `CharacterRuntime03`
  - `hitZone(x,y)` / `zoneEventAt()`：normalized/canvas/anchor 坐标，重叠区取最小面积（眼镜优先于头）；
  - `dispatch(event,ctx)`：rule priority / interrupt / after / timeout / cooldown / probability / `when` / `requiresBrief`；
  - `pickIdle(ctx)` / `tick(ctx)`：`idle.variants` 权重、时段/状态条件、最近 2 次防重复、全局间隔；
  - `responseFor()` / `speakFor()`：`responses[]` 优先级 + `voiceLineId`/`emote`/`sfx`；
  - `gateSpeech(level,lineId,ctx)`：L0–L3、mute、focus/drag/sleep/talk 静默、6s/20s gap、60s/1h/day 配额、同句 10min 去重；
  - `snapshot/restore`。
- `loadCharacterV03(dir, fetcher)` — 加载 document + behavior + voice-lines；与 `loadCharacter()`（0.1/0.2 出厂路径）分离，0.3 不会被静默当作出厂包。
- 测试：`tests/runtime03.test.ts` 8 项；汀岚真实包：16 states / 12 idle / 6 zones / 25 lines 全部过校验。
- **边界**：仍不渲染、不播放音频、不接 `pet.html`/`main.ts`；Tinglan 的 128 Q 美术/baked voice 未完成，因此页面暂不能选择 `?character=tinglan`。
- 下一步接线：`HeroRuntime` 在 0.3 pack 到位后使用 `CharacterRuntime03` 的状态/分区/语音决策，渲染仍走 `RenderBackend`；本层已为此留出纯函数 API。
