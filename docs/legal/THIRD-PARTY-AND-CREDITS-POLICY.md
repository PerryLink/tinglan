# 第三方素材与署名政策：台账、许可、发布 Gate — 草案

> **状态：DRAFT · 2026-11-15 · 非法律意见。** 待用户 + 律师确认。本文规定“任何不是本项目原创的东西”如何登记、如何署名、何时不得发布；与根目录 [THIRD-PARTY.md](../../THIRD-PARTY.md)、[CREDITS.md](../../CREDITS.md)、[AI-PROVENANCE.md](../../AI-PROVENANCE.md)、`art/assets.csv` 联动。
> 关联：[DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) · [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) · [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) · [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md)。

## 1. 台账字段（每一项第三方/外部产出都必须有）

| 字段 | 要求 |
|---|---|
| `name` / `type` | 名称；类型（依赖/字体/音频/参考图/模型/图标/代码片段/SDK/数据） |
| `source` | 原始 URL 或获取渠道（可追溯） |
| `author` / `version` | 作者/机构；版本或 commit |
| `license` | **SPDX 标识**（如 MIT、Apache-2.0、CC-BY-NC-SA-4.0、CC-BY-NC-SA-4.0、LicenseRef-*）+ 许可全文链接 |
| `obtained_at` / `sha256` | 获取日期；文件哈希（可复现） |
| `redistributable` | 可否随产品再分发？可否商用？可否修改？（三问分别答） |
| `attribution` | 是否要求署名、署名文本、是否要求显示 NOTICE |
| `used_in` | 使用位置（仓库路径/构建产物/商店素材） |
| `ai` | 是否 AI 生成；工具/模型/日期（若适用） |
| `provenance` | 生成/转换/修改记录指针 |
| `reviewed_by` / `reviewed_at` | 复核人、日期 |

**硬规则**：`license=TBD` 或来源不明 = **不可发布**；不得用“以后补”过 Gate。

## 2. 分类规则

### 2.1 依赖（npm / Rust / Electron / Chromium / WebView2 / Tauri）
- 版本以 lockfile 为准；生成 `LICENSES/` 归档（全文+清单+版本），随发布物或可访问链接提供。
- Electron 分发须附 Electron/Chromium 许可声明；Tauri 用系统 WebView2 运行时，**不得**擅自打包 WebView2。
- **Steamworks SDK 为 Valve 专有**：不入库、不随公开构建分发。
- 传递依赖同样登记（扫描工具输出须人工确认 SPDX）。
- 许可原文（2026-11-15 核验可达，以官方文本为准）：[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) · [PolyForm NC 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · SPDX 清单 <https://spdx.org/licenses/>。

### 2.2 字体
- 默认**不打包**（用系统字体栈）；若打包：须有**嵌入与再分发许可**（商用字体常见禁止嵌入），并把许可全文放入 `LICENSES/`。
- 禁止从网络“下载即用”的商业字体、禁止改名冒充自有字体。

### 2.3 音频（TTS / SFX / BGM）
- 本项目 18 个 WAV 为 DeepSeek TTS 输出，**再分发条款 TBD** → 发布前必须：确认条款（记录版本+日期+URL）或替换/删除；`manifest.json` 每项须有 `license`/`ai`/provenance。
- 禁止：影视/动画/游戏/VTuber 音频提取；未授权音效库；真人声音克隆（见替换政策 §3）。
- 合成语音须披露（AI 政策）；不得声称真人配音。

### 2.4 参考图 / 同人输入（`art/_private-reference/refs/`）
- 仍 gitignored；**永不**进发布包、商店素材、营销图，**不得**作为发布资产的生成参考（Pearl/ref10 同理）。
- 若确认可用：须取得授权并登记（含“可否作 AI 输入”的单独判断）。

### 2.5 AI 模型 / API
- 记录模型名/版本、供应商条款、输入输出限制；不得打包模型权重（除非许可明确）。
- 历史 SDXL 3 行资产：checkpoint 许可未知 = 不可发布（重生成或替换）；合规 checkpoint（如 CreativeML Open RAIL++-M）也须遵守使用限制。

### 2.6 图标 / 品牌素材
- Tauri 图标来源须确认/替换；不得用他人品牌图标、系统图标、官方 Logo。
- 任何“看起来像大厂”的图标/字体组合先做相似度判断。

### 2.7 自产资产（也要登记）
- `art/assets.csv` 每行 `license` + `source_sha` 必填；占位图标 `placeholder-only`（不可发布）；Orca 美术标 `CC-BY-NC-SA-4.0`（生效后）。

## 3. 署名（CREDITS）要求

1. **TASL 格式**：Title / Author / Source / License（+ 修改说明）；中英双语；逐资产一行。
2. 分层署名：代码依赖、美术、音频、AI 工具、第三方素材分开列；不把依赖混进“作者”栏。
3. AI 披露：生成工具/模型/日期；人工修改说明；不得删除原署名。
4. 随包分发时 `CREDITS.md` / `NOTICE` / `THIRD-PARTY.md` 必须可离线读取（包内或 About 页可达）。
5. 不得用“综合整理/网络素材”等模糊表述替代具体来源。

## 4. 发布前 Gate（全部打勾才可发布）

- [ ] 台账无 `TBD`、无“来源不明”；每项有 SPDX + 链接 + sha256。
- [ ] `LICENSES/` 归档生成；发布包内含 `LICENSE`/`LICENSE-ART`(生效版)/`NOTICE`/`CREDITS`/`THIRD-PARTY`/`AI-PROVENANCE`。
- [ ] 发行脚本 `LICENSE_FILES` 已扩展到全部署名文件（现状仅 4 个）。
- [ ] 字体：未打包，或已获嵌入许可并归档。
- [ ] 音频：18 WAV 条款已确认或已替换；manifest `license` 非 TBD。
- [ ] refs / Pearl 草稿 / ref10：零发布；反向图搜记录归档。
- [ ] 无 Steamworks SDK、无私钥/`<private-keys>/`、无 `rustup-init.exe` 类第三方二进制。
- [ ] 图标来源确认；依赖许可扫描完成（npm + Rust）。
- [ ] AI 标识与宣发素材一致（见 AI 政策 §4）。
- [ ] 商店页/README 的署名与包内一致。

## 5. 冲突与清理

- 许可不可再分发/不明 → **替换或删除**，不得“先发布后处理”。
- 许可要求显示 NOTICE 的（Apache-2.0 等）→ 必须保留并随包提供。
- 发现已发布物含问题素材 → 立即下架/替换 + 公告（不隐瞒）；见 [TAKEDOWN](./TAKEDOWN-AND-REPORTING.md)。

## 6. 新增素材流程

1. 选型/获取 → 2. 登记台账（许可/来源/sha）→ 3. 判定可再分发/可商用/可修改 → 4. 署名与 NOTICE 落地 → 5. 过 §4 Gate 再使用。

## 7. 待补/待律师

- [ ] 依赖许可全量扫描归档（工程任务，未做）。
- [ ] DeepSeek TTS / OpenRouter / OpenAI 条款复核（发布前）。
- [ ] 字体与图标许可确认；`art/assets.csv` 6 行 TBD 清零。
- [ ] NOTICE 显示义务的具体写法（Apache-2.0 层落地后）。

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版 | draft；待用户 + 律师 |

> 草案，不是法律意见。
