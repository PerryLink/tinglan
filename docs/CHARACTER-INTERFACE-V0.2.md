# Famling Character Interface v0.2（已实现）

Status: **v0.2 接口已实现**（2026-11-15，纯增量：未接 `pet.html`/`main.ts`，未改 kernel/存档/语音，未生成美术，未调外部 API）。
Related: [CHARACTER-INTERFACE.md](CHARACTER-INTERFACE.md)（v0.1 基线，继续有效）· [CHARACTER-INTERFACE-V0.3.md](CHARACTER-INTERFACE-V0.3.md)（0.3 语音/音频/待机/交互区/回应**预览层**，出厂契约仍是本文）· [CHARACTER-VALIDATION.md](CHARACTER-VALIDATION.md) · [research/PLUGIN-PLATFORM-ROADMAP.md](research/PLUGIN-PLATFORM-ROADMAP.md)（§2.3 预留点 A/B/C/F）· [PET-EXTENSIBILITY-ARCHITECTURE-2026-11-14.md](PET-EXTENSIBILITY-ARCHITECTURE-2026-11-14.md)

## 0. 一句话

v0.2 把「角色包用哪个渲染器」「包与运行时的版本契约」「渲染器插件的版本/能力契约」三件事**冻结成结构**；默认角色仍是 0.1 且照常加载，Live2D/Spine 只留接口、不实现。

范围（本版只做结构冻结）：
- 包侧：`apiVersion: "0.1" | "0.2"`、可选 `render: {format, params?}`、`minRuntime` 协商。
- 插件侧：`apiVersion` 协商（MAJOR 精确 + MINOR 窗口）、可选 `formats` / `capabilities`、`RendererRegistry.formats()`。
- 校验侧：`content/schema/character-0.2.schema.json`（0.1 保留）、validator CLI 按 `apiVersion` 自动选 schema。
- 兼容：0.1 包/默认角色/行为档 `famling.behavior/0.1` 全部不变；新增 v0.2 测试 fixture 与 17 项测试。

明确不做（见 §10）：签名/哈希/打包 manifest、Live2D/Spine 渲染器本体、`paramsSchema` 求值、`RenderTarget` 联合、atlas/音频/i18n/依赖、`interactions` outcome。

## 1. 包侧字段（`CharacterDocument`）

### 1.1 `apiVersion`：`"0.1" | "0.2"`

- 本文中的 `apiVersion` 就是**角色接口版本**（未来打包 manifest 的 `characterApi` 与之对齐；roadmap §3 的 `characterApi` 是同一概念）。
- 运行时接受列表：`CHARACTER_API_VERSIONS = ['0.1', '0.2']`（`src/pet/character/types.ts`）。
- 协商规则：**MAJOR 必须精确相等**；**MINOR 落在窗口内**（当前 `0.1 .. 0.2`）。即：新运行时读旧包（0.1 必跑）；旧运行时不读新包（0.2 拒载，需升级运行时）。
- 默认角色 `public/characters/**` **保持 0.1，不改**；v0.1 文档不会被运行时改写、不需要 `render`。

### 1.2 `render`：渲染器选择（可选，0.2 新增）

```jsonc
"render": {
  "format": "pixel-hero",          // 必填；必须是宿主已注册的渲染格式
  "params": { "crisp": true }      // 可选；纯 JSON 数据，渲染器私有
}
```

- `format` 是**数据格式族**，不是插件 id：角色包只能**选择**宿主已注册的格式，不能引入渲染器（边界见 roadmap §2.2）。
- 内置格式（与 hero.ts pack 的 `style` 对应，`KNOWN_RENDER_FORMATS == HERO_PACK_FORMATS`，有测试锁定）：
  `pixel-hero` / `pixel-micro` / `hd-chibi`。
- **未知格式拒载**，错误信息带已注册列表，例如：
  `render.format "live2d-model3" is not registered by this runtime; registered formats: [pixel-hero, pixel-micro, hd-chibi]`。
  宿主接入第一方 Live2D/Spine 插件后，把该插件 `formats` 并入注册表即可放行（见 §3、§4）。
- `params`：数据性由校验层强制（递归拒绝函数/undefined/symbol/bigint/NaN、拒绝任意层级 `script/scripts/eval/code/execute/permissions`）；语义由该渲染器插件的 `capabilities.paramsSchema` 描述，**v0.2 不求值**（未来钩子，见 §5）。
- `render` 块是封闭对象：除 `format`/`params` 外的键直接报错，防止把渲染器行为塞进包。

**0.2 缺 `render` 的兼容策略**（迁移用）：
- 运行时：按 `meta.style` / `meta.renderFormat`（若为已注册格式）→ `packBase`/`tags` 暗示 `pixel-hero` → 运行时默认 `pixel-hero` 的顺序**推断**，并产生 `RENDER_INFERRED` 警告；返回的文档带归一化后的 `render`（调用方无需再推断）。
- 一个新 v0.2 包**应当显式声明** `render.format`；`scripts/validate-character.mjs --strict` 把缺失当作错误 `RENDER_MISSING`（非 strict 下仅警告）。
- `schema` 层 `render` 仍是可选：只为让 0.1→0.2 迁移期文档可读，而不是鼓励省略。

### 1.3 `minRuntime`：运行时下限（0.2 起真正协商）

- 值：semver `MAJOR.MINOR.PATCH`；与运行时能力版本 `CHARACTER_RUNTIME_VERSION` 比较。
- 当前 `CHARACTER_RUNTIME_VERSION = "0.2.0"`（与 `CHARACTER_API_VERSION` 同步，测试锁定 `= <apiVersion>.0`）。
- 协商：`minRuntime <= runtimeVersion` 才加载；否则拒载：
  `character requires runtime >= 0.3.0, this runtime is 0.2.0`。
- `validateCharacterDocument(raw, { runtimeVersion })` 可注入宿主版本；默认用 `CHARACTER_RUNTIME_VERSION`。
- 语义上它是"**需要的最新 FCI 能力**"，不是应用商店版本号；未来宿主能力扩展时随 `apiVersion` 一起升。

### 1.4 不变字段

`extensions` / `extensionsRequired` 保留（数据性规则不变）；`spec`、`id`、`version`、`type`、`canvas`、`anchor`、`footBox`、`packBase`、`tags`/`assets`、`behavior`/`behaviorFile`、`license`、`ai`、`fallback`、`capabilities`、`interactions`、`display` 等与 0.1 完全一致（schema 0.2 是 0.1 的超集增量）。行为档仍是 `famling.behavior/0.1`，v0.2 不改行为协议。

### 1.5 最小示例（0.2 humanoid）

```jsonc
{
  "spec": "famling.character",
  "apiVersion": "0.2",
  "id": "example.humanoid-v02",
  "version": "0.2.0",
  "type": "humanoid",
  "canvas": [96, 96],
  "anchor": { "x": 48, "y": 96, "mode": "foot-center" },
  "footBox": [-36, -18, 72, 18],
  "packBase": "/assets/pet/pearl-placeholder/",
  "behaviorFile": "behavior.json",
  "render": { "format": "pixel-hero" },
  "minRuntime": "0.1.0",
  "license": "SPDX-or-placeholder-note",
  "ai": { "status": "none" }
}
```

可运行 fixture：`tests/fixtures/fci-v02/humanoid-v02/`（与默认 humanoid 同一美术包，仅升级为 0.2）。

## 2. 版本协商决策表（包侧）

| 文档 | 0.2 运行时行为 |
|---|---|
| `apiVersion: "0.1"` | 加载；无 `render` 时渲染路径按 `pixel-hero` 默认；不产生警告 |
| `apiVersion: "0.2"` + 已注册 `render.format` | 加载 |
| `apiVersion: "0.2"` + 未知 `render.format` | 拒载（`CharacterInterfaceError`，带已注册格式列表） |
| `apiVersion: "0.2"` 无 `render` | 加载 + 推断 `pixel-hero` + `RENDER_INFERRED` 警告（CLI `--strict` 视为错误） |
| `apiVersion: "0.3"`（MINOR 更新） | 拒载：`newer than this runtime ... upgrade the runtime` |
| `apiVersion: "1.0"`（MAJOR 不同） | 拒载：`MAJOR must match exactly` |
| `apiVersion: "0.0"`（窗口外旧包） | 拒载：`older than the supported window` |
| `minRuntime` 高于运行时 | 拒载：`requires runtime >= ...` |
| `minRuntime` 低于/等于运行时 | 加载 |

实现：`validateCharacterDocument()`（`src/pet/character/validate.ts`）；查询用 `negotiateCharacterApiVersion()`、`compareSemver()`、`isRuntimeVersionSatisfied()`、`resolveRenderFormat()`。

## 3. 渲染器插件接口（render API v1.2）

代码：`src/pet/render/{types,registry}.ts`、`src/pet/render/hero-backend.ts`。

### 3.1 版本模型

| 常量 | 值 | 含义 |
|---|---|---|
| `RENDER_API_VERSION` | `1` | 旧版整数 MAJOR（既有插件 `apiVersion: 1` 原样有效） |
| `RENDER_API_MAJOR` / `RENDER_API_MINOR` | `1` / `2` | 宿主 render API 版本 |
| `RENDER_API_HOST_VERSION` | `"1.2"` | 协商用宿主版本 |
| `RENDER_API_MINOR_WINDOW` | `1` | 兼容窗口：接受 `1.1`、`1.2`（以及 legacy 整数 `1`） |

插件/后端 `apiVersion` 可写：
- **整数**（legacy）：声明"MAJOR 1 的任意受支持 MINOR"，绑定成功；
- **`"MAJOR.MINOR"` 字符串**：MAJOR 必须等于宿主；MINOR 必须在 `[hostMinor - window, hostMinor]` 内。

拒绝规则：MAJOR 不等（如 `"2.0"`）、MINOR 更新（`"1.3"`）、MINOR 落在窗口外（`"1.0"`）均抛
`RendererRegistryError`，消息带宿主版本与原因。`create()` 创建的 `RenderBackend.apiVersion` 用同一规则协商（不再要求数值相等）。

v1.1 → v1.2 是**增量**（只加可选字段），所以旧 v1 插件不改也能绑定；未来不兼容改动必须升 MAJOR。

### 3.2 可选 `formats`

```ts
interface RendererPlugin {
  readonly formats?: readonly string[]   // 例如 ['live2d-model3']
  // ...
}
```

- 声明后成为**格式 allowlist + `match()` 双重判定**：`resolve(pack)` 先按 `formats.includes(pack.format)` 预筛（未命中不调用 `match()`），命中后再调 `match()` 确认。
- 未声明 `formats` 的插件沿用旧行为（只看 `match()`）。
- `RendererRegistry.formats()` 返回所有声明格式的并集（排序去重），宿主应把它传给
  `validateCharacterDocument(raw, { renderFormats: registry.formats() })`，从而保证**角色只能选择真实存在的渲染器**。
- 注册时校验：非空数组、格式名 `^[a-z0-9][a-z0-9._-]{0,63}$`、不能重复。

### 3.3 可选 `capabilities`

```ts
interface RendererCapabilities {
  offscreenComposite?: boolean               // backend 走私有离屏 canvas/GL stage 再合成
  hitTest?: boolean                          // 实现 RenderBackend.hitTest()
  paramsSchema?: Record<string, unknown>     // JSON Schema 形状的数据，描述渲染器 params（v0.2 只存不验证）
}
```

- 注册时校验：对象、键在白名单内（拼错即报错）、布尔字段类型、`paramsSchema` 必须是**纯 JSON 数据**（递归拒函数等）。
- `create()` 交叉检查：声明 `hitTest: true` 但后端没实现 `hitTest()` → `RendererRegistryError`。
- hero 插件已声明：`formats: ['pixel-hero','pixel-micro','hd-chibi']`、`capabilities: { offscreenComposite: true, hitTest: true }`。

### 3.4 解析与错误

- `registry.resolve(pack)`：零匹配 → `UnknownPackError`（消息含 pack id/format、`registered plugins: [...]`、`registered formats: [...]`）；多匹配 → `RendererConflictError`。
- `registry.create(pack)`：后端结构/版本/能力不合法 → `RendererRegistryError`（消息含插件 id、后端 id、宿主版本与原因）。

### 3.5 注册流程（v0.2 冻结结构，allowlist 属下一阶段）

v0.2 只固定**静态注册**形态；roadmap §2.3-E 的构建期 allowlist/签名是后续工作：

1. 第一方插件放 `src/pet/render/`（或未来 `src/pet/render/rendererPlugins.ts`），导出插件常量；
2. 启动时 `new RendererRegistry([heroRendererPlugin, ...])` **静态注册**；无目录扫描、无动态下载/热加载/eval；
3. 构建期为 allowlist 生成 `{id, apiVersion, hash}`（roadmap E20/P1），与签名 release 绑定；
4. 社区只能产出**数据包**；插件永远随 app 编译（`origin: 'first-party'` 是唯一取值）。

## 4. 为 Live2D/Spine 第一方渲染器预留（**只冻结接口，不实现**）

| 预留项 | v0.2 状态 | 未来接入方式 |
|---|---|---|
| 包侧格式 | `render.format` 已冻结；校验要求格式已注册 | 新格式如 `live2d-model3` / `spine-json`，**只升 MINOR**，不给已有字段改语义 |
| 插件声明 | `formats` / `capabilities` 已冻结 | `{ id:'live2d-cubism', formats:['live2d-model3'], capabilities:{ offscreenComposite:true, paramsSchema:{...} } }` |
| 渲染方式 | `render(ctx: CanvasRenderingContext2D, view, nowMs)` 不变 | 后端把 Cubism/Spine 渲染到私有 stage，再 blit 进宿主 2D context（与 hero 后端同路径）；`offscreenComposite` 声明能力 |
| params | `render.params` 数据已通 | 插件 `paramsSchema` 描述形状；未来宿主可拿它做包侧预检（v0.2 不实现求值） |
| 命中测试 | `hitTest` 能力位已冻结 | Spine/Live2D 可返回包围盒或 alpha 命中；不实现时声明 `hitTest:false` |
| 渲染目标 | v1 目标固定 2D context | 真 3D/WebGL 直出需要 `RenderTarget` 联合 = **MAJOR bump**，不属 v0.2 |
| 许可/分发 | — | Live2D/Spine SDK 许可与版本强锁是集成前置条件（roadmap §4.3/E25） |

接入一个新格式的完整步骤（未来）：实现 backend（load/render/dispose，可选 hitTest）→ 实现 plugin（`origin:'first-party'`、`formats`、`capabilities`、`match/create`）→ 契约测试（`tests/render-plugin.test.ts` 模式）→ 注册进静态插件数组 → 进 allowlist/签名 release → 包侧才能写该 `render.format`。

## 5. 校验（Schema + CLI）

- Schema：`content/schema/character-0.1.schema.json`（**保留，冻结**）与新增 `content/schema/character-0.2.schema.json`（0.1 增量：`apiVersion.const="0.2"`、`render` 块；其余定义一致）。
- `scripts/validate-character.mjs` 默认**按 `apiVersion` 自动选 schema**（0.1→0.1，0.2→0.2）；`--schema PATH` 仍可强制单一 schema（测试草稿 schema 用）。
- 新增 `RENDER_MISSING`（0.2 缺 `render.format`：strict=错误，否则警告）、`RENDER_FORMAT_UNKNOWN`（格式未注册）、`API_VERSION_UNKNOWN`（apiVersion 不在支持列表）。
- `--format NAME`（可重复）把未来第一方格式加入本次校验的注册表（CI/插件开发用）。
- `--json` 新增字段：顶层 `apiVersion`（校验器 FCI 版本）、`supportedApiVersions`、`renderFormats`；每个 target 的 `apiVersion`、`schema`、`checks.render = {format, source, registered, params}`。
- 0.1 行为保持：默认 4 个角色 `--strict` 仍 `0 error / 0 warning`。

```bash
# 0.1（不变）
node --import tsx scripts/validate-character.mjs public/characters/humanoid-default --json --strict
# 0.2 fixture
node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v02/humanoid-v02 --json --strict
# 未知格式（预期 exit 1，RENDER_FORMAT_UNKNOWN / RUNTIME_INVALID）
node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v02/unknown-format --json
# 插件开发期临时放行新格式
node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v02/unknown-format --format live2d-model3
```

## 6. 迁移指南（作者视角：0.1 → 0.2）

1. `apiVersion` 改为 `"0.2"`；
2. 加 `"render": { "format": "pixel-hero" }`（有 `packBase` 或 pixel 内联 `tags` 的包；其他格式等宿主插件）；
3. 按需加 `minRuntime`（如 `"0.2.0"`；不需要新能力可省略）；
4. 跑 `node --import tsx scripts/validate-character.mjs <dir> --json --strict`；
5. `behavior` 不用动（仍 `famling.behavior/0.1`）；`extensions`/`extensionsRequired` 不变。

不迁移也可以：0.1 包在新运行时**继续加载**，只是渲染格式走默认 `pixel-hero`。反向不保证：0.2 包在 0.1 运行时会被拒载（预期行为，发布说明需注明所需运行时版本）。

## 7. 兼容矩阵

| 包 | 0.1 运行时 | 0.2 运行时 |
|---|---|---|
| 0.1 包 | 加载 | 加载（渲染默认 pixel-hero） |
| 0.2 包 + 已注册 format | 拒载（apiVersion） | 加载 |
| 0.2 包 + 未知 format | 拒载 | 拒载（并给已注册列表） |
| 0.2 包无 render | 拒载（apiVersion） | 加载 + `RENDER_INFERRED` 警告 |
| 插件 apiVersion 1（整数）/ `1.1` / `1.2` | — | 绑定 |
| 插件 apiVersion `1.0` / `1.3` / `2.0` | — | 拒绑（窗口外/更新/MAJOR 不等） |

## 8. 实现位置

| 文件 | v0.2 变更 |
|---|---|
| `src/pet/character/types.ts` | `CharacterApiVersion`、`CHARACTER_API_VERSIONS`、`CHARACTER_RUNTIME_VERSION`、`KNOWN_RENDER_FORMATS`、`CharacterRenderSpec`、校验选项/警告类型 |
| `src/pet/character/validate.ts` | apiVersion 协商、render 校验/推断、minRuntime 协商、`validateCharacterDocumentDetailed`、`resolveRenderFormat`、`compareSemver` |
| `src/pet/character/index.ts` | 导出上述常量/类型/函数 |
| `src/pet/render/types.ts` | render API 1.2 协商常量/函数、`RendererCapabilities`、插件 `formats`/`capabilities` |
| `src/pet/render/registry.ts` | 插件/后端版本协商、formats allowlist、能力校验与 create 交叉检查、`formats()`、错误信息扩展 |
| `src/pet/render/hero-backend.ts` | hero 插件声明 `formats` + `capabilities`（行为不变） |
| `src/pet/render/index.ts` | 导出新 API |
| `content/schema/character-0.2.schema.json` | 新增（0.1 保留） |
| `scripts/validate-character.mjs` | 双 schema 路由、render 检查、`--format`、`--json` 新字段 |
| `tests/fci-v02.test.ts` + `tests/fixtures/fci-v02/*` | 新增 17 项测试 + 0.2/未知格式 fixture |

## 9. 测试与证据

- `tests/fci-v02.test.ts`（17 项）覆盖：常量对齐、0.1 向后兼容、0.2 显式 render、缺 render 推断警告、未知格式拒载、params 数据性、apiVersion 窗口、minRuntime、插件 formats/capabilities 校验、插件 apiVersion 窗口、按格式解析/冲突、capabilities.hitTest 交叉检查、registry.formats() 驱动包校验、`loadCharacter` 加载 0.2 fixture、schema 0.2、CLI 0.1/0.2 路由 + 未知格式/`--format`/`RENDER_MISSING`。
- 回归：`npm test` 全绿（现有 215 项 + 新增 17 项）；`npx tsc --noEmit` 通过；`npm run preflight -- --fast` 通过（typecheck + test + validate:content + verify:pack）。
- 固定预期：未知格式 fixture 的退出码 1 与 `RENDER_FORMAT_UNKNOWN`；0.2 fixture `--strict` 退出码 0 且 `checks.render.source="declared"`。

## 10. 未做 / 下一步（边界）

1. **签名/哈希/打包 manifest**：roadmap E07；`characterApi` 字段随 manifest 一起落地（目前文档内用 `apiVersion`）。
2. **第一方 Live2D/Spine 渲染器**：只冻结接口（§4），不实现、不承诺日期；SDK 许可先决。
3. **`paramsSchema` 求值**：v0.2 只做数据性校验与结构声明；用 JSON Schema 校验包 `render.params` 是未来宿主行为。
4. **`RenderTarget` 联合 / WebGL 直出 / 3D**：需要 render API **MAJOR** bump（v1 2D context 契约不动）。
5. **构建期 allowlist/审核/外置插件包**：roadmap E20/P1-P2；v0.2 只有静态注册 + first-party 硬边界。
6. **atlas / 音频 / 多语言 / dependencies**：仍为 reserved（roadmap §3，P1）。
7. **`extensionsRequired` 拒载**：字段保留，但"不认识就拒载"的宿主扩展注册表属后续（需要签名/信任链）。
8. **CI 接线**：`validate:character` 进 `.github/workflows/ci.yml` 由发布工程线处理（本任务未改 CI）。
9. **默认角色升级 0.2**：`public/characters/**` 本次刻意不动；等美术/打包定稿后随 manifest 一起迁移。
