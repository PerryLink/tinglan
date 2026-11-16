# 汀岚（Tinglan）— character definition (DRAFT)

Status: **behavior/voice definition only**；128 Q 精灵、v3 立绘、baked voice、SFX 尚未完成；无 final art/audio。
FCI: `apiVersion: "0.3"`（preview）；运行时尚未消费全部字段（见 `docs/CHARACTER-INTERFACE-V0.3.md`）。

## 预览

无美术行为/语音实验台：[`tinglan-lab.html`](../../../tinglan-lab.html)（`npm run dev` 后访问）。

## 文件

- `character.json` — 16 态/FCI 0.3：voice/idle/zones/responses/moods/focus/schedule/timeOfDay/render。
- `behavior.json` — 行为状态机/规则（voiceLineId、分区事件、priority/cooldown）。
- `voice-lines.json` — 25 条占位台词（文本；无音频）；`voice.tts=false`，待 baked voice。
- 设计依据：[docs/TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md](../../../docs/TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md)。

## 声明

- 角色设计/设定：CC BY-NC-SA 4.0 **DRAFT**（待律师/相似度）；角色名/Logo/商标不授权；非官方、不关联 DeepSeek。
- 当前包**不是** final art；不得把占位/概念图当成品发布。
- 语音/音效：**未生成**；未来 baked TTS 必须披露 AI 生成，禁止真人声音克隆/未授权音源。
- 允许二创/替换动作、声音、形象：读 [docs/modding/](../../../docs/modding/)；必须保留非官方声明、原作者署名、许可与 AI 披露。
- 禁止：冒充官方/抢注商标/真人克隆/恶意代码/未成年人性化/侵权素材。
- 完整声明：[DECLARATIONS.md](../../../DECLARATIONS.md) · [docs/legal/](../../../docs/legal/)。
