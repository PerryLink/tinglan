# 二创声明模板（开发者可复制版）

Status: **模板 DRAFT（2026-11-15）**。本文件给**开发者**可复制填写的字段与声明块；
**法律效力文本以 [docs/legal/DECLARATION-TEMPLATES/](../legal/DECLARATION-TEMPLATES/README.md) 与 [TEMPLATES.md](../legal/DECLARATION-TEMPLATES/TEMPLATES.md) 为准**，两者冲突时以 legal 为准。
**重要**：在 legal 模板经律师定稿前，本文件仅用于**内部准备与私有测试**，不得把模板原文当作正式对外声明发布；正式发布用 legal 版本。当前 `LICENSE-ART` 仍为 DRAFT（官方美术按保留所有权利处理），Orca/汀岚 的相似度与名称未清，公开/商用前先看 [FANWORK-POLICY](../legal/FANWORK-POLICY.md) §1 与 [LEGAL-STATUS](../LEGAL-STATUS-2026-11-15.md) §8 Gate。法务总则见 [FANWORK-POLICY](../legal/FANWORK-POLICY.md)、[ASSET-REPLACEMENT-AND-MODDING-POLICY](../legal/ASSET-REPLACEMENT-AND-MODDING-POLICY.md)、[AI-CONTENT-POLICY](../legal/AI-CONTENT-POLICY.md)、[TRADEMARK-AND-NAMING-POLICY](../legal/TRADEMARK-AND-NAMING-POLICY.md)。
场景→该贴哪份声明：[DECLARATION-MATRIX](../legal/DECLARATION-MATRIX.md)。标准非官方表述以 [NOTICE](../../NOTICE) §7 为准。

## 0. 使用规则（先读）

1. 每个发布物 = **1 份主模板（A–E）** + **4 个通用块**（§1：署名 / 非官方 / 许可 / AI 披露）。
2. 声明放在**用户能看到的最近处**：包内 `DECLARATION.txt`/`README.md`、角色包 About、下载页、视频简介；机读字段进 `character.json`/`pack manifest`/`audio[]`。
3. 不知道就写 `unknown` 并停下，**不要编造许可、作者、AI 状态**；未清权利的素材不得进发布包。
4. 模板里的 `<...>` 必须替换；`[...]` 是选择项；删除不适用行，不要留空占位。

## 1. 通用块（每个发布物都要有）

**① 署名块（TASL + Mod + AI，参考 [CREDITS](../../CREDITS.md) §3）**

```text
Title: <作品/角色名> | Author: <作者/团队> | Source: <原始链接或"原创"> |
License: <SPDX，如 CC-BY-NC-SA-4.0> (<许可 URL>) | Modified: <是/否 + 改了什么> |
AI: <none | assisted | generated；工具/模型、日期、供应方> | Based on: <原角色/原作者/许可，可无>
```

**② 非官方声明块（必须随发布物，中英各一行）**

```text
本作品为二创/非官方项目，与 PerryLink 及 DeepSeek（深度求索）无任何关联、合作、授权或背书关系；
不使用官方 Logo、字标或官方鲸鱼娘形象。角色「汀岚 / Tinglan」相关权利归其权利人，本作品不主张其名称/商标。
This is an unofficial fan project. Not affiliated with, endorsed by, or authorized by PerryLink or DeepSeek.
```

**③ 许可块**

```text
License: <SPDX-ID> — <canonical URL>；完整文本见 <包内 LICENSE 文件路径>。
再分发须保留：本声明、署名、许可链接、修改说明；不得追加 DRM/付费墙限制（CC BY-NC-SA 场景）。
```

**④ AI 披露块（有 AI 就必填）**

```text
AI disclosure: 本作品包含 AI 生成/辅助内容（<图像/语音/文本>，工具 <model/tool>，供应商 <provider>，日期 <YYYY-MM-DD>）。
AI 输出可能不准确；不要把 AI 生成说成真人手绘/真人录音；已按中国《人工智能生成合成内容标识办法》等要求做显式标注。
```

## 2. 模板 A：L1 换皮 / 动作包 / 皮肤

适用：替换帧、调色板、语音、动作，复用官方行为。机读字段 + 包内声明：

```text
作品名：<皮肤名>（非官方）  基于：<官方角色/pack ID>（作者/许可）  修改：重绘 idle/pat 帧、调色板 <old>→<new>
作者：<name>  许可：<SPDX + URL>  AI：<none|assisted|generated + 工具/日期>
安装：把 <pack 目录> 放入「自定义角色」目录；或在本地构建中把 packBase 指向该目录。
原作品署名：<TASL 行>；本二创不覆盖官方 ID（新 id：community.<author>.<name>）。
```

机读字段建议：`meta.authors`、`meta.basedOn`、`license`、`ai.status`、`palette`；角色 `id` 用 `community.*`。

## 3. 模板 B：L2 新角色 / 新行为包

```text
角色包：<name>（非官方） 角色 ID：community.<author>.<name>  版本：x.y.z  FCI：0.2（或 0.3 预览）
作者/贡献者：<names>  许可：<SPDX + URL>   AI：<none|assisted|generated；图像/语音分别说明>
行为作者：<name>  台词作者：<name>  语音来源：<自录/TTS/授权库；供应商条款链接>
基于：<若有，原角色 + 原作者 + 许可>；不冒充官方、不使用官方名称作产品名。
内容分级：<all-ages | 13+ | 18+>；敏感内容标注：<无/说明>。
```

机读字段：`id`、`version`、`license`、`ai:{status,tool}`、`meta:{authors,basedOn,forkOf}`；0.3 包另备 `audio[].license/ai/provenance`、`voice.timbre`（禁止 clone 字段）。

## 4. 模板 C：语音包 / TTS 配音

```text
语音包：<name>（非官方）  语言：<zh/en/...>  音色来源：<自录真人（有授权书）/TTS 服务/授权库>
TTS：供应商 <provider>、模型/音色 <voice>、生成日期 <date>、逐句计费字符 <可选>；已获再分发/商用授权：<是/待确认/否>
原创声明：无真人克隆、无未授权动画/游戏/影视/他人配音采样；所有台词文本为原创或已获授权。
AI 披露：<必填，见通用块④>；不把合成语音说成真人配音，不模仿特定真人/角色。
许可：<SPDX + URL>；允许/禁止再分发与商用：<明确写>；署名：<TASL>。
```

机读字段：0.3 `audio[]`（`kind/voiceId/license/ai/provenance/sha256`）、`voice.timbre`（`pitch/rate/volume/style`，**禁 clone 字段**）、`sfx.clips`。

## 5. 模板 D：二创作品（图/视频/直播/文字/同人设定）

```text
作品：<title>  作者：<name>  发布日期：<date>  平台：<URL>
原作：<角色/世界观 + 原作者 + 许可>；本作品为同人二创，非官方，不代表原作立场。
修改：<是否基于官方图/二创图；改了什么>；AI：<none/assisted/generated + 工具/日期>。
许可：<我授予的许可，可与原作不同但不得阻碍下游遵守原作许可>；署名要求：<TASL>。
禁止：冒充官方/官方画师；商用前请确认原作许可与角色名/商标状态（名称检索未完成前不要做品牌化使用）。
```

## 6. 模板 E：付费 DLC / 内容包（需签名与权利链）

付费或带 entitlement 的内容不是普通二创：必须走官方 DLC 流程（`packs/<dlc>/manifest.json` 的 `contentApi/minBase/files[].sha256` + Ed25519 签名；见 [DLC-AND-PLUGIN-TERMS](../legal/DLC-AND-PLUGIN-TERMS.md)）。声明至少包含：

```text
Pack: <id>@<version>  contentApi: <n>  minBase: <semver>  作者/发行方：<legal entity>
授权依据：<自有/委托/买断/分成合同编号或备注>；音频/美术/Live2D 等第三方 SDK 许可：<逐项>
AI：<none/assisted/generated + 披露>；退款/支持/下架联络：<email 或页面>
```

## 7. 禁用的声明写法（会被退回/下架）

| ✗ 不要写 | 为什么 |
|---|---|
| 「官方」「官方授权」「合作」「partner」「authorized」「DeepSeek 娘」 | 冒充/混淆官方关联 |
| 「Orca 是产品名/品牌」 | 名称/商标未清，`ORCA` 第 42 类已有在先注册（见 [ORCA-OC-STATUS](../ORCA-OC-STATUS-2026-11-15.md)） |
| 「CC0 / 无需署名 / 公共领域」但实际是 CC BY-NC-SA | 错误许可声明 |
| 「100% 人工绘制/真人录音」但用了 AI | 虚假披露 |
| 「官方原班人马」「复刻官方语音」 | 暗示授权/仿冒 |
| 「禁止商用/禁止二创/加 DRM」再分发 CC BY-NC-SA 素材 | 违反 CC BY-NC-SA 条款 |
| 隐藏 AI 工具/供应商 | 违反披露要求 |

## 8. 发布前自检（与 [SECURITY](SECURITY.md) §7 联动）

- [ ] 主模板 A–E 已选；4 个通用块齐全；`<...>` 全部替换。
- [ ] `id` 非官方前缀；`basedOn/forkOf` 与原作者署名在位。
- [ ] 每个素材有来源/许可/是否修改；AI 素材有工具/日期/供应商。
- [ ] 语音无真人克隆/未授权采样；TTS 再分发条款已确认或标 TBD 且不发行。
- [ ] `npm run fci:validate`（或等价 CLI）与 `npm test` 通过；无脚本/可执行文件。
- [ ] 非官方声明在 About/下载页/包内可见；无官方 Logo/字标。

## 9. 允许 / 禁止 / 必须保留的声明（本文件自身约束）

**允许**：复制并按需裁剪本模板；在自有作品中采用更严格（但不违反原作许可）的补充条款；非商业二创（CC BY-NC-SA 4.0）；商业使用需另行书面许可并确认角色名/商标。
**禁止**：用本模板冒充律师意见或官方授权；删除/弱化原作署名、非官方声明、AI 披露；把「待确认」写成「已获授权」；用声明文本去注册角色名/商标。
**必须保留**：非官方声明；原作者署名与许可（TASL + 修改说明）；AI 披露；本模板指向的 legal 版本链接；`Required Notice`（涉及代码/第三方素材）；下架/联络渠道。
