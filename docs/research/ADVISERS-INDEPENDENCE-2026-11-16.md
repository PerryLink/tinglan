# Advisers 独立性与许可边界研究（2026-11-16）

> 状态：**只读研究 + 决策请求**。未改代码/资产、未生成图/音频、未调 API、未联网、未做 git（只读 `.git` 文件）、未写 hub。
> 证据时点：本机 2026-11-16 16:2x（Asia/Shanghai）。仓库状态来自文件与 `docs/<private-doc>.md`（2026-11-15 22:45 记录）；npm/CI/三远端本轮**未在线复核**，引用为记录值。
> 路径约定：`ADV:` = `<private-path>`（Advisers 独立仓）；`DG:` = `<private-path>`（本文所在仓）。
> 前置审计：`DG:docs/research/ADVISERS-PETBRIEF-AUDIT.md` 已审计 producer/消费端接口；本文补"独立性/许可/契约所有权/发布边界"。

## 0. 结论先行（TL;DR）

1. **Advisers 真实许可 = MIT，不是 Apache-2.0**：root `LICENSE` 为 MIT（"Copyright (c) 2026 PerryLink contributors"），8 个包 `license: MIT`；仓内唯一 "Apache-2.0" 字样是竞品描述。**Apache-2.0 在现有证据里只属于 Famling 桌宠层（目标，未落地）**；2026-11-14 决定明确写"Advisers MIT（不变），与桌宠解耦"。用户口径需先对齐，否则对外陈述不实。
2. **独立仓成立，但产品层未闭环**：Advisers 是独立 git 仓（3 远端），与 DG 无代码互相依赖、无 npm 依赖；但 Pet Brief 契约 canonical 在**私有消费仓** `PerryLink/famling`，且 producer 只存在于未发布的 `.71` 工作树（staged `.70` 不含它）。
3. **Pet Brief producer 不算"干扰核心"**：它在 CLI 包（非 core）、零新依赖、纯只读、18 测试、未进 README/CHANGELOG。它的真实问题是**契约所有权倒挂**与**未发布**，不是代码位置。
4. **建议**：保留 producer 为"可选只读输出适配器"，同时把契约+测试向量收入 Advisers 仓并由 Advisers CI 验证；许可保持 MIT（或 MIT OR Apache-2.0 双许可，待用户拍板）。
5. **最大风险**：契约在私有消费仓 + 发布链卡 OTP ⇒ "独立核"在用户侧既拿不到（`.70` 不含、`.71` 未 stage）也无法自证契约兼容；若再把 Advisers 误称 Apache-2.0，则叠加许可口径风险。

## 1. 事实核验（只读）

| 项 | 实测/记录 | 证据 |
|---|---|---|
| 独立仓 | 独立 git 仓，`main` 跟踪 gitcode；三远端 GitHub/Gitee/GitCode | `ADV:.git/config:7-21` |
| HEAD | `c8d71f3`（末条 docs）；最后一次代码提交 `64a7f82` | `ADV:.git/refs/heads/main`；`.git/logs/HEAD` |
| 历史/作者 | reflog 115 条全部 `PerryLink`（两个邮箱变体）；非 shallow；`.git` 6.0 MB | `ADV:.git/logs/HEAD` |
| 版本 | `advisers@0.2.0-preview.70`；core `.22`；dsh-advisers `.27`；office `.14`；policy-strict `.12`；bridge `.22`；link-email `0.0.1`；link-feishu `.1` | `ADV:packages/*/package.json` |
| 许可 | root+7/8 包文件 = MIT；8/8 `package.json` = MIT；`link-email` 缺 LICENSE 文件 | `ADV:LICENSE`；`ADV:packages/*/LICENSE` |
| 许可口径 | `README.md` 只写 "License: MIT."；CHANGELOG 无 Apache；无 NOTICE/CLA/DCO | `ADV:README.md:81-83`；`ADV:CONTRIBUTING.md` |
| Apache 提及 | 仓内唯一：`POSITIONING.md:21` 描述竞品"钉钉 CLI（Apache-2.0）" | `ADV:docs/POSITIONING.md:21` |
| 测试 | 250/250（8 包，Pet Brief +18）；本轮未复跑 | `ADV:docs/<private-doc>.md:64,165` |
| CI | GitHub Actions，push main/PR，Node 22/24；跑 build/typecheck/test/pack-smoke/check-docs/verify-office/security-suite；记录 run `43719184514`（`64a7f82`）、`43724980149`（`c7e30a0`）success | `ADV:.github/workflows/ci.yml`；handoff:69,159 |
| 发布 | `publish` 仅 `workflow_dispatch`，注释"human-OTP staged approval"；staged `.70` id `9e35d09f…`、shasum `2fbe9dfb…`；**`.70` 不含 Pet Brief**；`.71` 未 bump/stage；npm `latest 0.0.4`/`next 0.1.0-preview.2` | `ADV:.github/workflows/publish.yml:3-6`；handoff:72-73,171-172；`DG:docs/MASTER-STATUS-2026-11-16.md:49` |
| 三端同步 | 本地 remote-tracking：gitcode `6cd5424`、gitee/origin `89d8ca1`，均 ≠ HEAD `c8d71f3`；交接称 GitHub/GitCode 已到 `c7e30a0` ⇒ **未核实** | `ADV:.git/refs/remotes/*/main`；handoff:174 |
| DG 侧 | 独立仓 `desktop-games-p0@0.1.0`（private）；本轮 `.git/config` **无 remote**；LICENSE = PolyForm Noncommercial 1.0.0 | `DG:.git/config`；`DG:package.json`；`DG:LICENSE` |
| DG 许可目标 | 桌宠/Famling 层 Apache-2.0 **未落地**；本仓代码保持 PolyForm NC；2026-11-14 决定 "Advisers MIT（不变）" | `DG:README.md:191-193`；`DG:docs/LEGAL-STATUS-2026-11-15.md:62`；`DG:docs/LICENSE-AND-NAME-PLAN-2026-11-14.md:10-16` |
| 跨仓依赖 | DG `package.json`/lock 无 `advisers` 依赖；Advisers 运行时代码无 pet/UI/tauri import（仅 docs 引用） | `DG:package.json`；grep（本轮） |
| 契约 | Pet Brief v0.1/`schemaVersion:1`；DG 有 6 文件快照；canonical 在私有 `PerryLink/famling`；Advisers 有 producer、无 20 条契约向量 | `DG:docs/contracts/pet-brief/README.md:3-8`；`ADV:docs/PET-BRIEF-PRODUCER.md:3-6,71` |
| 核心纯净 | `packages/core/src` 仅相对路径 + `node:*`；`architecture.test.ts` 强制且禁 fork-only cordis 符号 | `ADV:packages/core/test/architecture.test.ts:8-22` |
| DSH 边界 | "核心独立运行（不依赖 cordis）；DSH 是薄适配器（brief/office），不是第二产品" | `ADV:README-zh.md:11`；`ADV:README.md:13-21` |

## 2. "Apache-2.0" vs MIT：差异与重许可风险

### 2.1 差异（对 Advisers 这种 CLI + Office 产品）

| 维度 | MIT | Apache-2.0 |
|---|---|---|
| 专利 | 无明示专利授权 | 明示专利授权 + 专利报复终止条款（企业采用更放心） |
| 商标 | 不涉及 | 明确不授予商标/品牌权（对 "Advisers/Famling" 名称是保护） |
| NOTICE | 无 | 有 NOTICE 传播义务；修改文件需标注 |
| 义务/兼容 | 最简；与 Apache-2.0 代码可共存 | 与 GPL-2.0 不兼容；与 MIT/Apache 依赖兼容 |
| 影响面 | 已满足"permissive/open source" | 主要收益是专利条款与法务可预期性，不是"更开放" |

**判定**：对 Advisers 当前目标（独立产品、扩大采用、以后可商业化）两者都可行；MIT 更简单、与现有决定一致；Apache-2.0 的实质增量是专利与商标条款。

### 2.2 重许可（MIT → Apache-2.0）风险清单

1. **已发布版本不可撤回**：`0.0.4`/`0.1.0-preview.2` 等已按 MIT 发布，永远 MIT；只能对**新版本**换许可 ⇒ 版本历史混合许可，README/CHANGELOG/文档必须写矩阵。
2. **版权归属审计**：本地 reflog 115 条全为 PerryLink（同一人两个邮箱），但**3 个远端可能有 PR/其他作者**；`Copyright (c) 2026 PerryLink contributors` 的"contributors"主体不明确。重许可需确认每个版权持有人同意（或确认只有本人）。
3. **无入站许可机制**：`CONTRIBUTING.md` 无 CLA/DCO 条款 ⇒ 若已有外部贡献，需逐个取得同意；未来需补 DCO 或 CLA。
4. **落地面广**：root LICENSE、8 个 package.json、7 个包 LICENSE（`link-email` 还缺）、README/README-zh、NOTICE（新增）、npm 元数据、三远端、DG 的许可矩阵、`docs/LEGAL-STATUS` 口径。
5. **许可污染**：DG 是 PolyForm NC（source-available，非 OSI）；**任何 DG 代码/美术搬进 Advisers 都会污染**（Apache-2.0 不能洗掉 NC 限制）。Pet Brief 契约文本是唯一跨仓内容，应单独给 spec 许可（建议 CC BY 4.0 或 Apache-2.0）。
6. **依赖许可**：主要依赖 MIT/Apache-2.0 系（pdf-lib MIT、jszip MIT、pdfjs-dist Apache-2.0）；发布前需生成完整依赖清单（DG 侧清单也未做）。

### 2.3 建议（待用户拍板）

- **A（推荐）保持 MIT**：符合 2026-11-14 决定、与 Apache-2.0 桌宠层天然兼容（Apache-2.0 项目可消费 MIT 库）、零审计成本。
- **B（次推荐）`MIT OR Apache-2.0` 双许可**：兼顾"independent + patent grant + 扩大影响"，无需撤回旧版本，只需新增 LICENSE/NOTICE 与声明；是常见做法。
- **C 纯 Apache-2.0**：仅当明确需要专利条款/企业采购口径；需完成 §2.2 全部审计与执行清单。
- **无论选哪个**：先确认"Apache-2.0"指的是 **Advisers** 还是 **Famling 桌宠层**（现有证据只支持后者）；在用户书面确认前，对外不得称 Advisers 为 Apache-2.0。

## 3. 独立核心契约（5 条硬边界）

### 3.0 类比定位（Cordis ↔ DSH）

| 层 | Cordis ↔ DSH | Advisers 对应 | 独立性判据 |
|---|---|---|---|
| 核心库 | Cordis（独立，无 DSH） | `advisers-core`（+公开类型） | 去掉桌宠/DSH，core 完整可用 |
| 宿主/发行 | DSH（薄宿主，消费 Cordis） | `advisers` CLI（自有宿主）/ `dsh-advisers`（DSH 薄适配器） | 两个发行只换宿主，不换核心 |
| 外部消费者 | DSH 之外无 | 桌宠/Famling：**只通过版本化输出消费** | 去掉 Advisers，桌宠普通功能完整可用 |
| 共享协议 | Cordis API 版本 | `CLI-JSON v1` 与 `Pet Brief schemaVersion 1`（两个独立契约，勿混） | 契约变更各自版本化 |

> 结论：桌宠不是 Advisers 的"发行形态"，只是**消费者/表现层**；Advisers 不能为桌宠改核心语义。

### 3.1 五条契约（P0 目标状态）

| # | 规则 | 现状 | 缺口/动作 |
|---|---|---|---|
| R1 **核心纯净** | `packages/core` 只 import 相对路径/`node:*`；不 import cordis/DSH/平台 SDK/UI/桌宠；core 不依赖 CLI 层 | ✅ `architecture.test.ts` 已强制（禁 bare specifier + fork 符号） | 扩展黑名单：`pet`/`desktop-games`/`famling`/`tauri`/`electron`；加"core 不 import `packages/advisers/lib`"检查 |
| R2 **单向只读** | 消费者只读版本化输出（Pet Brief JSON / CLI `--json` v1 / 用户显式导出文件）；**不得**直读 SQLite/`state.json`/内部 LedgerSnapshot；不得写账本；producer 不联网/不调模型/不写 | ✅ producer 纯函数、`readOnly:true` SQLite、18 测试含 DB SHA 不变；DG 侧 Tauri 固定路径只读 + 128 KiB 上限 + 严格校验 | DG 遗留 `src/presence/advisers-source.ts` 仍定义"直读 `state.json`/LedgerSnapshot"路径（仅测试引用、未接线）⇒ 删除或标 internal；生产路径禁止使用 |
| R3 **契约所有权** | Advisers 拥有 **producer 输出契约**（字段/隐私/失败码/测试向量）；消费者只拥有渲染映射；契约快照各仓 vendor + SHA pin；canonical 不能只存在私有消费仓 | ❌ 反向：canonical 在私有 `PerryLink/famling`；Advisers 仓无 20 条向量；producer/consumer 常量各硬编码一份 | 把契约 4 文件 + 20 向量 vendor 进 Advisers 仓；Advisers CI 跑向量；决定 canonical 位置 |
| R4 **版本/兼容/弃用** | `schemaVersion` 独立于包 semver；变更必须 bump；消费者严格拒绝未知（fail-closed → idle）；弃用至少保留 1 个 preview 周期；`--check` 双仓 CI | ⚠️ 严格拒绝已有；无弃用/N-1 政策；常量双份 | `docs/CONTRACTS.md` 注册表：CLI-JSON v1（stable）/ Pet Brief v0.1→冻结 / LedgerSnapshot internal；写弃用窗口 |
| R5 **发布/失败隔离** | Advisers 发布不依赖桌宠（无消费者也要 build/test/pack 通过）；桌宠缺失/过期/非法 brief 不影响普通行为；禁止跨仓复制代码 | ⚠️ 测试/isolation 已满足（250/250 含 18；DG 6 项 face 测试覆盖 idle）；但 producer **未发布**（`.70` 不含、`.71` 未 stage） | `.71` bump/stage；发布检查表加"无消费者独立发布"断言；禁止 DG 代码入 Advisers |

### 3.2 版本/兼容/弃用（具体规则建议）

- **两契约分离**：`CLI-JSON v1`（`ADV:docs/CLI-JSON.md`，已存在，稳定）+ `Pet Brief schemaVersion 1`（v0.1 design contract，**发布 `.71` 前冻结为 v0.2 或 1.0**）。
- **兼容矩阵**：消费者声明支持版本集合；生产者只产最新版；未知 `schemaVersion`/未知字段 ⇒ 整份丢弃 + idle（现行行为，保留）。
- **弃用**：在 `docs/CONTRACTS.md` 记录 `status: design|frozen|deprecated`、弃用版本、sunset release；改字段必须同步双仓向量与 `docs/PET-BRIEF-PRODUCER.md`。
- **验证**：Advisers CI 跑 20 条契约向量；DG CI 继续跑消费端 12 条；两仓契约快照记 SHA。

## 4. Pet Brief producer：是否干扰核心？

| 维度 | 证据 | 判定 |
|---|---|---|
| 位置 | `packages/advisers/lib/pet-brief.js`（581 行）+ `pet-brief-store.js`；仅 `bin/advisers.js` import；`index.js` 不导出；不在 `advisers-core` | ✅ 不在核心；属于 CLI 发行层 |
| 依赖 | 仅 `node:fs/path` + 本地 `remind.js`；无新依赖；SQLite 以 `readOnly:true` 打开 | ✅ 零耦合 |
| 行为 | 纯投影、无网络/模型/写；`secrecy>=2` 全排除、confidence<0.7 丢弃、人名脱敏、TTL 5min、≤10 项 | ✅ 符合只读边界 |
| 文档 | 仅 `docs/PET-BRIEF-PRODUCER.md` + handoff；README/README-zh/CHANGELOG **均未提及** | ⚠️ 未进产品叙事（`.71` 需补） |
| 测试 | producer 18 个；20 条契约向量只在 DG 消费端（12 测试）；Advisers CI 无向量 | ⚠️ 契约自证不足 |
| 发布 | staged `.70` 不含；当前工作树 pack-smoke 35 files 含它；`.71` 未 bump/stage | ❌ 用户不可达 |
| 契约 | canonical 私有 famling；Advisers 文档引用 DG 本地绝对路径 | ❌ 契约所有权倒挂 |

**结论：不算"干扰核心"，是"可选只读输出适配器"。建议保留在 `packages/advisers`，不搬独立包。**

- 保留理由：① 拆包会迫使 producer 通过不稳定的跨包内部 API 拿 `LedgerSnapshot`（耦合更差）；② 多一个包 = 多一条发布链，而当前发布链已卡 OTP；③ 18 测试与零依赖的成本可忽略。
- 保留条件：不新增依赖/不联网/不写；不进 `index.js` 公共导出；不进 core；**契约+20 向量入库后由 Advisers CI 验证**；README/CHANGELOG 明确"可选"，核心测试不得依赖它。
- 何时搬：出现**第 2 个消费者**或 schema 频繁演进时，抽 `packages/pet-brief-adapter`（或独立公开契约包）。

## 5. 桌宠作为 Advisers 形象：边界与失败隔离

### 5.1 能力归属

| 能力/数据 | 归属 | 约束 |
|---|---|---|
| 记忆/事实/承诺写入（ledger commit、evidence、人工 accept、audit hash chain） | **Advisers 独占** | 桌宠不得写账本；v2 写操作必须显式确认 + 审计 |
| secrecy/脱敏/失败闭合策略 | **Advisers producer**（consumer 只做二次过滤） | schema 无 secrecy 字段，消费者不得自行推断 |
| Office 交付/验收（verify/receipt） | **Advisers** | 与桌宠无关 |
| 许可/发布/版本/契约 | **Advisers** | 桌宠镜像不得反向定义 |
| 渲染/动作/气泡/静音时段/预算/去重/开关/只读面板 | **桌宠表现层** | 不携带姓名/自由文本进渲染（现行 `suggestedLines` 只做 claims guard，不入投影） |
| 人格/台词/语音（baked） | **桌宠** | 不写记忆、不进 brief、不做情感/亲密度字段 |
| 存档/本机偏好 | **桌宠** | 不存账本内容/客户数据 |
| 传输（轮询固定文件） | **桌宠** | Advisers 不主动调用桌宠、无 daemon |

### 5.2 失败隔离

| 场景 | Advisers | 桌宠 |
|---|---|---|
| Advisers 未安装/旧版本 | 完整 CLI 可用 | `no-file` → idle；摸/拖/说/存档照常（`DG:src/pet/advisers/face.ts:1-9`） |
| brief 过期/非法/缺文件 | CLI 不受影响；`--check` 可自证 | `stale`/`invalid` → 无 directive，不补发、不编造 |
| 桌宠关闭/崩溃 | 不受影响（无共享进程/DB、无 daemon） | 普通宠物功能自恢复 |
| 契约版本不匹配 | producer 仍可生成/校验 | 整份拒绝 → idle（fail-closed） |

### 5.3 形象范围（建议）

- **v0（已实现）**：只读 brief → 状态/面板/气泡；可选开关；普通宠物行为独立。当前缺口（MASTER-STATUS:60）：WSL/Windows 路径不一致导致固定路径永远 `no-file`、无定时刷新、过期 brief 面板仍显示旧内容、二进制未含 v0、默认入口非桌宠 —— 属**桌宠侧 P1**，不阻塞 Advisers。
- **v1（可做）**：只读 CLI JSON（today/commit/who）问答；费用提示；不做常驻 LLM、不读 DB。
- **v2（需拍板）**：双向写（宠物说"提醒我 X"→ 经 Advisers CLI + 显式确认 + 审计）；**禁止**宠物自动改账本/发邮件/承诺。
- **明确不做**：情感陪伴/恋爱人格、读私有聊天、把 CoT/客户文件/原始账本交给表现层。

## 6. 优先级与需用户拍板

### P0（发布/契约/许可口径，先做）

1. **许可对象确认**：Advisers 保持 MIT（推荐）/ 双许可 / Apache-2.0；同时确认 "Apache-2.0" 是否只指 Famling 层。用户书面确认前不对外宣称 Apache-2.0。
2. **`.71` 发布链**：bump `advisers@0.71` + CHANGELOG/README 增加 Pet Brief（标"可选只读适配器"）+ 跑 test/build/typecheck/pack-smoke/check-docs/security-suite + stage（approve 由用户 OTP）；**不要 approve 不含 Pet Brief 的 `.70`**。
3. **契约入库**：把 Pet Brief 4 文件 + 20 向量 vendor 进 Advisers 仓，CI 跑向量；决定 canonical（推荐 Advisers 公开仓，famling 降为消费端）。
4. **三端/独立仓核实**：用 token `git ls-remote` 核对 GitHub/Gitee/GitCode；确认无共享 remote/代码；确认 DG 私有远端配置（本机 `.git/config` 无 remote）。
5. **独立契约文档 + 守卫**：新增 `ADV:docs/CORE-INDEPENDENCE.md`；加"core 不得 import pet/UI"测试；删除/标注 DG `advisers-source.ts` 遗留直读路径。

### P1

1. 更新 `ADV:docs/PET-BRIEF-PRODUCER.md`（所有权/可选状态/DG v0 已接）；README/CHANGELOG 同步。
2. `docs/CONTRACTS.md` + 版本协商/弃用窗口 + 双仓 SHA pin。
3. 桌宠侧 bug：定时刷新、Windows `%USERPROFILE%\.advisers` 路径、过期面板隐藏、真实 brief E2E（DG 内）。
4. 许可完整性：补 `link-email/LICENSE`、补 `docs/RELEASE-EVIDENCE.md`（CONTRIBUTING 引用但缺失）、生成依赖许可清单。
5. DG README 许可矩阵补"Advisers（独立仓，MIT）"一行，避免跨仓误读。

### P2

1. 第二消费者出现再拆 `pet-brief-adapter` 包。
2. 若品牌去耦：schema v2 把 "Pet Brief" 改中性名（保留 v1 兼容）。
3. Trusted Publishing（OIDC）替代人工 OTP stage。
4. 多角色 `audience`/单投影器（桌宠内部协议，不进 Advisers）。
5. 全历史版权/贡献者审计工具（重许可前置）。

### 需要用户拍板（建议项）

| # | 决策 | 建议 |
|---|---|---|
| U1 | Advisers 许可：MIT / MIT OR Apache-2.0 / Apache-2.0 | **保持 MIT**（符合 2026-11-14 决定）；若要专利条款用双许可 |
| U2 | "Apache-2.0" 是否指 Advisers | 现有证据只支持 **Famling 桌宠层**；请确认口径 |
| U3 | 契约 canonical 位置 | 移到 **Advisers 公开仓**；famling 变消费者 |
| U4 | 发布：先 `.70` 还是必须 `.71` | **必须 `.71`**（`.70` 不含 Pet Brief） |
| U5 | 形象范围：v1 只读问答 / v2 写入 | v1 可做；v2 仅"显式确认+审计"的窄写路径 |
| U6 | 是否在 Advisers 文档宣传桌宠集成 | 建议只写"可选只读消费者"，不作为核心卖点 |

## 7. 文档清单

| 文件 | 动作 | 内容 |
|---|---|---|
| `ADV:docs/CORE-INDEPENDENCE.md` | 新增 | 5 条边界、Cordis↔DSH 类比、消费者清单、失败隔离 |
| `ADV:docs/CONTRACTS.md` | 新增 | CLI-JSON v1 / Pet Brief 版本注册表、兼容/弃用政策 |
| `ADV:docs/contracts/pet-brief/` | 新增（vendor） | 契约 md/schema/example/20 向量 + 来源 SHA + 所有权 |
| `ADV:docs/PET-BRIEF-PRODUCER.md` | 修改 | 所有权/可选状态/DG v0 已接/向量 CI |
| `ADV:README.md`、`README-zh.md`、`CHANGELOG.md` | 修改 | `.71` 条目；Pet Brief 标"可选只读适配器" |
| `ADV:CONTRIBUTING.md` | 修改 | 加"禁止 core import pet/UI"；若重许可补 DCO/CLA |
| `ADV:docs/PLUGIN-BOUNDARY.md`、`docs/ARCHITECTURE.md` | 修改 | 增"外部只读消费者"一节 |
| `DG:docs/ADVISERS-FACE-INTEGRATION.md` | 修改 | 增 §9 指向独立契约；标注契约 pin |
| `DG:docs/contracts/pet-brief/README.md` | 修改 | 消费者定位、不变更契约、pin SHA |
| `DG:docs/research/ADVISERS-INDEPENDENCE-2026-11-16.md` | 新增 | 本文（研究/决策入口） |
| `ADV:docs/RELEASE-EVIDENCE.md` | 新增/修正 | CONTRIBUTING 已引用但文件缺失 |

## 8. 证据索引与局限

- 关键证据：`ADV:LICENSE`、`ADV:packages/*/package.json`、`ADV:docs/<private-doc>.md:54-110,169-176`、`ADV:packages/advisers/lib/pet-brief.js:1-26`、`ADV:packages/advisers/lib/pet-brief-store.js:1-7`、`ADV:packages/core/test/architecture.test.ts:8-22`、`ADV:.github/workflows/{ci,publish}.yml`、`ADV:docs/PET-BRIEF-PRODUCER.md`。
- `DG:docs/contracts/pet-brief/{README.md,SOURCE.md,PET-BRIEF.md,pet-brief.schema.json,pet-brief.testcases.json}`、`DG:src/presence/pet-brief.ts:1-30`、`DG:src/pet/advisers/face.ts:1-9`、`DG:app/tauri/src-tauri/src/main.rs:85-102`、`DG:docs/LICENSE-AND-NAME-PLAN-2026-11-14.md:6-16`、`DG:README.md:190-201`、`DG:docs/LEGAL-STATUS-2026-11-15.md:62`、`DG:docs/MASTER-STATUS-2026-11-16.md:49,60`。
- 局限：本轮**未联网**，npm stage/dist-tags、CI run、三远端状态均为交接记录，执行前需 token 复核；**未跑测试**（遵守只读约束）；`.git` 只读文件推断，未跑 `git log/shortlog`，重许可前仍需正式版权审计。
