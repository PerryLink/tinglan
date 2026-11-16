# Famling Character Interface v0.1（已实现的数据接口层）

Status: **v0.1 数据接口已实现**（`src/pet/character/`，纯增量；未接 `pet.html`、未改 kernel/存档/语音）。
> **v0.2 已实现（2026-11-15）**：在 v0.1 之上新增 `render` 渲染格式选择、`apiVersion` 双版本协商（0.1/0.2，MAJOR 精确 + MINOR 窗口）、`minRuntime` 运行时协商，以及渲染器插件的 `formats`/`capabilities` 与 render API 版本协商。**本文继续作为 v0.1 基线；当前出厂契约以 [CHARACTER-INTERFACE-V0.2.md](CHARACTER-INTERFACE-V0.2.md) 为准。** 默认角色 `public/characters/**` 仍是 0.1、行为档仍是 `famling.behavior/0.1`，无需迁移。
> **v0.3 预览层（2026-11-15，可选）**：新增 `voice`/`audio`/`sfx`/`idle`/`zones`/`responses`/`moods`/`focus`/`schedule`/`timeOfDay` 的**数据声明与校验**（不实现调度/播放/派发），见 [CHARACTER-INTERFACE-V0.3.md](CHARACTER-INTERFACE-V0.3.md)。出厂运行时窗口仍是 0.1/0.2。
Related: [PET-EXTENSIBILITY-ARCHITECTURE-2026-11-14.md](PET-EXTENSIBILITY-ARCHITECTURE-2026-11-14.md) · 研究：`docs/research/CHARACTER-INTERFACE-SPEC.md`、`BEHAVIOR-HUMANOID-VS-PET.md`、`MODDING-CHARACTER-PACKS.md`、`MULTI-CHARACTER-RUNTIME.md`、`PET-ARCHITECTURE-AUDIT.md`

## 1. 设计原则

1. **角色包 = 只读数据**（JSON + PNG/音频），**不执行任何脚本**；出现 `script/scripts/eval/code/execute/permissions` 字段直接拒绝。
2. **人型与宠物共享同一套接口**：类型、动作 tag、行为 profile、事件词表、校验都相同；差异只在 `behavior` 数据（能力、状态、规则、needs、台词/音效）。
3. **行为数据化**：显式状态机（states）+ 规则表（rules：priority/cooldown/probability/guard）+ 权重 ambient；确定性 PRNG 可回放。
4. **渲染与行为分离**：接口层只产出 `{state, tag, priority}`；动画仍交给现有 `hero.ts` 的 CharacterPack/CharacterRenderer。128 画布迁移完成后接口字段不变（画布无关）。
5. **向后兼容**：旧 `hero.ts` manifest 可通过 `legacyManifestToCharacter()` 转成 `type:"object"` 的 legacy 角色。

## 2. 文件结构（已实现）

```
src/pet/character/
  types.ts      # FCI 0.1 类型（CharacterDocument / BehaviorProfile / Rule / Decision…）
  validate.ts   # 纯数据校验；legacy manifest → FCI 转换
  behavior.ts   # 行为运行时：states/rules/ambient、seeded PRNG、trace
  registry.ts   # 角色注册表、目录加载、fallback 解析
  scene.ts      # Actor / Scene（多对象最小骨架：spawn/despawn/broadcast/send）
  index.ts      # 公共导出
public/characters/
  humanoid-default/character.json + behavior.json   # 人型默认（Pearl 类）
  pet-default/character.json + behavior.json        # 宠物默认（猫类）；美术待生成
tests/character-interface.test.ts                   # 8 项接口测试
```

## 3. 角色包（CharacterDocument 0.1）

必填：`spec:"famling.character"`、`apiVersion:"0.1"`、`id`、`version`(semver)、`type`(humanoid|pet|object)、`canvas`、`anchor`、`footBox`、`behavior` 或 `behaviorFile`。

常用可选：`species`、`traits`、`display`、`bbox`、`palette`、`packBase`（hero.ts 的 CharacterPack 目录）、`tags`/`assets`（无 pack 时内联）、`expressions`、`sounds`、`fallback`、`capabilities`、`interactions`、`license`、`meta`、`ai`、`minRuntime`、`extensions/extensionsRequired`。

`fallback` 用于能力/素材降级，例：`{"talk":["idle"],"remind":["nudge","meow","idle"]}`；无环、深度 ≤3（`resolveFallbackTag`）。

## 4. 行为档（famling.behavior/0.1）

```jsonc
{
  "profile": "famling.behavior/0.1", "version": "0.1.0", "extends": "core:humanoid",
  "abilities": { "speech": "voice", "reminder": true, "needs": false, "death": false, "multiObject": true },
  "slots": { "idle": "idle", "pat": "pat", "talk": "talk", "remind": "remind" },
  "states": { "idle": { "tag": "idle", "loop": true }, "pat": { "tag": "pat", "priority": 50, "after": "idle" } },
  "rules": [{ "on": "pat", "to": "pat", "priority": 50, "cooldownMs": 3000, "probability": 1.0 }],
  "ambient": { "intervalMs": [8000, 15000], "choices": [{ "state": "idle", "weight": 5 }] },
  "needs": { "hunger": { "value": 50, "max": 100, "decayPerHour": 4, "criticalAt": 15 } },
  "speech": { "lines": { "pat.1": "嗯，我在。" } }
}
```

- `states`：可停驻状态，`tag` 必须来自角色包 tags；`after` 用于一次性动作回落。
- `rules`：事件→状态；`priority` 高者先；`cooldownMs`、`probability`（seeded）、`when`/`guard`（仅白名单谓词，不做表达式求值）、`requiresBrief`。
- `ambient`：空闲时的加权随机状态（确定性 PRNG）。
- 默认档案：`core:humanoid`（提醒/说话主职，无饥饿/死亡，`speech=voice`）；`core:pet.cat`（需求 loop，`speech=sfx`，`remind` 降级为 `nudge`）。

## 5. 两个默认角色（已提供）

| id | 类型 | 行为 | 美术 |
|---|---|---|---|
| `famling.humanoid-default` | humanoid | 7 tags（idle/pat/drag/land/talk/remind/sleep）、语音提醒、无 needs | 复用 `public/assets/pet/pearl-placeholder/`（96，placeholder-only） |
| `famling.pet-default` | pet（cat） | rub/meow/nudge/play/sleep、needs（hunger/energy/fun）、提醒降级、sfx | **待生成**（cat/dog placeholder 或 AI 图）；先用于行为/接口测试 |

同一事件的人型 vs 宠物反应不同（测试已锁定）：`pat` → 人型 `pat` / 宠物 `rub`；`feed` → 人型忽略 / 宠物 `play`。

## 6. 多对象接口（最小骨架，已实现）

- `CharacterRegistry`：注册/查询/去重/卸载；支持 `loadCharacter(dir)`（fetch `character.json` + `behaviorFile`）。
- `Scene`/`Actor`：spawn/despawn/list；`broadcast(event)` 向所有 `multiObject !== false` 的 actor 派发；`send(from,to,event)` 要求发送方 `capabilities.behaviors` 含 `social`、接收方接受多对象事件。
- 目前是**协议+最小实现**：没有渲染、没有距离/冲突/动画同步；双对象互动留到 Phase 3（见架构文档）。
- 未来：`interactions` 声明式绑定、宿主仲裁、对象间事件配额；pack 无权直接改他者状态。

## 7. 新增角色/宠物（社区路径）

1. 建目录 `public/characters/<id>/`：`character.json`、`behavior.json`、可选 `packBase` 指向 hero.ts pack（36 帧/7 tags）或内联 tags。
2. 若只做行为/皮肤：可先无美术（`behavior` 必填），接口/测试可加载；运行时需要 pack 才能渲染。
3. `npm test` 里的 `character-interface.test.ts` 会自动校验 JSON、行为 tag、data-only 安全；后续会加 `scripts/validate-character.mjs`（schema+资源+行为 lint）。
4. 不需要改任何 TS。

## 8. 未做 / 下一步

- `pet-default` 的猫/狗美术（placeholder 或 AI 生成，重跑 128 管线）。
- 128×128 契约迁移（当前默认 humanoid 仍 96）。
- 把接口层接到 `pet.html`/`main.ts`（Phase 2 gate，需单独批）：先加 `?hero=1`/feature flag，失败回退折线 DOM。
- `interactions` 实现、多窗口、存档 slot 化（Phase 3）。
- 社区校验 CLI、签名/信任链（MODDING 研究建议；v0.1 先不做签名）。

## 9. 校验 CLI 与回归（已实现）

- `node --import tsx scripts/validate-character.mjs public/characters/humanoid-default --json --strict`
  一次校验 schema、data-only 安全、行为引用/范围/fallback、pack manifest/帧/PNG alpha/调色板、license/ai；
  退出码 `0/1/2`，`--json` 输出机读结果。Schema 在 `content/schema/character-0.1.schema.json`。
- 行为回归：`tests/behavior-traces.test.ts` + `tests/fixtures/behavior-traces.json`（固定 seed=7、start=0、step=1000ms，
  锁定人型/宠物 trace、ambient、双 actor broadcast）。
- 完整检查项、错误码与已知限制见 [CHARACTER-VALIDATION.md](CHARACTER-VALIDATION.md)。
