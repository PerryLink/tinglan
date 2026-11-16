# 替换 / 新增语音与音效（Voice & SFX）

Status: **作者文档（2026-11-15，DRAFT）**。面向语音包、音效替换、AI 配音披露作者。
相关：[README](README.md) · [REPLACE-ACTIONS](REPLACE-ACTIONS.md) · [VOICE-COMPANION-PLAN](../VOICE-COMPANION-PLAN.md) · [AI-PROVENANCE](../../AI-PROVENANCE.md) · [AI-CONTENT-POLICY](../legal/AI-CONTENT-POLICY.md) · [CHARACTER-INTERFACE-V0.3](../CHARACTER-INTERFACE-V0.3.md)

**运行时现状（别写错）**：

| 能力 | 现状 |
|---|---|
| 预生成语音播放 | 【已实现】`BakedVoiceProvider` 读 `assets/voice/<pack>/manifest.json`，WAV 经 `VoiceService` → `<audio>` 播放；失败依次降级系统 TTS、Mock |
| 字幕 | 【已实现】`VoiceService.onSubtitle(text)`；页面字幕/静音按钮已有 |
| 口型 | 【预留】`VoiceClip.envelope` 只在类型/Mock 中出现，播放侧未消费；实际是 `.talking` CSS 状态按时长开关，`setMouth` 是 no-op；逐字/viseme 口型**未实现** |
| SFX 播放 | 【预留】`speech:"sfx"`、`rule.sfx`、`character.json.sounds` 仅类型/schema 校验，**没有播放管线** |
| FCI 0.3 `audio[]`/`voice`/`sfx` | 【计划 0.3】预览层已实现（schema/TS/CLI 可校验；含 `VOICE_*`/`AUDIO_*`/`SFX_*` 诊断码），**不播放、不合成、不调 TTS/ASR** |
| 用户侧语音包导入 | 暂无 UI；替换目前是开发/打包动作（见 §3） |

## 1. 音频格式（最小可用契约）

- **当前播放通路**：WAV（RIFF/PCM），推荐 **24 kHz / 16-bit / mono**（试点音色即此规格；`wavDurationMs` 依赖 WAV 头）。文件 ≤ 约 2–5 秒/句更稳，单句过长会影响字幕与打断体验。
- **0.3 声明扩展名白名单**：`.ogg` / `.wav` / `.mp3` / `.webm`；路径必须是**包内相对路径**（禁绝对路径、`..`、`http(s)://`、`file://`）。`.ogg` 利于体积，但当前播放器实际只验证了 WAV，替换前请保持 WAV。
- 采样率/位深无硬编码校验；跨平台兼容优先 mono/16-bit。响度在后期统一（避免每句忽大忽小），宿主音量滑块只管总音量。
- 0.3 `audio[]` 元素需如实填 `kind:'sfx'|'voice'|'music'`、`license`、`ai:{status:'none'|'assisted'|'generated',tool?,disclosure?}`、`provenance:{source:'recorded'|'synthesized'|'library'|'generated'|'unknown',...}`；`sha256` 可选（64 hex）。`kind:'voice'` 必须给 `voiceId`。
- 安全：CLI 会对音频路径/声明报 `AUDIO_INVALID`/`AUDIO_PATH`/`AUDIO_HASH_MISMATCH`；文件缺失通常是 warning（`AUDIO_FILE_MISSING`）。

## 2. 命名与清单（当前可用格式）

```jsonc
// assets/voice/<pack>/manifest.json
{
  "voice": "your-pack-name",
  "note": "说明来源/许可/AI 状态；不要写供应商 key",
  "lines": [
    { "id": "hello",   "text": "你来了。",     "file": "hello.wav" },
    { "id": "pat_a",   "text": "再摸一下也可以。", "file": "pat_a.wav" },
    { "id": "idle_a",  "text": "你忙你的，我在这里。", "file": "idle_a.wav" }
  ]
}
```

- `id`：小写、稳定；推荐 `<事件>_<变体>`（`pat_a`、`pat_b`、`idle_a`）或语义名（`morning`/`night`/`return`）。
- `file` 默认 `<id>.wav`；可不同名，但必须真实存在且相对 manifest。
- `text` 是**字幕与匹配键**：台词文本与 `line.text` 精确匹配（前导省略号会被忽略）；改台词必须同步改 text，否则命中不到预生成音频、落到系统 TTS。
- 变体机制：当前播放器**按 `text` 匹配**并按清单顺序取第一条；不会按 `id` 或随机选变体（`variants`/`voice.lineIds` 是 0.3 声明，未接线）。
- 0.3 新增：`voice.lines`（台词库文件路径）、`voice.lineIds`（事件→line id 映射）、`timbre.{presetId,pitch,rate,volume,style}`；**任何 clone/真人音色克隆字段直接拒绝**（`VOICE_CLONE_FORBIDDEN`）。

## 3. 替换语音包（今天怎么做）

1. **本地开发/自带包**：复制 `assets/voice/pet/` → `assets/voice/<your-pack>/`，改 `manifest.json` 的 `voice/note` 与 lines，放同名 WAV。
2. 播放器构造 `new BakedVoiceProvider('/assets/voice/<your-pack>')`（`src/voice/baked.ts` 的默认 base 是 `/assets/voice/pet`）；要在产品里切换，需要宿主接线（当前 pet 页硬编码默认 pack，属于开发改动，不是社区可导入路径）。
3. 完全替换官方默认语音 = 覆盖 `assets/voice/pet/`（**仅限你自己构建/私人构建**；公开发布改默认语音必须走官方审核，见 §6）。
4. 0.3 起，语音可随角色包声明（`audio[]`+`voice`）；在运行时接线前，它只是**可校验的声明**，不会播放。
5. 发布语音包时附 `manifest.json` + 音频 + 许可/AI 声明；建议同时提供 `CREDITS` 片段（TASL）。

## 4. 音量 / 口型 / 字幕

- 音量：宿主有总音量滑块；0.3 `sfx.masterVolume`/`clips.*.volume`/`timbre.volume` 为 0–1（`SFX_INVALID`），未接线前不要指望逐条音量生效。
- 口型：`VoiceClip.envelope?: number[]`（0–1 振幅序列）是**预留字段**（Mock 提供商有示例），当前 main.ts 未消费；实机只是 CSS `.talking` 类按语音时长开关，hero 的 `setMouth` 是 no-op。**不是逐字音素同步**。
- 字幕：`onSubtitle` 输出纯文本；`sanitizeSpeech` 会去代码块/Markdown 符号并截断（默认 120 字符）。作者台词按「1–2 句、≤60 字」写更稳；不要塞 URL/指令。
- 提示音（earcon）/音效：今天请用语音通路变通（短 WAV + 文本为空不推荐），或等 0.3 `sfx` 接线；不要在包里自行 `new Audio()`（包不执行代码）。

## 5. 许可、AI 披露与禁止项（强约束）

- **禁止真人克隆**：不得克隆真人（含本人/配音演员/主播/用户）声音；不得用「像某真人/某角色」作为卖点。`voice` 的 `timbre` 只允许参数化预设（pitch/rate/volume/style），**禁止 clone 类字段**。
- **禁止未授权音源**：动画/游戏/影视台词、他人二创配音、未授权采样库、盗录 ASMR 等都不能用；素材必须自有、CC0/CC BY-NC-SA 等明确允许再分发，或已获书面授权。
- **TTS 生成必须声明**：`ai.status` 如实填 `assisted/generated`，写 `tool` 与 `disclosure`；`provenance.source:'synthesized'`；发布页/About/首启按法域要求做显式标注（中国《标识办法》、EU AI Act §50、Steam 内容调查；以 [LEGAL-STATUS](../LEGAL-STATUS-2026-11-15.md) §6 为准）。
- **供应商条款**：DeepSeek TTS 试点 18 条 WAV 的再分发/商用条款仍在确认（见 NOTICE §4、LEGAL-STATUS R5）；**未确认前不得作为发行语音**，不得声称「官方配音」。
- **听感与内容**：不生成模仿特定真人的音色；不制作惊悚/骚扰/NSFW 语音默认自动播放；默认静音可用、可一键关闭。

## 6. 官方默认语音 vs 二创语音

- 官方默认语音 = `assets/voice/pet/` 与未来官方角色包内声明；**二创不得覆盖官方目录后仍标官方**。
- 二创语音包必须独立 `id`/目录，声明非官方、作者、许可、AI 状态；不得使用官方角色名/Logo 做背书。
- 想把二创语音升级为官方默认：走提交流程（[SECURITY](SECURITY.md) §7 审核 + 权利链核验），不是改文件即生效。

## 7. 校验与测试命令

```bash
npm test                                   # 含 tests/voice.test.ts、tests/voice-baked.test.ts（缓存/预算/降级/字幕/匹配）
node --import tsx scripts/validate-character.mjs <角色目录> --json --strict  # 0.3 audio/voice/sfx 声明校验
node scripts/voice-pilot.mjs               # 默认 dry-run（不联网/不扣费）；不要为验证文档跑 --live
```

0.3 相关错误码：`VOICE_INVALID`、`VOICE_CLONE_FORBIDDEN`、`VOICE_LINES_MISSING`、`VOICE_LINES_INVALID`、`VOICE_LINE_UNKNOWN`、`AUDIO_INVALID`、`AUDIO_PATH`、`AUDIO_HASH_MISMATCH`、`SFX_INVALID`、`SFX_ASSET_UNKNOWN`；warning：`AUDIO_FILE_MISSING`（不因 strict 升级）、`AUDIO_NO_HASH`、`VOICE_PROFILE_MISSING`、`SFX_CLIPS_MISSING`。

## 8. 允许 / 禁止 / 必须保留的声明

**先看许可状态**：官方语音/美术许可仍为 DRAFT；DeepSeek TTS 试点 WAV 的再分发条款未确认（NOTICE §4、LEGAL-STATUS R5）——确认前只能内部使用，不得随包发行或宣称可商用。

**允许**：自己录制/合成/购买授权音源做二创语音包；替换音效；用 TTS 生成并如实披露；在许可允许下再分发语音包（附 manifest、许可、署名）。
**禁止**：真人声音克隆或「像某真人」音色；未授权动画/游戏/影视/他人配音；盗链/远程 URL 音频；隐藏 AI 合成事实；冒充官方配音/官方语音包；用语音包诱导付费/收集隐私。
**必须保留**：非官方声明；作者与许可（TASL + 修改说明）；AI 披露（工具/日期/供应商）；AI 生成音频的隐式/显式标识要求；供应商条款要求的署名/限制；素材原始许可文本。
