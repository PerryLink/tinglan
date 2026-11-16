# 增加 / 修改行为（状态、规则、待机、交互区、回应）

Status: **作者文档（2026-11-15，DRAFT）**。面向行为作者、台词/待机/回应作者。
相关：[README](README.md) · [REPLACE-ACTIONS](REPLACE-ACTIONS.md) · [CHARACTER-INTERFACE](../CHARACTER-INTERFACE.md) · [CHARACTER-VALIDATION](../CHARACTER-VALIDATION.md) · [CHARACTER-INTERFACE-V0.3](../CHARACTER-INTERFACE-V0.3.md)

**运行时现状**：【已实现】`famling.behavior/0.1` 的 `states` / `rules`（priority/cooldown/probability/when.state/guard/requiresBrief）/ `slots` / `ambient` 加权随机 / 确定性 PRNG；
【已实现-宿主侧】`state.after`/`timeoutMs` 由 SceneRuntime/HeroRuntime 做瞬时状态到点回落（`timeoutMs` > tag 时长 > oneShotMs；到点转 `after` 或 `idle`，仅 `?hero=1` 接线路径生效；`BehaviorRuntime.decide` 本身不做回落）；【预留】`state.interrupt`、`rule.effects`、`rule.say`、`rule.sfx`、`speech.lines` 仍只在类型/schema/校验层；
【计划 0.3】0.3 预览层已实现（schema/TS/CLI）：`responses[]`、`idle`、`moods`/`focus`/`schedule`/`timeOfDay`、`zones[]` 结构可校验，**运行时仍不做调度/派发/回应执行**（出厂契约仍是 0.2）。

## 1. 行为档结构（`behaviorFile` 或内联 `behavior`）

```jsonc
{
  "profile": "famling.behavior/0.1", "version": "0.1.0", "extends": "core:humanoid",
  "defaults": { "priority": 10, "interrupt": "at-end", "cooldownMs": 0 },
  "abilities": { "speech": "voice", "reminder": true, "needs": false, "death": false, "multiObject": true },
  "slots": { "idle": "idle", "pat": "pat", "drag": "drag", "land": "land", "talk": "talk", "remind": "remind", "sleep": "sleep" },
  "states": {
    "idle": { "tag": "idle", "loop": true, "priority": 0 },
    "pat":  { "tag": "pat", "priority": 50 }
  },
  "rules": [{ "on": "pat", "to": "pat", "priority": 50, "cooldownMs": 3000, "probability": 1.0 }],
  "ambient": { "intervalMs": [8000, 15000], "choices": [{ "state": "idle", "weight": 5 }] }
}
```

- `states.<name>.tag` 必须来自 pack/内联 tags 或经 `fallback` 解析；否则 `TAG_MISSING`（strict 为 error）。
- `rules[].to`、`slots` 值、`state.after`、`when.state` 必须引用已声明 state（`RULE_TARGET_UNKNOWN`/`SLOT_UNKNOWN`/`AFTER_UNKNOWN`）。
- 数值范围：priority 0–100、probability 0–1、cooldownMs/timeoutMs 0–86400000、ambient min≤max、`sfx.volume` 0–1。
- `needs`：可声明 `{value,max,decayPerHour,criticalAt}` 并由校验器查范围；**BehaviorRuntime 不衰减**，`guard.input` 的 hunger/energy/fun 需宿主喂入（未接线时 guard 会因缺值判 false）。

## 2. 事件从哪来（别写“会自己触发”）

文档约定 ~16 个事件：`pat`、`drag.start`、`drag.end`、`land`、`talk`、`remind`、`feed`、`play`、`sleep`、`wake`、`click`、`hover`、`leave`、`idleTimeout`、`tick`、`dayNight`。
当前 pet 宿主实际发出：`click`、`pat`、`feed`、`drag.start`、`drag.end`、`land`、`talk`、`sleep`/`wake`（昼夜）；`remind` 依赖 Pet Brief（生产端未接）；其余事件可能只在测试/未来宿主。
自定义事件不会自动触发：需要宿主 `emit()`；二创包里写了没人发的事件 = 死规则。开发期可用 `window.__pet.qa.heroEmit(event, actorId?)` 注入测试。

## 3. 优先级 / 冷却 / 概率 / 条件（真正生效的部分）

- **优先级来源**：`rule.priority ?? 目标 state.priority ?? defaults.priority ?? 0`；同事件取最高者。
- **冷却来源**：`rule.cooldownMs ?? 目标 state.cooldownMs ?? defaults.cooldownMs`；同一规则冷却期内跳过。
- **概率**：每个候选用 seeded PRNG 掷一次；`probability:1` 也消耗随机数（回放一致性）。确定性种子让同一输入序列可复现。
- **`when`**：当前只消费 `when.state`；`when.source`/`secrecyMax` 未消费（写了不生效）。
- **`guard`**：`input ∈ mood|bond|hunger|energy|fun`，`op ∈ >=|<=|==|!=`，`value` 有限数；上下文缺值 = false。
- **`requiresBrief`**：需要宿主传入 `briefAvailable=true` 才命中（Pet Brief 未接时恒不命中）。
- **关键语义**：某事件存在规则但全被过滤（冷却/概率/条件）→ 直接 `ignored`，**不会**退到 `slots`；只有“该事件完全没有规则”时才走 slot 兜底。排查“为什么没反应”先看这里。

## 4. 哪些字段写了也不生效（【预留】）

| 字段 | 现状 | 替代做法 |
|---|---|---|
| `state.after` + `timeoutMs` | 【已实现-宿主侧】hero 运行时可到点回落；`BehaviorRuntime.decide` 不回落 | 写 `after`/`timeoutMs` 即可（`?hero=1` 路径） |
| `state.interrupt` | 【预留】不打断 | 用 higher priority 规则 + 事件驱动 |
| `rule.effects`（bond/mood/needs） | 不结算 | 等宿主接线；不要依赖数值变化 |
| `rule.say` / `rule.sfx` / `speech.lines` | 不朗读/不播音效 | 台词走宿主现有文字/语音通路；音效等 0.3 `sfx` 接线 |
| `needs` 衰减 | 【预留】不衰减 | 由内核/宿主提供数值 |

## 5. 待机 / 不打断 / 防话痨

- 待机用 `ambient`：`intervalMs` 间隔区间 + `choices` 权重；**一次只出一个**，权重和越大越常出现；默认人型 8–15s、宠物 5–12s，更长（10–20s）更安静。不要把所有状态都塞进 ambient。
- 优先级分层建议：idle 0–10；待机变化 10–20；轻反应 40–60；提醒 80；拖拽 100。不要让轻反应 >80，否则会打断提醒/拖拽。
- 冷却：同一句台词/动作 ≥3–5s；提醒类 ≥60s（参考 `nudge` 60000）。概率：轻反应 0.3–0.6，不要 1.0 连续轰炸。
- 话痨三件套：限制 `talk` 频率（冷却 + 概率 + `when.state` 非 sleep）；字幕 1–2 句、≤60 字；同事件准备 2–3 个变体，但当前播放器不随机选语音变体（需行为侧映射 line id，0.3 `voice.lineIds` 规划）。
- 尊重睡眠/拖拽：sleep/drag 状态用高优先级保持（drag=100），其他规则加 `when.state` 排除；`talk`/`remind` 属于宿主延迟事件（`DEFERRED_EVENTS`），忙时排队，不要自己再叠定时器。
- 回归：任何行为改动都要过 golden trace（§7），否则可能悄悄改掉默认角色行为。

## 6. 0.3 的待机 / 交互区 / 回应（预览层已实现；运行时未接线）

- `idle`：`main` 是 **behavior state 名**（必须是 `behavior.states` 已声明的 state，不是 tag）；`variants[]` 每项**恰好**给 `state` 或 `tag` 之一，另有 weight/intervalMs/when/priority/interruptible。比 v0.1 ambient 更强，但**不驱动调度**（运行时仍走 0.2 ambient）。
- `zones[]`：点击/悬停热区（rect/polygon，画布/锚点/归一化坐标），**只校验、不派发**；当前点击仍走整图 alpha 命中 → `pat`。
- `responses[]`：`{on, when, voiceLineId?, sfx?, emote?, durationMs?, requiresAny?, priority?}`，**不执行**；用于未来把事件→回应声明化。
- `moods`/`focus`/`schedule`/`timeOfDay`：只校验结构，不做情绪/日程/时段切换。
- v0.1 `interactions[]`（多对象）：Scene 做邻近仲裁 grant/deny/end，**不执行 outcome**；不是点击热区。
- 字段全表以 [CHARACTER-INTERFACE-V0.3](../CHARACTER-INTERFACE-V0.3.md) 为准（本节不复制）。

## 7. 测试 / 回放

```bash
npm test                                            # behavior-traces + character-interface 回归
UPDATE_GOLDEN=1 node --import tsx --test tests/behavior-traces.test.ts   # 仅当你故意改默认行为
node --import tsx scripts/validate-character.mjs <角色目录> --json --strict
```

- golden trace：固定 seed=7、start=0、step=1000ms，锁定默认人型/宠物与双 actor broadcast；改行为数据后要么更新 golden，要么修规则。
- 浏览器/QA：`__pet.qa.heroEmit(event)`、`__pet.qa.heroSnapshot()` 可回放单事件与快照；`?hero=1` 下才启用（默认关）。
- 若你要提交到本仓：新增行为需附 trace 级测试或回放记录（见 [SECURITY](SECURITY.md) §7）。

## 8. 允许 / 禁止 / 必须保留的声明

**允许**：为自己的角色写新状态/规则/待机/回应；改官方行为做同人版（独立 ID、署名、非官方）；调节优先级/冷却/概率产出不同性格。
**禁止**：覆盖官方 behavior 文件冒充官方角色；写死循环（0ms 冷却 + probability 1）制造刷屏；用行为档触发脚本/网络/系统能力；通过行为篡改他人角色状态（多对象越权）；把 0.3 声明写成「已生效」误导作者。
**必须保留**：原作者署名与许可（改官方行为时）；非官方声明；AI 生成台词/语音的披露；行为改动记录（版本号递增 + 变更说明）；`basedOn/forkOf` 链。
