# 替换 / 新增动作（动画 tag）

Status: **作者文档（2026-11-15，DRAFT）**。面向 L1 换动作、L2 新角色动作作者。
相关：[README](README.md) · [REPLACE-ART-AND-CHARACTER](REPLACE-ART-AND-CHARACTER.md) · [ADD-BEHAVIOR](ADD-BEHAVIOR.md) · [CHARACTER-INTERFACE](../CHARACTER-INTERFACE.md) · [CHARACTER-VALIDATION](../CHARACTER-VALIDATION.md) · [CHARACTER-INTERFACE-V0.3](../CHARACTER-INTERFACE-V0.3.md)

**运行时现状**：【已实现】`packBase` 的 pack manifest `tags`（frames/fps/loop/phase）+ 帧文件；
【已实现】行为档用 `state.tag` 引用 tag、`fallback` 降级；【预留】内联 `character.json.tags`（schema/CLI 支持，hero 渲染路径要求 `packBase`，不消费内联帧）；【计划 0.3】动画 tag 帧级字段不变，新增 `states.<name>.category` 与 `emote` 引用现有 tag（以 V0.3 接口文档为准）。

## 1. tag 放在哪

| 位置 | 结构 | 谁消费 |
|---|---|---|
| `public/assets/pet/<pack>/manifest.json` → `tags` | `{frames,fps,loop,phase?}` | hero 渲染器【已实现】、校验 CLI |
| `character.json` → `tags` + `assets`（内联） | FCI tag（多 `category/offsets/priority/next`） | schema/CLI/未来渲染器；**当前 hero 运行时要求 `packBase`** |
| `behavior.json` → `states.<state>.tag` | 字符串引用 | 行为运行时 → 渲染 tag |

一个字符的帧文件总量 = 所有 tag 的 `frames` 之和；`assets` 必须按 `tags` 声明顺序逐 tag 列出帧。**改 tag 顺序 = 改 assets 切分**，插入新 tag 请追加到末尾，别在中间插。

## 2. 命名与帧文件规则（【已实现】校验）

- tag 名：小写 slug（建议 `^[a-z][a-z0-9-]*$`）；文件名 `<tag>_<NN>.png`，两位序号从 `_00` 起（非规范命名在 `--strict` 下报错）。
- 帧数 `frames`：1–256；`fps`：0–120（0 = 静止有效）；`loop` 必填布尔。默认 idle 参考：8 帧 @8fps 循环。
- 帧尺寸 = pack `canvas`；PNG 8-bit、非隔行、二值 alpha；颜色限制见 [REPLACE-ART-AND-CHARACTER](REPLACE-ART-AND-CHARACTER.md)。
- `phase`：仅 pack manifest 有，取 `1a|1b|later`，生产阶段标注，不参与播放。
- 新增 tag 若行为档要使用，必须同时改行为档的 state/rule/slot（见 §5），否则 tag 永远播不到。

## 3. 字段与运行时消费矩阵

| 字段 | 取值 | 播放器是否消费 | 说明 |
|---|---|---|---|
| `frames` | 1–256 整数 | ✅ | 帧数 |
| `fps` | 0–120 | ✅ | 0 时停在首帧 |
| `loop` | bool | ✅ | 非循环播到末帧停住 |
| `phase` | 1a/1b/later | ❌（只解析） | 生产阶段 |
| `category` | idle/micro-idle/reaction/expression/locomotion/interaction/sleep/fx（0.3 枚举） | ❌ | 分类/工具用 |
| `offsets` | `[[dx,dy]...]`，长度应等于 frames | ❌（运行时） | 生产期对齐提示，见 §4 |
| `priority` | 0–100 | ❌ | 动画级优先级未接线；实际优先级在行为档 |
| `next` | tag 名 | ❌ | 预留字段，不自动跳转 |

> 结论：**帧 + fps + loop 是唯一真正播放的三要素**；其余字段今天只用于校验/生产对齐，写错不会“自动生效”。

> 官方现役动作只有 **7 个 tag**：`idle/pat/drag/land/talk/remind/sleep`（默认 pack 36 帧）。汀岚设计稿中的 `focus/read/stretch/glasses_adjust/startle/refuse/look_out` 等是**规划，未进 pack/schema/宿主事件**；二创请只依赖现役 7 tag，或在你自己的包里带 fallback。设计背景见 [TINGLAN-CHARACTER-INTERACTION-DESIGN](../TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md)。

## 4. offsets 的真相（最容易误会）

- `offsets` 是**逐帧整数位移提示**，给占位/像素化管线（`scripts/placehold.py`）在生成帧时做上下/左右微动，或给画师对位；`check_specs.py` 只检查长度是否等于 `frames`（warning）。
- **hero 渲染器绘制时不应用 offsets**（`src/pet/hero.ts` 只按帧索引画图）。想让角色真正位移：把位移烘焙进帧像素，或等宿主渲染层实现（未实现）。
- 同理，`tag.priority`/`next` 不是行为优先级/自动衔接；别拿它们替代 `behavior.json` 的规则。

## 5. fallback 与缺失 tag

- `character.json.fallback`：`{ "tag": ["替代tag", ...] }`，**无环**、链深 ≤ 3；CLI：`FALLBACK_CYCLE` / `FALLBACK_TOO_DEEP`。
- 播放解析顺序（`hero-runtime.renderableTag`）：目标 tag 存在 → 用；否则 `resolveFallbackTag` 按 fallback 链逐层找（≤3 层）→ 仍无则 `idle` → 再无不则 pack 第一个 tag。未知 tag **永不进渲染后端**。
- 加载期 `missingTags`：行为档 `states.*.tag` 若不在 pack tags 且 fallback 第一层也给不出，直接启动失败并报 `missing-tags`。CLI 的 `TAG_MISSING`（非 strict 为 warning，strict 为 error）就是同一规则的作者侧提示。
- 新增动作但暂时没画：先在 fallback 指向已有 tag（如 `"wave": ["idle"]`），保证包可加载；画完再删 fallback。

## 6. 行为 state 引用（让新 tag 真的被触发）

```jsonc
// behavior.json 片段：新增 wave
"states": {
  "wave": { "tag": "wave", "priority": 55, "after": "idle" }
},
"rules": [
  { "on": "pat", "to": "wave", "priority": 55, "cooldownMs": 5000, "probability": 0.5 }
]
```

- `state.tag` 是唯一桥；tag 不写进 state = 死资源。
- `after`/`timeoutMs`：【已实现-宿主侧】hero 运行时会按“`timeoutMs` > tag 时长 > oneShotMs”到点回落（`after` 或 `idle`），仅在 `?hero=1` 接线路径生效；`BehaviorRuntime.decide` 本身不回落。`interrupt` 仍是【预留】。详见 [ADD-BEHAVIOR](ADD-BEHAVIOR.md) §4。
- `emote`（0.3）引用 tag 名，替换表情动作可复用同一 tag；`moods.defs.*.emote` 也是 tag 引用（【计划 0.3】，结构校验，运行时未消费）。

## 7. 替换操作步骤（L1）

1. 复制目标 pack 目录，**改 `manifest.json.id`**（不要覆盖官方 pack），保留 `canvas/anchor/footBox` 或同步改角色文档。
2. 替换/新增 `<tag>_NN.png`；若改帧数，同步 `frames` 与 `assets`，并重排 assets 顺序。
3. 如果只做视觉替换、行为不变：角色 `character.json` 的 `packBase` 指向新目录即可，behavior 不用动。
4. 若新增动作：按 §6 加 state + rule/slot，并跑行为回归。
5. 改 `license`/`ai`（人画/AI 生成/合成必须如实）；如基于他人包，记 `meta.basedOn`。

## 8. 校验与测试命令

```bash
# 单角色严格校验（schema+tag 覆盖+pack 帧+PNG+license/ai）
node --import tsx scripts/validate-character.mjs public/characters/<id> --json --strict
# 多角色一起查 id 唯一
node --import tsx scripts/validate-character.mjs public/characters/a public/characters/b --json --strict
# 行为 golden trace 回归（改行为/规则后必须跑；故意改行为才更新 golden）
npm test
UPDATE_GOLDEN=1 node --import tsx --test tests/behavior-traces.test.ts
```

常见错误码：`TAG_MISSING`（行为要的 tag 缺失且 fallback 解析不到）、`PACK_FRAME_MISSING`（帧文件少/路径逃逸）、`PACK_DIM_MISMATCH`（帧尺寸≠canvas）、`PACK_ALPHA_*`、`PACK_COLORS`、`PACK_PALETTE`、`FALLBACK_*`。完整表见 [CHARACTER-VALIDATION](../CHARACTER-VALIDATION.md) §4.1。

## 9. 允许 / 禁止 / 必须保留的声明

**允许**：替换/新增动作帧，制作换动作皮肤；在自有角色包中定义新 tag；基于官方动作做同人改版（署名 + 非官方）。
**禁止**：覆盖或复用官方角色/pack ID 冒充官方版；把官方动作包原样改名再发布；在包里夹带脚本/可执行文件；用未授权素材（含他人二创图）直接做帧；宣称「官方动作 / 官方更新」。
**必须保留**：原 pack/角色的署名与许可（TASL + 修改说明）；非官方声明；AI 生成帧的披露；`basedOn/forkOf` 链；若复用他人帧，必须取得其许可并保留其署名。
