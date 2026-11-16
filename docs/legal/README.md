# 声明与合规文档（docs/legal/）— 索引 · 草案

> **状态：DRAFT（草案）· 2026-11-15 · 非法律意见。** 本目录全部文件待用户（PerryLink）+ 律师确认后方可作为对外生效文本；**不得**引用为“已批准 / 已检索 / 已获法律意见”。
> 适用对象：`desktop-games` 仓库（工程名；**产品名未定**）、桌宠层代号 Famling、角色「**汀岚**」（暂定名，未经商标检索）、内部工作名 **Orca OC**（**不得**作产品名/包名/域名）。
> 上位文件：[NOTICE](../../NOTICE) · [LICENSE](../../LICENSE) · [LICENSE-COMMERCIAL.md](../../LICENSE-COMMERCIAL.md) · [LICENSE-ART](../../LICENSE-ART) · [CREDITS.md](../../CREDITS.md) · [THIRD-PARTY.md](../../THIRD-PARTY.md) · [AI-PROVENANCE.md](../../AI-PROVENANCE.md) · [LEGAL-STATUS](../LEGAL-STATUS-2026-11-15.md)。
> 本目录回答两件事：①「哪些地方可以贴声明、各贴什么」；②「别人可以添加 DLC/插件/二创的地方，边界在哪、怎么声明」。

## 1. 适用层级（先判断自己在哪一层）

| # | 层 | 对象 | 当前出站许可 / 状态 | 本目录对应文件 |
|---|---|---|---|---|
| L1 | 代码底座 | 内核/游戏/壳/工具 | **PolyForm Noncommercial 1.0.0**（源可见，**不是** OSI 开源；商用需另签） | [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md)、根 `LICENSE`/`NOTICE` |
| L2 | 桌宠层代码 | Famling 桌宠/FCI | **Apache-2.0 目标尚未在本仓落地**（需拍板+版权审计）；不得宣称 | [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md)、`NOTICE` §1 |
| L3 | 美术/设定 | 汀岚（Orca OC）原画、设定、像素包 | **CC BY-NC-SA 4.0 草案**（`LICENSE-ART`，未生效；生效前按保留所有权利处理） | [CONTENT-POLICY](./CONTENT-POLICY.md)、[FANWORK-POLICY](./FANWORK-POLICY.md)、[ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) |
| L4 | 音频/语音 | 18 个 TTS WAV、BGM/SFX、实时语音 | TTS 输出再分发条款见 [TTS-TERMS](./TTS-TERMS.md)（DRAFT；律师审查暂缓，用户 2026-11-16 决定；未确认前不随包）；不得随包发未确认音频 | [THIRD-PARTY-AND-CREDITS-POLICY](./THIRD-PARTY-AND-CREDITS-POLICY.md)、[AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) |
| L5 | AI 生成内容 | 图/文/语音/对话/宣发 | 中国《标识办法》等 + 平台政策；**标识未落地** | [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) |
| L6 | 名称/Logo/商标 | 产品名、角色名、仓名、包名、域名 | **保留所有权利，不随任何许可授权**；Orca 高风险 | [TRADEMARK-AND-NAMING-POLICY](./TRADEMARK-AND-NAMING-POLICY.md) |
| L7 | DLC/角色包/内容包 | 第三方或第一方扩展包 | 内容包：纯数据 + Ed25519 签名 + 逐文件 sha256（已落地）；角色包：纯数据，签名/哈希校验待补齐 | [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) |
| L8 | 插件/渲染器 | 第三方可执行扩展 | **本仓不接纳第三方可执行插件**；渲染器仅第一方构建期 allowlist | [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) |
| L9 | 二创 | 同人图/文/视频/直播/周边 | 受作品许可（拟 CC BY-NC-SA 4.0）+ 本政策名称/平台限制 | [FANWORK-POLICY](./FANWORK-POLICY.md) |
| L10 | 替换/改模 | 动作、声音、形象、行为、UI | 受各自素材许可 + 署名/AI 披露要求 | [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) |
| L11 | 第三方素材 | 字体、依赖、参考图、SDK | 各自原许可；台账见 `THIRD-PARTY.md` | [THIRD-PARTY-AND-CREDITS-POLICY](./THIRD-PARTY-AND-CREDITS-POLICY.md) |
| L12 | 安全/隐私 | 存档、记忆、麦克风、遥测 | PIPL/隐私最小化；遥测默认关闭 | [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) |
| L13 | 举报/下架 | 侵权、违规内容、恶意包 | 通知—初审—临时下架—申辩 | [TAKEDOWN-AND-REPORTING](./TAKEDOWN-AND-REPORTING.md) |

## 2. 优先级与冲突规则（待律师确认）

- **R1 效力顺序**：① 强制性法律/监管/平台规则（含商店协议）＞ ② 根目录生效许可文本（`LICENSE`/`LICENSE-COMMERCIAL.md`/`NOTICE`/`LICENSE-ART`）＞ ③ 本目录政策 ＞ ④ 包内作者声明/自述 ＞ ⑤ 社区惯例与示例文本。
- **R2 具体优先，但不得放宽上位**：更具体的文件优先；任何文件都不得放宽 R1① 的禁止项。**本目录不得被解释为对已按 CC BY-NC-SA 4.0 发布的作品追加许可限制**（CC BY-NC-SA 4.0 禁止额外限制）；本目录中对名称/商标、未发布素材、官方渠道行为、平台规则的限制，**不属于**对该 CC BY-NC-SA 作品的额外许可限制。
- **R3 文本冲突**：以 canonical 英文/规范文本为准（CC BY-NC-SA 4.0 legalcode、Apache-2.0、PolyForm NC 1.0.0、CC0 1.0）；中文摘要仅供参考。
- **R4 草案不产生权利义务**：`LICENSE-ART`、`NOTICE` 标注 DRAFT 期间，相关美术按“**保留所有权利**”处理，不得对外发放。
- **R5 与上位文件冲突**：以根目录生效文件为准，并立即修订本目录（见 §6）。
- **R6 不得自我加冕**：不得声明本项目“已获律师审核/官方授权/已注册商标/已合规”；不得用声明给第三方施加超出法律与许可的义务。

## 3. 场景速查（完整矩阵见 [DECLARATION-MATRIX.md](./DECLARATION-MATRIX.md)）

| 场景 | 贴哪份声明 | 最低展示位置 |
|---|---|---|
| 发布官方美术/角色图 | [CONTENT-POLICY](./CONTENT-POLICY.md) + [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) + `LICENSE-ART` | 图角落“AI 生成”+ 元数据 + 图集 `CREDITS` |
| 发布代码/仓库 | [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md) + 根 `LICENSE`/`NOTICE` | 仓库根、About、发行包 |
| 角色包/DLC（第一方或第三方） | [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) + 模板 | 包内 `LICENSE.txt`/`NOTICE`、包详情页 |
| 插件/扩展 | 同上（当前仅第一方） | 构建期 allowlist 说明、About |
| 二创（图/文/视频/直播/周边） | [FANWORK-POLICY](./FANWORK-POLICY.md) + 模板 | 作品简介/置顶评论/视频简介 |
| 动作/声音/形象替换 | [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) + 模板 | 包内声明、详情页、下载页 |
| 举报/下架 | [TAKEDOWN-AND-REPORTING](./TAKEDOWN-AND-REPORTING.md) | 仓库根/官网 `TAKEDOWN` 入口 |

## 4. 文件索引（14 个）

| 文件 | 覆盖 | 需律师 |
|---|---|---|
| [CONTENT-POLICY](./CONTENT-POLICY.md) | 内容边界、年龄分级、AI 披露、零容忍项 | 建议 |
| [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) | DLC/角色包/插件条款、签名沙箱、下架、免责 | **是** |
| [FANWORK-POLICY](./FANWORK-POLICY.md) | 二创允许/禁止、署名、商业化边界、商标 | **是** |
| [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) | 动作/声音/形象/行为/UI 替换规则 | **是** |
| [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) | AI 生成/训练/语音披露、法域标识、模型条款 | **是** |
| [TRADEMARK-AND-NAMING-POLICY](./TRADEMARK-AND-NAMING-POLICY.md) | 名称分层、Orca 禁用、禁止抢注、域名/包名 | **是** |
| [TAKEDOWN-AND-REPORTING](./TAKEDOWN-AND-REPORTING.md) | 举报流程、材料、时限、临时下架、反通知 | **是** |
| [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md) | DCO/CLA、代码/美术/音频入站、AI 贡献披露 | **是** |
| [THIRD-PARTY-AND-CREDITS-POLICY](./THIRD-PARTY-AND-CREDITS-POLICY.md) | 第三方台账、字体/TTS/参考图、发布 gate | 建议 |
| [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) | 存档/记忆/麦克风/遥测、漏洞披露 | **是** |
| [DECLARATION-MATRIX](./DECLARATION-MATRIX.md) | 场景×声明×展示位置×律师 | 否（流程） |
| [DECLARATION-TEMPLATES/README](./DECLARATION-TEMPLATES/README.md) | 模板用法、字段字典、必填块、禁项样板 | 否 |
| [DECLARATION-TEMPLATES/TEMPLATES](./DECLARATION-TEMPLATES/TEMPLATES.md) | 4 份可复制模板（DLC/角色包、插件、二创、改模） | 否 |

## 5. 联系方式占位（**未填写 = 不得公开任何声明**）

| 用途 | 占位符 | 备注 |
|---|---|---|
| 一般法务/许可询问 | `novelnexusai@outlook.com` | 已配置（2026-11-16） |
| 侵权/下架通知 | `novelnexusai@outlook.com` | 见 [TAKEDOWN-AND-REPORTING](./TAKEDOWN-AND-REPORTING.md) |
| 安全漏洞 | `novelnexusai@outlook.com` | 见 [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) |
| DLC/角色包审核 | `novelnexusai@outlook.com` | 包投稿/上架 |
| 隐私/数据请求 | `novelnexusai@outlook.com` | 删除权、数据导出 |

> 占位符是**刻意**的：本仓 2026-11-15 无公开远程与公开联系方式，任何真实邮箱须由用户确认后填入；**不得**杜撰官方邮箱/客服号/公司名。

## 6. 维护与变更记录

- 修改本目录须：写明日期、原因、涉及文件、是否已过律师；对外发布前由用户（或书面邮件）确认。
- 律师意见到位后：删 DRAFT 标记、填入生效日期与主体、同步根 `NOTICE`/`LICENSE-ART`，并把“待律师”改为“已签日期/文件名”。
- 本目录**不写**价格、分成、法定时限承诺；内部目标值一律标注“内部目标，非承诺”。

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版：14 份草案（索引/矩阵/10 政策/2 模板） | draft；待用户 + 律师 |
| 2026-11-15 | 与 `docs/modding/` 二创开发文档分工：法律侧以本目录为 canon，`docs/modding/` 只链接不复制 | draft |

> 本目录全部内容为草案，不是法律意见。
