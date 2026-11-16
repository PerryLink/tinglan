# 桌宠二创 / Mod 开发者文档（docs/modding）

Status: **作者文档 v0.1（2026-11-15，DRAFT）**。本目录只讲「怎么改、怎么验、怎么声明」；
许可正文、免责条款与法律模板以 [docs/legal/](../legal/README.md) 和根目录 [NOTICE](../../NOTICE)、[LICENSE-ART](../../LICENSE-ART) 为准，本目录不重复法务全文。
适用对象：角色包、皮肤、动作、语音、行为、渲染器插件作者。运行时代码与默认角色在 `src/pet/`、`public/characters/`、`content/schema/`。

**事实标注约定**（全文统一）：

| 标记 | 含义 |
|---|---|
| 【已实现】 | 当前仓库代码/校验器可用 |
| 【预留】 | schema 或类型已有，运行时**未消费** |
| 【计划 0.3】 | FCI 0.3 预览层已实现（schema/TS/CLI 可校验），但运行时仍不装载 0.3 |
| 【DRAFT】 | 法务/命名未生效，不得对外当承诺 |

> 最常见的翻车：把【预留】写成「能用」。写进 JSON ≠ 会执行；以本目录每个文件的「运行时现状」为准。

## 1. 三种扩展级别

| 级别 | 作者做什么 | 产物 | 代码? | 信任/审核 | 状态 |
|---|---|---|---|---|---|
| **L1 换皮/换色/换动作** | 复用官方行为，只换帧/pack/调色板/语音 | 角色目录 + hero pack（JSON+PNG）或语音目录 | 否 | 本地导入 + 校验 CLI | 可用（语音包当前为开发级替换） |
| **L2 新角色/新行为** | 新角色 ID + `character.json` + `behavior.json` + 素材 | 独立角色包（可先无美术跑行为） | 否 | 校验 CLI + 人工审核 | 0.1/0.2 可用；0.3 作者接口预览 |
| **L3 第一方渲染器插件** | Live2D/Spine 等新渲染后端 | TS 插件 + 构建期 allowlist/签名 | 是 | **仅官方签名** | 只冻结接口，不开放第三方代码 |

硬边界：L1/L2 是**纯数据包**（JSON + PNG/WAV/OGG），永不执行包内代码；任何需要脚本、网络、系统能力的「扩展」都不在二创范围（见 [SECURITY.md](SECURITY.md)）。L3 不是社区路径，社区不能提交可执行插件；如果你需要新动画系统，先按 [COMPATIBILITY-AND-VERSIONING.md](COMPATIBILITY-AND-VERSIONING.md) 提能力需求。

## 2. 可替换点清单（先看这里）

| 替换点 | 入口 | 运行时现状 | 详见 |
|---|---|---|---|
| 动作 tag（帧/fps/loop/offset） | `packBase` 的 `manifest.json.tags`（内联 `character.json.tags` 仅校验/预留） | 【已实现】播放；`offsets/category/priority/next` 仅 schema/生产期 | [REPLACE-ACTIONS.md](REPLACE-ACTIONS.md) |
| 形象/精灵/立绘 | `packBase` 目录或 `tags`+`assets`；`canvas/anchor/footBox/bbox` | 【已实现】PNG pack 渲染 | [REPLACE-ART-AND-CHARACTER.md](REPLACE-ART-AND-CHARACTER.md) |
| 调色板/表情 | `palette`；`expressions`；0.3 `moods`/`emote` | 调色板【已实现】校验；表情【预留】不绘制 | [REPLACE-ART-AND-CHARACTER.md](REPLACE-ART-AND-CHARACTER.md) |
| 声音/SFX | 预生成 WAV 目录 `assets/voice/<pack>/`；0.3 `audio[]`/`voice`/`sfx` | WAV 配音【已实现】播放；SFX 与 0.3 音频字段【预留/计划 0.3】 | [REPLACE-VOICE-AND-SFX.md](REPLACE-VOICE-AND-SFX.md) |
| 行为/待机/回应 | `behaviorFile` 的 `states/rules/slots/ambient`；0.3 `idle`/`responses` |【已实现】states/rules/ambient、`after/timeoutMs`（宿主侧）；`interrupt/effects/say/sfx`【预留】 | [ADD-BEHAVIOR.md](ADD-BEHAVIOR.md) |
| 交互区（点击区/对象交互） | 0.3 `zones[]`；v0.1 `interactions[]` | `interactions` 只做邻近仲裁不执行 outcome；`zones`【计划 0.3】 | [ADD-BEHAVIOR.md](ADD-BEHAVIOR.md) |
| 渲染器（Live2D/Spine） | `render.format` | 只接受宿主已注册格式（内置 3 个）；新格式仅官方插件 | [COMPATIBILITY-AND-VERSIONING.md](COMPATIBILITY-AND-VERSIONING.md) |

## 3. 目录结构（官方约定，二创沿用）

```text
public/characters/<character-id>/      # L1/L2 角色包入口（角色目录）
  character.json                       # FCI 文档（spec/apiVersion/id/...）
  behavior.json                        # famling.behavior/0.1 行为档
  art/  audio/                         # 可选：包内资源（相对路径引用）
public/assets/pet/<pack-id>/           # hero 像素 pack（可被多个角色 packBase 复用）
  manifest.json                        # id/style/canvas/anchor/footBox/palette/tags/assets/license/ai
  <tag>_00.png ...                     # 帧文件，按 tags 声明顺序拼接
assets/voice/<voice-pack>/      # 预生成语音（当前播放通路）
  manifest.json                        # {voice, note, lines:[{id,text,file}]}
  <id>.wav
content/schema/character-<api>.schema.json   # 0.1/0.2/（0.3 预览）schema
packs/<dlc>/                           # 官方签名 DLC（另一套 manifest：contentApi/minBase/sha256/Ed25519）
```

二创**不要**覆盖 `public/characters/famling.*` 与 `public/assets/pet/pet.*` 的官方 ID/目录；新建自己的目录（见 §6 命名）。加载入口与注册表：`src/pet/character/registry.ts`（id 重复会拒绝）。

## 4. 最小例子

**L1：给现有角色换一套 idle 帧**（不改行为、不改代码）

```text
1) 复制 public/assets/pet/cat-placeholder/ → public/assets/pet/<your-pack>/
2) 改 manifest.json 的 id/palette/license/ai，保持 canvas/anchor/footBox/tags 契约
3) 帧命名 <tag>_<NN>.png，数量必须等于 Σ tags.frames；尺寸必须等于 canvas
4) 在角色 character.json 把 packBase 指向 "/assets/pet/<your-pack>/"
5) node --import tsx scripts/validate-character.mjs <角色目录> --json --strict
```

**L2：新角色最小包**（可先只有行为：校验器能过；实际渲染仍需 pack）

```jsonc
{
  "spec": "famling.character", "apiVersion": "0.2",
  "id": "community.yourname.example", "version": "0.1.0", "type": "humanoid",
  "canvas": [96, 96],
  "anchor": { "x": 48, "y": 96, "mode": "foot-center" },
  "footBox": [-36, -18, 72, 18],
  "render": { "format": "pixel-hero" },
  "behaviorFile": "behavior.json",
  "license": "CC-BY-NC-SA-4.0", "ai": { "status": "none" },
  "meta": { "authors": ["your-name"], "basedOn": "famling.humanoid-default" }
}
```

完整字段见 [CHARACTER-INTERFACE-V0.2.md](../CHARACTER-INTERFACE-V0.2.md)；行为档见 [ADD-BEHAVIOR.md](ADD-BEHAVIOR.md)。0.3 新增的 `audio/voice/sfx/idle/zones/responses` 见 [CHARACTER-INTERFACE-V0.3.md](../CHARACTER-INTERFACE-V0.3.md)，**运行时尚未消费**（0.3 是预览层，出厂契约仍是 0.2；见 [COMPATIBILITY-AND-VERSIONING](COMPATIBILITY-AND-VERSIONING.md)）。

## 5. 兼容矩阵（速查）

| 你的包 | 0.1 运行时 | 0.2 运行时（当前） | 0.3 预览校验 |
|---|---|---|---|
| FCI 0.1 | 加载 | 加载（渲染默认 pixel-hero） | 可校验 |
| FCI 0.2 + 已注册 render.format | 拒载 | 加载 | 可校验 |
| FCI 0.2 + 未知 format | 拒载 | 拒载（给已注册列表） | 可校验（`--format` 可临时放行） |
| FCI 0.3 作者文档 | 拒载 | **拒载**（不要写"0.2 运行时能读 0.3"） | `--strict` 校验通过 |

细节、迁移、弃用与测试矩阵见 [COMPATIBILITY-AND-VERSIONING.md](COMPATIBILITY-AND-VERSIONING.md)。

## 6. 命名与身份（先定，后改名很痛）

- 官方角色 ID：`famling.<name>`（如 `famling.humanoid-default`）；官方渲染 pack：`pet.<name>.*`。**官方前缀保留**，二创不要占用。
- 二创角色 ID：建议 `community.<author>.<name>` 或 `org.<author>.<name>`；小写、点/连字符，2–64 字符（schema `^[a-z0-9][a-z0-9._-]{1,63}$`）。
- 皮肤/改版：保留 `meta.basedOn`/`meta.forkOf` 与原作者署名（`meta` 是自由数据；0.3 亦可用 `extensions` 命名空间键）。
- 角色名/产品名：**Orca 只能作角色物种/内部代号，不能作产品名/商标**；中文角色名候选「汀岚」仍待商标检索（见 [TRADEMARK-AND-NAMING-POLICY](../legal/TRADEMARK-AND-NAMING-POLICY.md) 与 [ORCA-OC-STATUS](../ORCA-OC-STATUS-2026-11-15.md)）。不抢注角色名、Logo、域名、npm 包名。
- 汀岚（工作名，商标未清）设计/动作/语音规划见 [TINGLAN-CHARACTER-INTERACTION-DESIGN](../TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md)：**尚无正式角色包**；0.3 预览 fixture 用 `famling.tinlan-preview`（`tests/fixtures/fci-v03/`），ID/素材/新 tag 仍非最终，二创不要假定已存在。

## 7. 校验与测试（作者最小集）

```bash
node --import tsx scripts/validate-character.mjs public/characters/<id> --json --strict   # 0.1/0.2 自动路由，0.3 预览亦可用
npm test                                        # 含 character-interface / behavior-traces / voice 回归
python3 scripts/check_specs.py --specs art/specs && python3 scripts/validate_art.py art/_private-reference --max-colors 32
```

校验器只读、不联网、不执行包内容。错误码见 `../CHARACTER-VALIDATION.md` §4.1 与 0.3 新增码（`VOICE_*`/`AUDIO_*`/`ZONE_*` 等）。

## 8. 允许 / 禁止 / 必须保留的声明（全目录通则）

**先看当前许可状态**：`LICENSE-ART` 为 **DRAFT**（官方美术按保留所有权利处理）、默认 pack 是 `placeholder-only`、Orca/汀岚 相似度与名称未清；在这些生效前，不要对外宣称可商用/可再分发，公开二创按 [FANWORK-POLICY](../legal/FANWORK-POLICY.md) §1 保守处理（G2/律师通过前不建议公开发布）。

**允许**：在遵守素材许可与署名条件下，制作、修改、再分发 L1/L2 数据包；发布替换动作/形象/语音/行为；制作同人皮肤与改版（非官方身份）。
**禁止**：冒充官方、暗示官方授权/合作/背书；使用官方 Logo、字标、官方鲸鱼娘形象或「官方/partner/authorized」措辞；抢注角色名/商标/域名/包名；使用真人声音克隆或未授权音源；把二创包写成官方默认角色或覆盖官方 ID；发布含脚本/可执行文件的包。
**必须保留**：非官方声明（中英，见 [NOTICE](../../NOTICE) §7）；原作者署名与许可（TASL + 是否修改）；AI 生成披露；`basedOn/forkOf` 署名链；原许可的 `Required Notice`（涉及代码/第三方素材时）。

> 每条文档末尾都有针对该替换点的同款小节；法务 canonical 文本以 `docs/legal/` 为准。声明模板可直接复制 [DECLARATION-TEMPLATES.md](DECLARATION-TEMPLATES.md)。

## 9. 文档索引

| 文件 | 一句话 |
|---|---|
| [REPLACE-ACTIONS.md](REPLACE-ACTIONS.md) | 替换/新增动画 tag、offsets、fallback、缺失校验 |
| [REPLACE-VOICE-AND-SFX.md](REPLACE-VOICE-AND-SFX.md) | 音频格式、命名、许可、AI 披露、口型/字幕 |
| [REPLACE-ART-AND-CHARACTER.md](REPLACE-ART-AND-CHARACTER.md) | 精灵/立绘/调色板/表情/交互区/换皮 |
| [ADD-BEHAVIOR.md](ADD-BEHAVIOR.md) | 状态/规则/待机/交互区/回应与防话痨 |
| [DECLARATION-TEMPLATES.md](DECLARATION-TEMPLATES.md) | 可复制声明模板（开发者视角） |
| [COMPATIBILITY-AND-VERSIONING.md](COMPATIBILITY-AND-VERSIONING.md) | FCI 0.1/0.2/0.3、包版本、迁移、弃用 |
| [SECURITY.md](SECURITY.md) | 不执行代码、资源限制、签名/信任、提交与审核（含原 CONTRIBUTING） |

法务（DRAFT，已落盘 docs/legal/）：[FANWORK-POLICY](../legal/FANWORK-POLICY.md) · [ASSET-REPLACEMENT-AND-MODDING-POLICY](../legal/ASSET-REPLACEMENT-AND-MODDING-POLICY.md) · [AI-CONTENT-POLICY](../legal/AI-CONTENT-POLICY.md) · [TRADEMARK-AND-NAMING-POLICY](../legal/TRADEMARK-AND-NAMING-POLICY.md) · [CONTENT-POLICY](../legal/CONTENT-POLICY.md) · [DECLARATION-MATRIX](../legal/DECLARATION-MATRIX.md) · [CONTRIBUTOR-TERMS](../legal/CONTRIBUTOR-TERMS.md)。
