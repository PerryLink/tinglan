# 安全、信任与提交审核（Security & Contributing）

Status: **作者文档（2026-11-15，DRAFT）**。本文件合并原计划的 `CONTRIBUTING.md`（受本目录 ≤8 文件约束）：§6–§8 是提交/素材/审核流程。
相关：[README](README.md) · [COMPATIBILITY-AND-VERSIONING](COMPATIBILITY-AND-VERSIONING.md) · [DECLARATION-TEMPLATES](DECLARATION-TEMPLATES.md) · [SECURITY-AND-PRIVACY](../legal/SECURITY-AND-PRIVACY.md) · [TAKEDOWN-AND-REPORTING](../legal/TAKEDOWN-AND-REPORTING.md) · [CONTRIBUTOR-TERMS](../legal/CONTRIBUTOR-TERMS.md) · 根 [CONTRIBUTING](../../CONTRIBUTING.md) · [CLA](../CLA.md)

## 1. 一句话模型

**角色包/二创包 = 只读数据（JSON + PNG/WAV/OGG），永不执行代码。** 代码是信任分水岭：任何“脚本化/插件化”的包都不在社区路径内；新动画系统（Live2D/Spine）只能由官方第一方渲染器插件实现（L3，签名+随应用编译）。

## 2. 不执行代码（硬规则）

- 任何层级出现 `script`/`scripts`/`eval`/`code`/`execute`/`permissions` 键 → 拒绝（schema `propertyNames` + CLI 独立递归扫描 + 运行时 `DATA_ONLY`，三重）。
- 包内不得包含可执行/脚本文件：`.js/.mjs/.cjs/.ts/.dll/.node/.exe/.bat/.ps1/.wasm` 等；不得包含动态库/安装器/宏。
- 包不得联网、读文件系统、碰剪贴板/进程/窗口；资源只能从包内相对路径或宿主提供的静态 URL 读取。远程 URL 只允许出现在 `license/credits` 的来源展示中，**不会**被加载。
- 渲染器插件**无目录扫描、无动态下载、无热加载、无 eval**；注册是启动时静态数组，`origin` 仅 `first-party`。社区不能提交可执行插件。

## 3. 路径与资源限制（作者必守）

| 项 | 规则 | 校验 |
|---|---|---|
| 路径 | 相对包根；禁 `..`、绝对路径、UNC、`file://`/`http(s)://`、盘符 | `PACK_PATH_ESCAPE`/`BEHAVIORFILE_ESCAPE`/`AUDIO_PATH` |
| 符号链接/重定向 | 禁止；发布审核会查（Windows 大小写不敏感） | 审核项（CLI 未全自动） |
| 文本/ID | 各字段有长度上限；id 小写 slug；UI 必须转义 | schema `SCHEMA_INVALID` |
| 画布/帧 | `canvas` 16–512；`frames` 1–256；`fps` 0–120；`interactions` ≤32、`actors` 1–4；`extensions` ≤16 | schema/运行时 |
| 颜色 | 默认 ≤41 色（40+透明）；hero 硬上限 48 | `PACK_COLORS`/`--max-colors` |
| fallback | 无环、深度 ≤3 | `FALLBACK_CYCLE/TOO_DEEP` |
| 音频 | 0.3 扩展名白名单 `.ogg/.wav/.mp3/.webm`；`sha256` 64 hex；路径包内相对 | `AUDIO_INVALID`/`AUDIO_PATH`/`AUDIO_HASH_MISMATCH` |
| 总体积/解码炸弹 | **无自动上限（建议审核项）**：发布包应避免超大 PNG（>2048px）、超长/超采样音频、异常帧总量；具体上限以发布规则为准（未定） | 人工审核 |

- 图片：PNG 8-bit、非隔行、尺寸=canvas、二值 alpha；不允许 polyglot（伪装图片夹带代码）。
- 音频：不自动播放、默认可静音；不得用音频做隐藏数据/诱导；0.3 文件存在性检查为 warning，sha256 仅在文件存在时校验。

## 4. 签名与信任（现状 vs 目标）

| 对象 | 现状 | 目标/边界 |
|---|---|---|
| 官方 DLC 内容包（`packs/`） | 【已实现】`manifest.json` + `files[].sha256` + Ed25519 `signature.txt`；`src/pack/` 验签后加载；开发公钥 `packs/keys/dev-public.pem` | 生产私钥离线保管、可吊销；未签名/验签失败拒绝挂载 |
| 角色包（FCI） | **未签名**（0.1/0.2 无签名字段）；WebView2 内验签未打通 | 计划复用 Ed25519/逐文件哈希 + 构建期 allowlist；**未实现** |
| 渲染器插件 | 【已实现】静态注册 + `first-party` 硬边界；allowlist/签名是后续 | 插件永远随 app 编译；社区不提供插件 |
| 未签名二创包 | 本地导入/自担风险（建议导入时二次确认 + 明确无权限） | 默认不自动启用、用户显式信任；**策略未定** |

- 绝不把 API key、私钥、Steamworks SDK、存档/用户数据打进包或仓库。
- 发现密钥泄露：立即撤销/轮换，不写入任何文档/提交/日志（见根 [CONTRIBUTING](../../CONTRIBUTING.md) 与数据安全规则）。

## 5. 审核（发布前）

1. 作者自检：`validate-character.mjs --strict` + `npm test` + 像素/音频检查（§6 命令）。
2. 自动门：JSON/schema/数据性/路径/行为引用/tag 覆盖/PNG/许可/AI 字段；0.3 预览另含 `VOICE_*`/`AUDIO_*`/`ZONE_*`。
3. 人工门：素材权利链（来源/许可/是否 AI）、非官方声明、是否冒充官方、NSFW/敏感内容、体积/解码炸弹、可执行文件扫描。
4. 通过后：进入官方签名/分发通道（DLC）或社区目录（二创）；审核不是安全边界本身，格式约束优先。
5. 下架/举报：见 [TAKEDOWN-AND-REPORTING](../legal/TAKEDOWN-AND-REPORTING.md)；侵权/冒充/恶意包一律可下架。

## 6. 提交与贡献（原 CONTRIBUTING）

**仓库性质**：`desktop-games` 是 **source-available**（PolyForm Noncommercial 1.0.0），不是 OSI 开源；商业使用需单独授权。提交前必须接受 [docs/CLA.md](../CLA.md)（允许再许可/商业条款）并 sign-off：`git commit -s`。

- 禁止提交：私有的游戏/内容/DLC 包、Steamworks SDK、密钥/证书、存档/用户数据、未授权素材、`.rustup-win` 等第三方大二进制。
- 内容改动需跑 `npm run validate:content`；新增引用需补测试；`src/kernel/*` 保持无 Cordis/DOM/fs/Date.now；公开包不得 import `games/`、`content/`、`packs/`。
- 本地检查：`npm test`、`npm run typecheck`、`npm run build`、`npm run fci:validate`；提交 PR 一事一 PR，正文写清范围/验证证据。
- 二创包（不进主仓）也建议附：清单/校验输出、素材来源表、AI 披露、许可文本、非官方声明（[DECLARATION-TEMPLATES](DECLARATION-TEMPLATES.md)）。

## 7. 素材来源与 AI 披露（提交审核口径）

- 每个素材登记：来源/作者/许可/是否修改/是否 AI（参考 [ASSETS](../ASSETS.md)、[CREDITS](../../CREDITS.md)）；许可未知 = 不得提交/发布。
- AI 图像/语音/文本：必须写 `ai.status`（none/assisted/generated）、工具/模型/供应商/日期；0.3 音频另需 `provenance.source`（recorded/synthesized/library/generated/unknown）。
- **禁止**：真人声音克隆；未授权同人图/参考图（含 `art/_private-reference/refs/`）进入发布物；把 AI 图说成手绘/实拍；伪造许可。
- 署名：TASL + Mod + AI；改版保留原作者署名与 `basedOn/forkOf` 链；CC BY-NC-SA 素材不得加 DRM/付费墙/用途限制。

## 8. 报告安全问题 / 侵权

- 安全漏洞：**不要公开 issue 贴利用细节**；等官方公开安全联络渠道后按其流程私下报告（当前仓库无公开 remote/联系页，见 [SECURITY-AND-PRIVACY](../legal/SECURITY-AND-PRIVACY.md)）。
- 侵权/冒充官方/抢注：按 [TAKEDOWN-AND-REPORTING](../legal/TAKEDOWN-AND-REPORTING.md) 提交证据（链接、截图、权利证明）。
- 恶意包：附包 ID/版本/hash 与行为描述；不要运行来路不明的内容。

## 9. 允许 / 禁止 / 必须保留的声明

**允许**：制作/分享纯数据二创包并声明来源；报告漏洞与侵权；在许可范围内分发修改版。
**禁止**：提交/分发可执行代码、脚本、动态库、安装器；绕过数据性校验；冒充官方或审核通过；隐藏 AI 披露/许可；上传密钥/存档/用户数据；抢注角色名/商标/域名/包名。
**必须保留**：`Required Notice`（代码/第三方）；原作者署名与许可；非官方声明；AI 披露；安全/下架联络信息；`CLA`/DCO 签署记录（并入主仓时）。
