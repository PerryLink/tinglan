# 兼容性与版本（FCI / 包 / 渲染器）

Status: **作者文档（2026-11-15，DRAFT）**。本文区分「已冻结事实」与「建议政策」；政策部分未经发布决策，不能当承诺。
相关：[README](README.md) · [CHARACTER-INTERFACE-V0.2](../CHARACTER-INTERFACE-V0.2.md) · [CHARACTER-INTERFACE-V0.3](../CHARACTER-INTERFACE-V0.3.md) · [CHARACTER-VALIDATION](../CHARACTER-VALIDATION.md) · [CHARACTER-INTERFACE](../CHARACTER-INTERFACE.md)

## 1. 六个版本域（别混）

| 域 | 字段/常量 | 当前值 | 含义 |
|---|---|---|---|
| 角色接口 | `character.json.apiVersion` | `0.1` / `0.2`（0.3 预览） | 角色文档结构版本；MAJOR.MINOR |
| 运行时能力 | `minRuntime` | semver（如 `0.1.0`） | 包要求的最低 FCI 运行时 |
| 内容包版本 | `character.json.version` | semver | 你的包内容版本（id 不变只递增） |
| 行为协议 | `behavior.json.profile` | `famling.behavior/0.1` | 行为档协议（0.2/0.3 均未改） |
| 渲染器 API | 插件 `apiVersion` | render API `1.2`（窗口 1.1–1.2，legacy 整数 1） | 第一方插件契约；仅官方 |
| DLC 内容包 | `manifest.contentApi` + `minBase` | `contentApi:1` + semver | **另一套**签名 DLC 包（packs/），不要与 FCI 混用 |

`apiVersion` ≠ 你的包版本：`apiVersion` 描述“文档结构”，`version` 描述“这次内容更新”。改内容不升 `apiVersion`；改结构才升。

## 2. FCI 版本事实

| FCI | 状态（2026-11-15） | 关键内容 |
|---|---|---|
| 0.1 | 【已实现】冻结基线 | 数据-only 角色文档 + `famling.behavior/0.1`；`expressions`/`sounds` 为保留 free-data |
| 0.2 | 【已实现】冻结 | `render:{format,params}`、`minRuntime`、apiVersion 窗口；渲染插件 `formats`/`capabilities`；schema `character-0.2` |
| 0.3 | 【预览层已实现，运行时未接线】 | `audio[]`/`voice`/`sfx`、`idle`、`zones[]`、`responses[]`、`moods`/`focus`/`schedule`/`timeOfDay`、`extensions` 命名空间；schema `character-0.3`（预览）；**运行时默认窗口仍是 0.1/0.2，不加载 0.3** |

- 运行时接受列表：`CHARACTER_API_VERSIONS = ['0.1','0.2']`（`src/pet/character/types.ts`，**出厂契约不变**）；0.3 由预览层 `validateCharacterDocumentV03()`（`src/pet/character/v03.ts`，`FCI_V03_API_VERSIONS=['0.1','0.2','0.3']`）+ CLI 接受。
- `CHARACTER_RUNTIME_VERSION = "0.2.0"`；`KNOWN_RENDER_FORMATS = ['pixel-hero','pixel-micro','hd-chibi']`（内置）。
- 0.2 是 0.1 的**超集增量**：0.1 包不改可继续加载；0.2 包在 0.1 运行时拒载（预期）。

## 3. 协商规则（加载/校验时）

1. **FCI MAJOR 必须精确相等**；MINOR 落在窗口 `[0.1 .. 0.2]`。0.3（MINOR 更新）在 0.2 运行时拒载：`newer than this runtime ... upgrade the runtime`；1.0 拒载：`MAJOR must match exactly`。
2. **`minRuntime <= 运行时版本`** 才加载；否则 `requires runtime >= ...`。
3. **`render.format` 必须是宿主已注册格式**；未知格式拒载并列出已注册列表。0.2 包缺 `render` → 推断 `pixel-hero` + `RENDER_INFERRED` 警告（CLI `--strict` 视为错误）；新包必须显式写。
4. **行为协议** 0.1 由 0.2 运行时原样接受；不要私改 `profile` 字符串。
5. **0.3 文档**在 0.2/0.1 运行时**拒载**（apiVersion 不在接受列表）。作者可先用 CLI `--strict` 校验，但不能宣称“0.2 运行时可用”。

## 4. 兼容矩阵

| 你的产物 | 0.1 运行时 | 0.2 运行时（当前） | 0.3 预览校验 CLI |
|---|---|---|---|
| FCI 0.1 包（无 render） | 加载 | 加载（默认 pixel-hero） | ✅ |
| FCI 0.2 + 已注册 format | 拒载 | 加载 | ✅ |
| FCI 0.2 + 未知 format | 拒载 | 拒载（列已注册） | ✅（`--format NAME` 临时放行） |
| FCI 0.3 作者文档 | 拒载 | **拒载** | ✅（含 `VOICE_*`/`ZONE_*` 检查） |
| 渲染插件 apiVersion `1`/`1.1`/`1.2` | — | 绑定 | — |
| 渲染插件 apiVersion `1.0`/`1.3`/`2.0` | — | 拒绑 | — |

## 5. 迁移

**0.1 → 0.2**（作者视角，仅当你需要新能力）：
1. `"apiVersion": "0.2"`；2. 加 `"render": {"format": "pixel-hero"}`（或宿主已注册格式）；3. 按需加 `minRuntime`；4. behavior 不动；5. `validate-character.mjs <dir> --json --strict`。
不迁移也可以：0.1 包在新运行时继续加载（走默认 pixel-hero）；发布说明注明所需运行时版本即可。

**0.2 → 0.3**（**预览阶段，别急着迁移**）：0.3 是增量字段（`audio/voice/sfx/idle/zones/responses/...`），但运行时尚未消费；迁移会失去 0.2 运行时的可加载性。建议：保持 0.2 发布，另存 0.3 预览分支；等官方宣布运行时支持 0.3 再切。`extensions` 键在 0.3 必须是命名空间（含 `.`，如 `x.yourname.fork`），且 `extensionsRequired` 的键必须已在 `extensions` 声明（`EXTENSION_NAMESPACE`/`EXTENSION_REQUIRED_UNKNOWN`）。

## 6. 包版本与 ID（建议政策，DRAFT）

- `id` 稳定不变；改 ID = 新角色/新包（注册表会拒绝重复 id）。
- `version` 用 semver：修 bug/换帧→PATCH；加动作/语音/行为→MINOR；删/改字段语义、改变兼容性→MAJOR（同时升 `minRuntime` 或 `apiVersion`）。
- 每个发布版本写 `CHANGELOG`（新增/修改/删除/已知问题）；弃用字段先在文档标「deprecated」并在校验器给 warning，至少保留一个 MINOR 再改 error/删除（**建议，尚无正式弃用流程**）。
- DLC 内容包用 `contentApi`（整数 ABI）+ `minBase`（宿主最低版本）+ `files[].sha256` + Ed25519 签名；与 FCI 包是**两条发布通道**。

## 7. 弃用与兼容承诺（现状 = 无正式承诺）

- 已冻结保留：`character-0.1.schema.json`、`character-0.2.schema.json`（0.1 不会被删除）。
- render API：v1 的 2D context 契约不动；MAJOR bump 才会破坏（如真 3D/WebGL 直出）。
- 新增渲染格式/能力只能走 MINOR；移除/改语义必须 MAJOR + 迁移说明。
- 项目目前**没有**正式 LTS/弃用窗口/版本支持表；本文件 §6 是作者侧建议，发布决策以官方 CHANGELOG/README 为准。

## 8. 测试矩阵（每个版本提交前）

| 检查 | 命令 | 覆盖 |
|---|---|---|
| 角色包严格校验 | `node --import tsx scripts/validate-character.mjs <dir> --json --strict` | schema/数据性/行为引用/tag/pack/PNG/许可/AI |
| 0.2 迁移 fixture | `node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v02/humanoid-v02 --json --strict` | 0.2 显式 render |
| 未知格式负例 | `node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v02/unknown-format --json` | 预期 exit 1 / `RENDER_FORMAT_UNKNOWN` |
| 0.3 预览 fixture | `node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v03/tinlan-v03 --json --strict` | 0.3 `audio/voice/zones/responses` 声明 |
| 0.3 预览（自建包） | 同上 `<0.3 包> --strict` | `VOICE_*`/`AUDIO_*`/`ZONE_*` 等 |
| 代码回归 | `npm test`（含 `fci-v02.test.ts`、`behavior-traces.test.ts`、`render-plugin.test.ts`） | 运行时/行为/插件契约 |
| 类型/构建 | `npm run typecheck`、`npm run build` | TS 与打包 |

CI 已在 `ci.yml` 跑 `fci:validate`（0.1 严格）；0.3 校验进 CI 由该预览任务落地后追加——写文档时别假设 CI 已覆盖 0.3。

## 9. 作者发布清单

- [ ] `apiVersion` 与实际字段匹配（0.2 必须显式 `render.format`）。
- [ ] `version` 递增且内容确实变了；`minRuntime` 与所需能力一致。
- [ ] `id` 非官方前缀、全局唯一；改版带 `meta.basedOn`。
- [ ] `license` 与 `ai` 已填（strict 强制）；素材来源可追溯。
- [ ] 校验命令全绿；0.3 预览包单独标注「预览，运行时未支持」。

## 10. 允许 / 禁止 / 必须保留的声明

**允许**：在 0.1/0.2 之间按需迁移；为未来 0.3 提前写预览包并本地校验；给官方提能力/格式需求。
**禁止**：伪造 `apiVersion` 让旧运行时装新包；把 0.3 预览包标成「当前可用」；私改 `famling.behavior/0.1` 语义；复用他人 `id` 发布「更新」；绕过 `minRuntime` 声称兼容。
**必须保留**：`minRuntime` 真实填写；发布说明注明所需运行时/FCI 版本；旧版本包不被静默删除（保留历史版本与许可）；非官方声明与作者署名；0.3 预览标注与迁移说明。
