# DECLARATIONS — 声明总入口

Status: **用户已决定核心许可（2026-11-16）；律师审查暂缓。** 本文件把项目的许可、内容边界、DLC/插件、二创、AI、商标、安全与举报声明集中索引；具体条款以各文件为准，冲突时按 [docs/legal/README.md](docs/legal/README.md) 的优先级处理。**不是法律意见。**

## 0. 公开仓

- 桌宠公开仓：<https://github.com/PerryLink/tinglan>（角色/素材/接口子集；完整游戏基座保持私有）
- Advisers 独立仓：<https://github.com/PerryLink/advisers>（独立核心，不随桌宠发布）

## 1. 核心声明

| 场景 | 声明 | 位置 |
|---|---|---|
| 仓库代码 | PolyForm Noncommercial 1.0.0（底座/桌宠代码）；公开桌宠仓仅含角色/素材/接口子集 | [LICENSE](LICENSE) · [NOTICE](NOTICE) · [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md) |
| 角色美术/设定（汀岚/Orca OC） | **CC BY-NC-SA 4.0**（用户 2026-11-16 决定；非商业 + 同协议 + 署名；律师审查暂缓） | [LICENSE-ART](LICENSE-ART) |
| TTS / 语音资产 | 自带 key、费用自担、AI 披露、禁克隆/未授权音源、未确认不随包 | [docs/legal/TTS-TERMS.md](docs/legal/TTS-TERMS.md) |
| AI 生成/来源 | 必须披露；保留 provenance；不冒充真人/官方 | [AI-PROVENANCE.md](AI-PROVENANCE.md) · [docs/legal/AI-CONTENT-POLICY.md](docs/legal/AI-CONTENT-POLICY.md) |
| 第三方素材 | 逐项登记；未确认不得发布 | [THIRD-PARTY.md](THIRD-PARTY.md) · [CREDITS.md](CREDITS.md) |
| DLC / 角色包 / 插件 | 纯数据、无代码、签名/审核、禁止恶意/侵权/冒充官方 | [docs/legal/DLC-AND-PLUGIN-TERMS.md](docs/legal/DLC-AND-PLUGIN-TERMS.md) |
| 二创 / 同人 / 改模 | 允许范围、署名、商业化边界、商标保留 | [docs/legal/FANWORK-POLICY.md](docs/legal/FANWORK-POLICY.md) · [docs/legal/ASSET-REPLACEMENT-AND-MODDING-POLICY.md](docs/legal/ASSET-REPLACEMENT-AND-MODDING-POLICY.md) |
| 角色名/商标/非官方 | 汀岚/Orca/留屿园/Famling/折角 使用边界；禁止抢注/冒充 | [docs/legal/TRADEMARK-AND-NAMING-POLICY.md](docs/legal/TRADEMARK-AND-NAMING-POLICY.md) |
| 贡献者 | DCO/CLA、AI 辅助披露、无担保 | [docs/legal/CONTRIBUTOR-TERMS.md](docs/legal/CONTRIBUTOR-TERMS.md) |
| 侵权/违规举报 | 材料、下架、反通知、联系方式占位 | [TAKEDOWN.md](TAKEDOWN.md) · [docs/legal/TAKEDOWN-AND-REPORTING.md](docs/legal/TAKEDOWN-AND-REPORTING.md) |
| AI 拟人化/roleplay 强制提醒 | 非真人、非专业、18+、防依赖、2h 提醒、危机转介、TTS 标识 | [docs/legal/TTS-TERMS.md](docs/legal/TTS-TERMS.md) §8 |
| 隐私/安全 | 本地数据、记忆/语音、遥测 opt-in、漏洞披露 | [SECURITY.md](SECURITY.md) · [docs/legal/SECURITY-AND-PRIVACY.md](docs/legal/SECURITY-AND-PRIVACY.md) |
| AI 拟人化互动合规 | 身份披露、未成年人、防沉迷、情感依赖、危机转介、2h 提醒、roleplay 边界 | [docs/research/AI-COMPANION-REGULATION-2026-11-16.md](docs/research/AI-COMPANION-REGULATION-2026-11-16.md) · [docs/TINGLAN-ROLEPLAY-VALUES-2026-11-16.md](docs/TINGLAN-ROLEPLAY-VALUES-2026-11-16.md) |
| 完整矩阵 | 22 场景 × 适用声明 × 展示位置 × 是否需律师 | [docs/legal/DECLARATION-MATRIX.md](docs/legal/DECLARATION-MATRIX.md) |
| 二创开发接口 | 动作/声音/形象/行为/UI 替换、L1/L2/L3 扩展、模板 | [docs/modding/README.md](docs/modding/README.md) |
| 角色包接口 v0.3 | voice/idle/zones/responses/audio 声明；汀岚示例 | [docs/CHARACTER-INTERFACE-V0.3.md](docs/CHARACTER-INTERFACE-V0.3.md) · [public/characters/tinglan/README.md](public/characters/tinglan/README.md) |

## 2. 非官方声明（发布物必须展示）

> 汀岚（Tinglan）是 PerryLink 的原创虎鲸秘书角色。本项目为非官方项目，与 DeepSeek（深度求索）无任何关联、合作、授权或背书关系；不使用 DeepSeek 官方 Logo、字标或官方鲸鱼娘形象。角色名/Logo/商标不随 CC BY-NC-SA 授权。

> Tinglan is an original orca-secretary character by PerryLink. This is an unofficial project, not affiliated with, endorsed by, or authorized by DeepSeek. No DeepSeek logos, wordmarks, or official mascots are used. Character names/logos/trademarks are not licensed under CC BY-NC-SA.

## 3. 内容红线（摘要，全文见 legal）

- 未成年人性化/CSAM：零容忍，AI 生成同样适用。
- 冒充官方/暗示 DeepSeek 合作；使用官方 Logo/官方鲸鱼娘。
- 真人声音克隆、未授权音源、影视/游戏音频提取、AI 伪装真人。
- 他人 IP/商标/字体/参考图；`art/_placeholder/refs/` 同人参考图**永不发布**；Orca 不得作产品名。
- 包内可执行/恶意代码、伪造签名、绕过安全边界。
- 色情/仇恨/骚扰/政治操纵/违法内容；侵犯隐私；未获同意的真人形象。

## 4. 二创作者需要做什么

1. 使用 [docs/modding/](docs/modding/) 的 L1/L2/L3 路径；角色包保持纯数据。
2. 在包内 `meta`/`license`/`credits`/`audio[].license` 写清素材来源、许可、AI 披露、作者与联系方式。
3. 使用 [docs/legal/DECLARATION-TEMPLATES/](docs/legal/DECLARATION-TEMPLATES/) 的声明模板；发布页展示非官方声明与红线。
4. 保留原作者署名/NOTICE/许可；不得移除 AI/作者声明；不得暗示官方背书。
5. 涉及商业化/周边量产/真人声音/第三方 IP：先走律师与书面许可。

## 5. 联系

问题/安全/侵权/隐私：**novelnexusai@outlook.com**。

## 6. 待办

- 用户已定 CC BY-NC-SA 4.0；律师审查暂缓；不对外称“律师已确认”。
- TTS 18 个 WAV 的再分发条款确认；`art/assets.csv` 6 行 TBD 清零。
- 联系方式已为 `novelnexusai@outlook.com`；举报/下架流程已建。
- 发布包内置本索引与 `docs/legal/README.md`（安装器资源已含 NOTICE；后续补 docs/legal 摘要）。
