# 替换 / 新增形象（精灵、立绘、调色板、表情、交互区）

Status: **作者文档（2026-11-15，DRAFT）**。面向换皮、像素精灵、立绘/皮肤作者。
相关：[README](README.md) · [REPLACE-ACTIONS](REPLACE-ACTIONS.md) · [ART-PIPELINE](../ART-PIPELINE.md) · [ASSETS](../ASSETS.md) · [ORCA-OC-STATUS](../ORCA-OC-STATUS-2026-11-15.md) · [CHARACTER-INTERFACE-V0.3](../CHARACTER-INTERFACE-V0.3.md)

## 1. 先对齐尺寸事实（96 / 128 / v3 不是一回事）

| 项 | 事实 | 状态 |
|---|---|---|
| 当前运行时默认 pack | **96×96**（`public/assets/pet/pearl-placeholder` 等，代码契约） | 【已实现】 |
| 桌宠 128 Q 版 | 设计基线「C 双形态」：128 Q 进桌宠窗口（128@2×=256 CSS，窗口规划 480×336） | 方向已建议，**契约未冻结** |
| v3 立绘 | 1024×1536 正常头身 AI 概念稿（临时权威参考） | 只做对话/立绘/key art/商店，**不压进 128 窗**（细节会丢） |
| 默认角色替换 | 汀岚/Orca 尚未入库；默认角色替换需单独评审 | 未做 |

**作者注意**：FCI 的 `canvas` 是参数（schema 16–512），本文不把 96/128 写死。你的包只需满足：**帧尺寸 = `canvas`**、`anchor/footBox` 与画布一致、校验通过。未来官方迁移画布时，用 `canvas` 跟随，不要依赖固定像素值。决策背景见 [ORCA-OC-STATUS](../ORCA-OC-STATUS-2026-11-15.md) §3（定稿前不重做 128/96 契约、不绑定 Orca 像素包）。

## 2. 画布 / 锚点 / footBox / bbox

```jsonc
"canvas": [96, 96],                         // 美术像素 [w,h]，16–512
"anchor": { "x": 48, "y": 96, "mode": "foot-center" },  // 画布坐标；脚底中心
"footBox": [-36, -18, 72, 18],              // 相对 anchor 的 [x,y,w,h]，w/h > 0
"bbox": [12, 8, 72, 84],                    // 可选：不透明内容包围盒 [x,y,w,h]
"display": { "scale": 2, "pixelated": true } // 只允许整数 1/2；pixelated 渲染提示
```

- `anchor` 决定角色“站”在哪；`footBox` 是落地/拖拽碰撞；`bbox` 用于命中/取景提示。三者与像素内容对不上会在运行时表现为漂浮/穿地/点不到。
- `display.scale` 只是偏好；实际缩放由窗口布局决定（当前 1×/2× 整数）。**禁止非整数缩放/AA 插值**，否则像素糊边。
- `canvas` 与 pack manifest 的 `canvas` **必须一致**（不一致 = `PACK_CANVAS_MISMATCH` error）；`anchor/footBox/palette` 不一致只是 warning，但会造成漂移。

## 3. 帧与 PNG 规范（【已实现】校验）

- 每个 tag 的帧：`<tag>_<NN>.png`（两位序号），数量 = `tags.<tag>.frames`；`assets` 按 tags 声明顺序串联。
- PNG：8-bit、非隔行（0/2/3/4/6 色型）；尺寸必须 = canvas；**alpha 只有 0/255**（半透明 → `PACK_ALPHA_SEMI`）；不允许全透明/全不透明帧。
- 颜色：默认上限 **41 色**（40 可见色 + 透明；hero 硬上限 48，可用 `--max-colors` 调整）；颜色必须属于 `palette` 对应 `art/specs/*.json` 的 `colors`，否则 `PACK_PALETTE`。
- 美术硬规则：1px **闭合**外轮廓；禁纯黑/纯白；固定画布不逐帧 trim（否则动画抖）；整数倍缩放生成；同一角色≤12 色、每包≤32 色（hero 桌宠层用 ≤41 色，例外见 [ART-PIPELINE](../ART-PIPELINE.md) §7）。
- `palette` 字段是调色板 id（如 `pearl-pixel@0.1`）：改配色要新建 id + 色表，不要悄悄改旧 id 的语义（其他包可能复用）。

## 4. 替换形象的最小步骤（L1 换皮/换色）

1. 复制 `public/assets/pet/<pack>/` → `public/assets/pet/<your-pack>/`；改 `manifest.json.id`（保持官方目录不动）。
2. 按原 `canvas/anchor/footBox` 出帧；若改尺寸，同时改角色 `character.json` 的 `canvas/anchor/footBox`（两边一致）。
3. 改 `palette` 与 `license/ai`；帧数变化同步 `tags.frames` 与 `assets`。
4. 角色文档 `packBase` 指向新目录；`behavior` 不变。
5. 跑 CLI 与像素校验（§7）。

调色板替换也可以只换 `art/_style/palettes/<id>.hex` + `art/specs` 色表后重生成，但**发布包必须附带最终 PNG**，不要依赖生成脚本。

## 5. 做皮肤 / 新角色（L2）与身份边界

- 皮肤 = 新角色 ID + 自己的 pack（可复用官方 behavior），**不要覆盖官方 ID**；官方 ID 前缀 `famling.*`、官方 pack `pet.*` 保留。
- 二创 ID 建议 `community.<author>.<name>`；同一 id 重复注册会拒绝（`CharacterRegistry` / `DUPLICATE_ID`）。
- 改版须在 `meta.basedOn`/`meta.forkOf` 写清来源与修改；版本号递增（`version`）；不同角色不要共享同一个 `id` 走“更新”。
- 官方角色 vs 二创角色：只有官方发布并签名/审核的包才可标「官方」；二创始终标「非官方 / unofficial」，不得用官方角色名做产品名或暗示授权。

## 6. 表情 / 调色板 / 立绘

- 表情：`EXPRESSIONS = calm/pleased/happy/sleepy/surprised/listening`；`setExpression()` 只校验枚举并存储，**当前渲染器不绘制表情层**（【预留】）。`character.json.expressions` 是 free-data 保留字段（【预留】不消费）。
- 立绘：v3 正常头身不进桌宠 canvas；如需对话/图鉴立绘，等宿主新增独立视图接口（未实现），不要塞进 128 帧里硬压。
- 0.3 `moods`/`emote`：`emote` 引用**现有动画 tag 名**（0.3 不新增帧级字段）；`moods.defs.*.emote` 只是声明，运行时不做表情调度（【计划 0.3】结构校验）。
- 换色：优先“新 palette id + 新 pack id”，避免直接改官方 pack 的配色（缓存/署名/对比都会乱）。

## 7. 交互区（clickable zones）现状

- 今天：`hitTest` 是**整图 alpha 命中**（在点击/松手时调用，不逐 move 采样）；没有声明式区域，也不存在 hover alpha。点击命中 → `pat`。
- `character.json.interactions[]`（v0.1）是**多对象邻近交互声明**（`{id,on,actors,outcome}`），由 Scene 仲裁 grant/deny，**不执行 outcome**，不是点击热区。
- 0.3 `zones[]`：`{id, role:'head'|'hand'|'tail'|'tablet'|'glasses'|'body'|'other', space:'canvas'|'anchor'|'normalized', shape:rect|polygon, on:<event>, cursor?, label?}`——**只校验结构与越界（`ZONE_OUT_OF_BOUNDS`），不派发点击事件**（【计划 0.3】）。在此之前，交互区请用像素 alpha 自然形成（点得到/点不到），不要宣称支持分区点击。

## 8. 校验与测试命令

```bash
node --import tsx scripts/validate-character.mjs <角色目录> --json --strict
python3 scripts/check_specs.py --specs art/specs          # 占位契约结构/长度
python3 scripts/placehold.py --spec art/specs --out art/_private-reference --scale 4   # 生成占位（非最终美术）
python3 scripts/validate_art.py <dir> --max-colors 32     # 尺寸/色数/二值 alpha/命名
```

常见错误码：`PACK_CANVAS_MISMATCH`、`PACK_DIM_MISMATCH`、`PACK_ALPHA_MISSING/SEMI/EMPTY/OPAQUE`、`PACK_COLORS`、`PACK_PALETTE`、`PACK_FRAME_MISSING`、`PACK_PATH_ESCAPE`。完整表见 [CHARACTER-VALIDATION](../CHARACTER-VALIDATION.md) §4.1。

## 9. 允许 / 禁止 / 必须保留的声明

**先看许可状态**：`LICENSE-ART` 为 DRAFT、默认 pack 为 `placeholder-only`（不可当发布素材）、Orca/汀岚 相似度与名称未清；官方美术在有效许可生效前不得商用/再分发，二创公开发布遵循 [FANWORK-POLICY](../legal/FANWORK-POLICY.md) §1。

**允许**：重绘/换色/换装/像素化二创；发布自有新角色或皮肤包；在许可允许下商用与再分发（附署名与修改说明）。
**禁止**：覆盖或冒用官方角色 ID/pack ID；把官方美术原样改名再发布；用未授权同人图/参考图（含 `art/_private-reference/refs/`）做发布素材；把 AI 概念稿冒充人工终稿或官方设定；用角色形象暗示与官方/DeepSeek 的合作或背书；抢注角色名/形象商标。
**必须保留**：非官方声明；原作者署名与许可（TASL、修改说明、`basedOn/forkOf`）；AI 生成披露；调色板/素材来源台账（[ASSETS](../ASSETS.md)）；官方素材的版权声明与许可链接；`LICENSE-ART` 随发布物（如使用官方美术）。
