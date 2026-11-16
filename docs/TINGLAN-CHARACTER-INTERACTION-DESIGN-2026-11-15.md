# 汀岚 · 角色行为与语音设计（桌面伙伴 · 2026-11-15）

Status: **设计稿，只设计**：本文件是唯一写入；不生成图/音频、不改代码、不调 API、不做 git、不写 hub。
角色（固定）：**汀岚**，Orca OC 虎鲸秘书；黑 bob、细框眼镜、黑西装/白衬衫/黑领带/铅笔裙/黑丝/黑小高跟、虎鲸尾（白尾腹）、平板/账本、珍珠耳坠、原创几何鱼形发夹/领带夹；**冷静、精准、克制、有工作搭子感**；非情感陪伴/恋爱/主人/宝宝；非官方、无 DeepSeek Logo。
参考图（只读，不重生成）：`<private-path>`（1024×1536，≈6–6.5 头身）。
运行时基线：FCI 0.2；**当前 7 tags / 36 帧**（idle8·pat6·drag4·land4·talk4·remind6·sleep4，包 96²）；128 Q 桌宠 + v3 立绘双形态（C 方案，推荐但**未冻结**）；窗口目标 480×336（**未实现**，现行 480×240/272）；128 迁移未完成。
相关：[DECISION-MEMO](DECISION-MEMO-2026-11-15.md) · [ORCA-RUNTIME](research/REMAINING-ORCA-RUNTIME.md) · [CHARACTER-INTERFACE-V0.2](CHARACTER-INTERFACE-V0.2.md) · [PET-INTERACTION-LAYER-PLAN](research/PET-INTERACTION-LAYER-PLAN.md) · [PET-PRIVACY](PET-PRIVACY.md) · [VOICE-PILOT-RESULTS](VOICE-PILOT-RESULTS.md)

## 0. 结论（先看）

| 项 | 推荐值 |
|---|---|
| 高层状态 | **16**（含 pat 三分区；startle/sleep/wake/stretch/refuse/look_out 补齐） |
| 待机微动作 | **12**（4 个内嵌主待机循环 + 6 个独立 one-shot + 2 个复用 read）+ D 档再加 2 |
| 触摸分区 | 5 个 zone：head / glasses / hand+tablet / tail / floor（不做 body/胸/腿/裙；脚只做拖拽） |
| 语音 | 预生成 TTS（stella/tide 盲听择优）+ 字幕常开；**不克隆、不真人配音**；R 档 36 条占位台词（已进包；目标 32–36） |
| 音效 | 9 类 SFX（当前无 SFX 通道，需新增） |
| 回应层级 | L0 动作-only / L1 短反应 / L2 长台词 / L3 沉默；宿主发言闸门 |
| 最关键 5 项新增 | ①16 态状态机+分区触摸 ②主待机+微动作层 ③发言闸门 ④focus/read 工作态+Pet Brief 映射 ⑤SFX/口型通道 |
| 明确不做 | 恋爱/好感/亲密度、喂食、主人宝宝称呼、自由闲聊 LLM、真实天气 API、全局键鼠监听、声音克隆、多对象社交、滚轮/键盘绑定 |

## 1. 现状评估：7 tag + 简单行为够不够

**已实现（源码实测）**：FCI 0.2 数据契约；`behavior/0.1` 的 states/rules/ambient；scene 运行时支持 `after`/`timeoutMs`/加权 ambient；事件 `pat/drag.start/drag.end/land/talk/remind/sleep/wake/hover/leave/click`；`talk/remind` 在一次性 cue 中最多排队 3s；指针拖拽（本地跟随+回弹，不移动 OS 窗口；窗口拖动仅 header）；昼夜 sleep/wake（23–6）；Pet Brief 消费端模块（投影/校验，未接 UI）。

| 维度 | 现状 | 判断 |
|---|---|---|
| 待机单调 | idle 8f@8fps loop；ambient 8–15s，choices 只有 idle(w5)/talk(w1)，talk 被当 ambient 会"无声动嘴" | **最需要改**：等于 99% 时间同一帧循环 |
| 触摸部位 | `hitActor` 只返回 actor AABB，任何位置点按都 = `pat` | **缺**：头/手/尾/平板/眼镜反应完全一样 |
| 拖拽反馈 | drag loop→drag.end→land；startle/甩动/拒拖无区分 | 有骨架，缺"被拖起的情绪层次" |
| 说话口型 | talk tag 4f loop，但 state 有 `after:idle` → 实际 **333ms 后自动回 idle**；口型是合成三角波（QA 用） | 与语音时长不同步；无真实口型 |
| 提醒打断 | remind 600ms 一次性；无 P0/P1 分层；无"忙时沉默" | 缺分级与打断语义（priority/interrupt 只声明未执行） |
| 工作/专注 | 无 focus/read 状态；Brief `focused`/`work.state` 未映射 | **缺核心**（秘书人设靠"在做事"成立） |
| 时间/日程 | 只有 23–6 sleep 与旧 `petSchedule` 文案 | 无晨/午/晚差异、整点、收工 |
| 鼠标靠近 | hover/leave 已 emit，profile 无规则 → ignored | 缺"抬眼看你一下" |
| 天气 | 无数据源、无实现 | 先不做（见 §7.3） |
| 多对象 | Scene 最小骨架/hero 单画布多 actor，无布局/存档/选中 | 先不做（见 §7.4） |
| 沉默回应 | 每次 `doPat` 必 `say()`，无全局冷却/配额/去重 | **话痨风险**，必须加发言闸门 |

结论：7 tag 适合"能跑通 vertical slice"，不适合"汀岚这个角色"。缺的不是更多帧，而是**状态语义、分区交互、发言节制**；本设计允许美术分波落地（fallback 链兜底，见 §8）。

## 2. 状态机（L1 高层：16 态）

```
输入（指针分区/宿主/时钟/Pet Brief）
  → 事件路由（命中分区→语义事件；空闲→ambient 抽微动作）
  → L1 状态机（优先级 / 打断 / 冷却 / 回落）
  → tag 解析（fallback 链；未知 tag 绝不交给渲染器）
  → 渲染 + 语音闸门 + SFX
L2 微动作：仅 idle 且空闲达阈值时由 ambient 抽取，播完回 idle
```

| # | state | 语义 | 触发事件 | tag | 时长/loop | 优先级 | 打断策略 | 冷却 | 回落 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | idle | 主待机（呼吸/眨眼/尾摆/发呆内嵌） | scene.enter / 各态回落 / wake | idle | 12f loop | 0 | — | — | 常驻 |
| 2 | focus | 工作/专注：只做小动作、不搭话 | brief working / focus.start | focus | loop | 25 | at-end；pat/drag/remind 可打断 | 进态 60s | 条件解除或 10min 无事件→idle |
| 3 | read | 看平板/账本（阅件、等待、整点对时） | brief waiting / ambient 长版 | read | loop；单次 timeout 30s | 15 | at-end | 30s | timeout→idle |
| 4 | talk | 说话口型（与语音同生命周期） | 语音开始/结束 | talk | loop（时长=语音） | 60 | 只排队不抢占；pat/drag 可打断 | — | 语音结束→idle |
| 5 | remind | 提醒 P0/P1（一次性） | reminder.due / brief | remind | 6f=600ms | 80 | 立即 | 60s/同事件 | →idle |
| 6 | pat | 被摸头（轻点头） | pat on head | pat | 6f=600ms | 50 | at-end | 3s | →idle |
| 7 | pat_hand | 摸手/碰平板：护平板、手收回 | pat on hand/tablet | pat_hand | 5f≈500ms | 55 | at-end | 6s | →idle |
| 8 | pat_tail | 摸尾：尾巴甩开+回头半秒 | pat on tail | pat_tail | 5f≈500ms | 55 | at-end | 8s | →idle |
| 9 | drag | 被拖起（悬空摆尾） | drag.start | drag | 4f loop | 100 | 立即 | — | drag.end |
| 10 | land | 落地站稳 | drag.end/land | land | 4f=333ms | 90 | 立即 | 1s | →idle |
| 11 | startle | 被突然抓起/快速甩动 | drag.start 速度>阈值 | startle | 4f≈400ms | 95 | 立即，播完接 drag | 10s | →drag |
| 12 | sleep | 睡眠（低活动；不回应轻事件） | night(23–6)/idle 20min | sleep | 4f loop | 10 | 仅 wake/drag/pat（0.8 唤醒） | — | →wake |
| 13 | wake | 被叫醒/晨间 | wake / pat on sleep | wake | 4f≈400ms | 40 | 立即 | 5s | →idle |
| 14 | stretch | 伸懒腰（也用作休息提醒动作） | ambient / break.remind | stretch | 6f≈750ms | 5 | at-end | 30s | →idle |
| 15 | refuse | 不悦/拒绝：扶眼镜+短句，**不扣任何数值** | 6s 内第 4 次触摸；摸尾第 3 次 | refuse | 3f≈375ms | 70 | 立即 | 20s | →idle |
| 16 | look_out | 看窗外/走神（头微转） | hover dwell≥1.2s / ambient | look_out | 6f≈750ms | 5 | at-end | 15s | →idle |

**规则写法（behavior.json 关键子集）**：分区事件用小写点分层 `pat.head / pat.hand / pat.tablet / pat.tail / pat.glasses / pat.spam`；自定义事件必须 `x-famling/...`（如 `x-famling/pat.spam`）；`pat.glasses` 75%→`pat`（偏头躲），25%→`refuse`（扶眼镜=不悦）；`pat.spam`→`refuse` 概率 1.0（宿主统计 6s 触摸次数后 emit）。
**打断契约**：优先级 100 drag > 95 startle > 90 land > 80 remind > 70 refuse > 60 talk > 55 pat_* > 50 pat > 40 wake > 25 focus > 15 read > 10 sleep > 5 micro > 0 idle；`at-end` 类（talk/remind/pat）不抢占当前一次性动作，进入 ≤1s 队列；其余立即。**注意**：`CharacterRuntime03` 已实现 priority/interrupt/at-end 队列；正式页面通过 behavior preview 使用，渲染仍需美术。
**分区后的核心不变量**：拖拽中除 drag.end/land 一律忽略；sleep 中 hover 不唤醒、pat 可唤醒（概率 0.8）；focus 中 pat 有反应但语音概率 ×0.5；任何状态都不"锁死"超过 10min（focus 除外，由 Brief 解除）。

## 3. 待机微动作层（主待机 + 12 微动作）

**架构**：`idle` 一个长循环（12f@8fps=1.5s）内嵌 4 个"底线节拍"（呼吸/眨眼/尾摆/发呆），保证任何时刻都有生命感；6 个一次性微动作 + 2 个 read 复用动作由 ambient 抽取，制造"意外感"。若全靠 one-shot，空闲 70% 时间仍静止；若全塞进 idle，则不可打断、不可控。**128 可读性约束**：眼镜 3.8px、领带夹 2.4px、珍珠 1.3px（见 ORCA-RUNTIME §2.2）→ 微动作必须靠**姿态/轮廓**可读（手到脸、低头、转身、尾巴），不靠配饰细节；尾巴与平板在 128 可读。

| # | id | 动作 | 载体 | 权重(日/夜) | 触发条件 | 时长 | 冷却/衰减 | 台词 | SFX |
|---|---|---|---|---|---|---|---|---|---|
| 1 | breathe | 肩/胸 ±1px 起伏 | 内嵌 idle | 常驻 | — | 1 循环 | — | 无 | 无 |
| 2 | blink | 眨眼 2 帧 | 内嵌 idle | 常驻 | 随机 2.5–6s | 0.25s | 连眨 2 次后停 8s | 无 | 无 |
| 3 | tail_sway | 尾摆 ±2px | 内嵌 idle + drag/land | 常驻 | 振幅随状态 ×1.5（drag） | 循环 | — | 无 | tail_swish 低频 |
| 4 | daze | 半眼/头微倾 1–2° | 内嵌 idle（2 帧变体） | 12/14 | 空闲 ≥90s | 1.2s | 90s | 无 | 无 |
| 5 | glasses | 推眼镜/扶正 | `glasses` tag | 14/8 | 60s 内未被摸、未 refuse | 0.6s | 180s | 无 | glasses_tick |
| 6 | tablet_glance | 看平板/对时 | `read` tag（timeout 2.4s） | 18/6 | 无 | 2.4s | 60s；整点前 5min 必出一次 | 无 | tablet_tap 可选 |
| 7 | check_time | 整点对时（变体） | `read` tag（抬腕改抬平板） | 6/4 | 整点前 5min | 1.6s | 每整点 1 次 | 30% time_a（≤8 字） | tablet_tap |
| 8 | write | 低头写字/笔尖 2 帧 | `write` tag | 10/4 | 白天/工作时段 | 1.8s | 240s | 无 | pen |
| 9 | look_out | 看窗外（头转+停） | `look_out` tag | 8/4 | 白天；连续 2 次后停 120s | 0.75s | 120s | 无 | 无 |
| 10 | stretch | 伸懒腰（全身） | `stretch` tag | 6/4 | 空闲 ≥3min 或久坐 | 0.75s | 300s | 无 | cloth |
| 11 | yawn | 打哈欠（手挡嘴） | `yawn` tag | 4/16 | 夜间/午后/低活动 | 0.6s | 300s | 无 | cough 20% |
| 12 | tail_flick | 明显甩尾（4f） | `tail_flick` tag | 7/6 | 被拖后/被摸尾后 | 0.5s | 120s | 无 | tail_swish |

**防重复机制**（宿主侧，按 actor 记）：①最近 2 个微动作不重复；②同一微动作 60s 内权重 ×0.25、120s 内 ×0.5；③idle 连续停留 <45s 不抽微动作；④微动作间隔 [12,30]s 随机（±20% 抖动，避免整点扎堆；研究建议 8–20s，取上限防刷动作）；⑤每 3 个微动作最多 1 个"大动作"（stretch/look_out/write，>1.5s）；⑥focus/read/drag/pat 等非 idle 状态不抽 ambient；⑦时段权重表切换（夜：yawn/daze↑，tablet/write↓）。
**D 档追加**：tie_adjust（整理领带夹，`tie_adjust` tag）、tap_tablet（轻敲平板，`tap` tag）→ 共 14 个微动作。

## 4. 交互矩阵

**分区热区（5 区；128 画布 %，anchor foot-center；几何放 `zones`）**：head 25–75/5–35（含眼镜，优先 glasses 40–60/16–24 细热区）· hand+tablet 24–56/38–60 · tail 74–94/52–70（仅尾部可见区域）· floor 30–70/85–100（只拖拽）。**不做 body/胸/腿/裙热区**；当前百分比是 v3 立绘的估算，128 Q 像素图完成后必须按实际轮廓重新标定。

| 输入 | 条件/区域 | L1 状态 | 回应层 | 台词（示例 id） | SFX | 冷却 | 备注 |
|---|---|---|---|---|---|---|---|
| 单击（<500ms、<4px） | head | pat | L0 80% / L1 20% | pat_a/pat_b | cloth | 3s | 点头 ≤6°，不卖萌 |
| 单击 | glasses | pat 75% / refuse 25% | L1 30%（仅 refuse 分支） | refuse 类 | glasses_tick | 8s | 碰脸=不悦，但克制 |
| 单击 | hand/tablet | pat_hand | L0 85% / L1 15% | hand_a/hand_b | cloth | 6s | 侧身护平板 |
| 单击 | tail | pat_tail | L0 70% / L1 25% / refuse 5% | tail_a/tail_b | tail_swish | 8s | 尾巴甩开+回头 |
| 单击 | floor/脚 | 无反应 | — | — | — | — | 只作拖拽热区，避免误触 |
| 连击 | ≥4 次/6s（任意区） | refuse | L1 必说（极短） | refuse_a/refuse_b | glasses_tick | 20s | **不扣好感、不惩罚**；M 档改为纯沉默 20s |
| 拖拽 start | 位移>4px | startle（快）→drag | L1 8% | drag_a/drag_b | cloth | — | 本地跟随+回弹，不移动 OS 窗口 |
| 拖拽 move | — | drag loop；尾摆 ×1.5 | L0 | — | — | — | 不追加台词 |
| 落地 | pointerup/drag.end | land | L1 8% | land_a/land_b | heel | 1s | 333ms 后回 idle |
| 悬停 ≥1.2s | 指针在 bbox 内，idle/read | look_out（朝指针方向） | L0 | — | cloth（轻） | 15s | 离开无反应；sleep 中不触发 |
| 双击 | 角色 | 无行为（宿主开 v3 立绘/日程面板） | — | — | tablet_tap | 500ms | 双形态立绘的正入口 |
| 右键 | 角色/窗口 | 无行为（宿主菜单：静音/置顶/工作模式/面板） | — | — | — | — | 不做宠物反应，避免与拖窗冲突 |
| 滚轮 | 角色 | **不做** | — | — | — | — | 不缩放、不切动作；面板滚动照常 |
| 键盘 | 任何 | **不做**（窗口 focused(false)；隐私红线不读键盘） | — | — | — | — | PTT 按钮保留 |
| 长按 >800ms | 任何 | 不做（误触风险，不设隐藏菜单） | — | — | — | — | — |
| 锁屏/隐藏窗口 | — | 暂停 rAF；sleep（已有） | — | — | — | — | 回归不主动说话 |

**明确不做（交互层）**：喂食/投喂；好感度/亲密度条；摸胸/腿/裙等身体部位（热区不覆盖）；脱衣/换装（v1，D 档也不做）；恋爱/主人/宝宝/撒娇称呼；每日签到/礼物/抽卡；惩罚（掉好感/不给饭）；自由聊天 LLM（PTT 关键词分流可保留，但不属本设计）；多指手势。

**表情（128 约束）**：当前 renderer 不绘制表情（`expressions` 是 reserved 字段），设计用 **tag 帧内表情**表达：pat/pat_hand=微点头+半眼、pat_tail=眯眼+回头、refuse=镜片反光/冷眼（独立 3 帧）、startle=睁眼、remind=直视、focus=低垂眼、sleep=闭眼、look_out=侧目、stretch=闭眼、land=眨眼、drag=收紧；`setExpression()` 只作为 QA/宿主记录通道（calm/pleased/listening/sleepy），**不做 DOM 假表情覆盖层**。D 档再评估独立表情通道（≤4 个：calm/glare/pleased/listening）。

## 5. 语音与音效设计

**5.1 声线（设计约束）**：冷静、偏低、语速中偏慢、句尾收；不拖长音、不撒娇、不气声；情绪上限="轻微不悦/一丝赞许"。口癖≈无，允许"嗯。/好。/记下了。/稍等。"极简应答；TTS 拒纯标点（"……"会被 400 拒），停顿用"……嗯。"。只称用户"你"；**禁用**主人/宝宝/亲爱的/小可爱/陪陪我/想你。时机：先动作、后短句；不解释她为什么忙（沉默也是角色）。

**5.2 TTS 事实与参数（官方能力边界）**：DeepSeek TTS 仅 stella/tide 两音色，**不支持语速/情感/克隆**；PCM 24k/16bit/mono→WAV。方案：**预生成 baked 为主**（`assets/voice/tinglan/manifest.json`，结构沿用 `{lines:[{id,text,file}]}`，文件 `<id>.wav`，id 沿用 `pat_a` 风格）；动态句只允许 ≤12 汉字短反应且受日预算；无 key→静音+字幕。声线：stella/tide 各录 6 句盲听（1 人 30min）择优；运行时不改速率；如需更低沉，**烘焙期** pitch −1~−2 半音 / 0.97× 时长（后期处理，不计入本估工，需复听）。计费：汉字×2；沿用 VoiceService `dailyCharBudget`（现 1200 计费字符）；单句 ≤56 计费字符。

**5.3 台词类别与上限**（硬上限：单句 ≤28 汉字、字幕 ≤2 行×14 字、气泡 ≤3.2s；L2 每事件 ≤1 句、绝不连说两句）

| 类 | 触发 | 层 | 汉字上限 | R 档条数 | 备注 |
|---|---|---|---|---|---|
| greet | 启动/回来≥30min | L2 | ≤12 | 2 | 每天 ≤1 + 回来 ≤1 |
| pat | 被摸 | L1 | ≤8 | 3 | 20% 概率 |
| hand/tail | 摸手/尾 | L1 | ≤8 | 4 | 15%/25% |
| drag/land | 拖拽/落地 | L1 | ≤10 | 4 | 各 8% |
| remind | 提醒 P0/P1/brief 未连接 | L2 | ≤12 | 3+模板 | 数字来自 Brief，禁自由文本；brief_off 每会话 1 次 |
| work | 工作态 | L2 | ≤12 | 2 | 低频 |
| break | 休息/久坐 | L2 | ≤12 | 1 | 每天 ≤1 |
| time | 整点/深夜/收工 | L1 | ≤8 | 2 | 深夜只字幕 |
| refuse | 不悦 | L1 | ≤6 | 2 | 必说但极短 |
| ack | 通用应答 | L1 | ≤4 | 1 | — |
| weather | 手动窗景（仅 D） | L2 | ≤10 | 0 | 不接真实天气 API |

**5.4 占位台词（36 条，非情感陪伴；已进 `voice-lines.json`）**：greet_a 早。今天先做哪件？ · greet_b 回来了。进度我记着。 · pat_a 嗯。 · pat_b 一下就好。 · pat_c 头别碰。文件在。 · hand_a 手。 · pat_d 在听。 · hand_b 别碰平板。 · hand_c 等下。 · tail_a 尾巴，别碰。 · tail_b ……我注意到了。 · tail_c 别拽。 · drag_a 放我下来。 · drag_b 抓着领子不合适。 · drag_c 轻点。 · land_a 站稳了。 · land_b 下次先打个招呼。 · land_c 到了。 · remind_a {N} 件今天到期。 · remind_b {N} 件事待看。 · remind_c 这个我没记。 · brief_off 还没连上账本。 · work_a 我在。你忙你的。 · work_b 先做哪件，你定。 · work_c 按顺序来。 · tablet_a 日程在第 3 条。 · break_a 歇十分钟。 · time_a 整点了。 · time_b 该收了。 · refuse_a 不。 · refuse_b 别闹。 · refuse_c 停。 · ack_a 嗯。 · ack_b 好。 · greet_c 先做哪个？ · time_c 快收工了。
**5.5 SFX 清单**（9 类；当前 `sounds` 字段 reserved 未消费，需新增通道）：cloth 衣料摩擦 0.2–0.4s −12dB（pat/drag/stretch，≥300ms）· heel 高跟落地 0.15–0.25s −14dB（land，≥500ms）· glasses_tick 眼镜轻推 0.08–0.12s −18dB（glasses/refuse，≥2s）· tail_swish 尾扫 0.2–0.3s −16dB（pat_tail/drag，≥500ms）· tablet_tap 平板提示/点按 0.1–0.2s −14dB（read/双击/对时，≥2s）· pen 写字/翻页 0.3–0.6s −16dB（write，≥5s）· cough 轻咳 0.3s −12dB（打哈欠后 20%，≥10min）· keyboard 键盘轻敲 0.4s loop −20dB（focus 背景，仅 D 档）· page 账本翻页 0.3s −16dB（read/write 结束 30%，≥8s）。规格：44.1kHz/16bit/mono WAV、峰值 ≤−3dBFS、归一化 −18 LUFS；命名 `sfx/<id>_v1.wav`；总开关+独立音量（默认 65%）；静音全停。
**5.6 口型/字幕**：talk tag 4f loop 作基础口型，需修"333ms 自动回 idle"（§8）；真实口型 3 形态（闭/半/开）× mouthLevel envelope；128 下嘴仅 2–3px，**2 形态足够**；字幕常开（3.2s，可关）；SFX 不触口型；不做音频波形实时分析（Phase 2.5 可选 AnalyserNode）。**不做**：真人配音、声音克隆、情感 TTS、多语言（v1 只中文）。

## 6. 回应层级与发言节制

| 层 | 定义 | 用在 | 表现 |
|---|---|---|---|
| L0 | 动作-only | 默认 | 状态+SFX，无字幕无语音 |
| L1 | 短反应 | 被摸/拖/落/应答 | ≤10 字（类内更严：pat/应答 ≤8），字幕 2s，语音可选 |
| L2 | 长台词 | greet/remind/break/work | 硬上限 ≤28 字（类内 ≤12），字幕 3.2s，语音必配（静音仅字幕） |
| L3 | 沉默 | 忙/困/专注/冷却/spam 后 | 无任何输出（故意设计，不是 bug） |

**闸门算法（宿主纯函数，可测）**：`muted → 无音频，字幕照出（静音不等于静字）`；`state∈{drag,sleep,focus,talk} 且 level<L2 → false`；`now-lastSpeak < gap（L1 6s / L2 20s）→ false`；`60s 内发声≥2 / 1h≥20 / 当日≥120 → false`；`同一 line 10min 内用过 → 换句或 false`；`同一事件连续 3 次 → 概率逐次减半，第 4 次起 0`；否则按事件概率。**每 10 分钟最多 3 次发声**；宁可少说，不可连说。
**每事件概率（R 档）**：head/hand/tail 20/15/25%（其余 L0）；spam refuse 100%（冷却 20s）；drag start 8%；落地 8%（轻放 0）；hover 0%；双击/右键 0%；greet 100%（每日 1）；remind P0 100%（深夜只字幕）/P1 60%；Brief P2（focused/calm）0%（只姿势）；整点/收工 30%；微动作 0%（不配音）。

## 7. 时间/日程/天气/多对象

**7.1 时间（做）**：沿用 `petPhase`（sleep<6/morning<11/midday<14/afternoon<18/evening<22/night≥22）+ 工作日 9–18 语义；时段只改**权重与状态倾向**，不保证整点说话（避免机械感）。

| 时段 | 状态倾向 | 微动作权重 | 语音 | 备注 |
|---|---|---|---|---|
| 06–09 晨 | idle→wake/read | 眼镜↑/写字 | greet 1 次 | 不说"您早"式服务腔 |
| 09–12 上午 | focus（Brief working）/idle | 写字/看平板 | 仅提醒 | 少打扰 |
| 12–14 午 | read/stretch | 哈欠/伸懒腰 | break 1 次 | 不主动说"午休" |
| 14–18 下午 | focus/idle | 写字/看窗外 | 提醒 | — |
| 18–22 晚 | idle/look_out | 看窗外/发呆 | 收工 30% | 不说"辛苦了" |
| 22–06 夜 | sleep（23 后 idle 20min 进入） | 哈欠↑ | 仅字幕 | 与 presence quiet hours 22–8 对齐 |

**7.2 日程/提醒（做，仅 Pet Brief）**：Advisers 是唯一事实源；桌面端只消费 `PetDirective`，不读库、不回写、不自由生成文本。
| Brief 投影 | 事件 | 状态/表现 | 语音 | 约束 |
|---|---|---|---|---|
| commitment.due P0 | remind | remind + 气泡 `{N} 件今天到期` | L2 1 句 | P0 每日 ≤1；投影去重键 |
| brief.ready P1（high risk/concerned） | remind | remind 动作 + `{N} 件事待看` | L2 60% | P1 每日 ≤3 |
| brief.ready P2（focused/calm/pleased） | pose | focus/idle，不开口 | 0 | 只动作/表情 |
| work.state working/waiting/idle (P3) | pose | focus/read/idle | 0 | 进态 60s 冷却；不打断拖拽 |
| commitment.done | pulse success | glasses 微动作 + 表情 pleased | 0 | 不做庆祝动画 |
| 空/过期/非法 | 无 | idle；会话内首次"还没连上账本"1 次后静默 | L1 1 次 | 不编造；TTL 5min |
| 静默时段 22–8 | — | 只 L0/L3；P0 仅字幕不入语音 | — | 与 presence 策略一致 |
| confidence<0.7 / 无 suggestedLines | 忽略 | 动作照常 | — | claims guard：不可追溯→"这个我没记。" |

**7.3 天气（不做）**：无可靠本地数据源；接天气 API = 网络/隐私/合规成本，且与"工作搭子"无关。D 档可选"手动窗景/天气贴纸"（用户自选、不联网、不宣称真实天气）。
**7.4 多对象（不做 v1，Phase 3 预留）**：当前 Scene 有最小骨架、hero 支持单画布多 actor，但缺布局/存档/选中/多角色语义。建议 Phase 3 只做"汀岚+1 访客"（≤2 只、无社交好感、无跨角色对话），复用已有 3.5–5 人天 MVP 估算（REMAINING-WORK §F），本设计不承诺时间。

## 8. 落地映射（FCI 0.2 数据 + 运行时缺口）

**8.1 角色包**：`public/characters/tinglan/character.json`——**已创建 FCI 0.3 behavior-only 包**：id `famling.tinglan`、apiVersion `"0.3"`、canvas `[128,128]`、anchor foot-center、`render:{format:"pixel-hero"}`、behaviorFile、fallback 链；`zones` 5 区（head/glasses/hand+tablet/tail/floor，geometry 待 128 Q 美术标定）；`behavior.json` states 16 + 12 idle variants + rules；`voice-lines.json` 25 条占位台词；**art/audio 尚未制作**，因此只有 behavior-only 可校验，页面暂不能渲染。
**8.2 tag 清单（R）**：idle/focus/read/talk/remind/pat/pat_hand/pat_tail/drag/land/sleep/wake/startle/stretch/glasses/refuse/write/look_out/yawn/tail_flick；呼吸/眨眼/发呆内嵌 idle 无需 tag → **20 tag / ~100 帧**（美术参考，不计入估工；现行 7 tag/36 帧）。refuse 用独立 3 帧（镜片反光/眯眼），不复用 glasses，否则「拒绝」读不出。缺 tag 时 fallback：glasses/look_out/write/yawn/tail_flick→idle；pat_hand/pat_tail→pat；refuse→glasses→idle。**美术分 3 波**：Wave1 现有 7 tag 重画 Orca 版（40 帧）；Wave2 +focus/read/pat_hand/pat_tail/wake/startle（+30）；Wave3 +stretch/glasses/refuse/write/look_out/yawn/tail_flick（+33）。
**8.3 运行时缺口（按当前源码实测，多数需小改）**
| # | 缺口 | 影响 | 最小改动 | 估工 |
|---|---|---|---|---|
| 1 | `priority`/`interrupt` 只声明不执行（behavior 只 decide；scene.deliver 直接切态） | 摸头可打断拖拽 | 宿主事件路由前置判断 + ≤1s at-end 队列 | 1–1.5 天 |
| 2 | ambient 无 when/冷却/衰减/独立微动作层 | 微动作只能纯随机、无法条件化 | `ambient.choices[].when`+`cooldownMs`+宿主衰减；或加 micro 调度器 | 1–2 天 |
| 3 | 无分区命中（hitActor 只返回 actor） | 头/手/尾反应相同 | 读 hitZones→语义事件 `pat.head` 等 | 1–1.5 天 |
| 4 | 无发言闸门（`doPat` 必 say） | 话痨 | `canSpeak()` 纯函数挂 say 前 | 0.5–1 天 |
| 5 | 无 SFX 通道（`sounds` reserved） | 只有语音/静音 | WebAudio 预加载短 WAV + 音量/间隔 | 0.5–1 天 |
| 6 | talk 333ms 自动回 idle（state.after + tag 时长）；hover 无规则；无双击/右键钩子；sleep 20min / focus 10min 的宿主计时未实现 | 口型不同步、缺"看你一眼"/面板入口/作息不入夜 | talk 时长按语音控制；hover dwell→look_out；双击→宿主面板；两个计时器接入 tick | 0.5–1 天 |
| 7 | Pet Brief 未接 UI（消费端模块已实现） | 提醒/工作态无来源 | 轮询/文件监听 + directive→事件映射 | 1–2 天（E2E 另计） |
| 合计 | | | | **5.5–9 天** |

**8.4 与 v3 双形态**：128 Q 只承载 behavior/动画；v3 立绘（1024×1536）只用于双击面板/对话/key art；**不给 v3 做 Q 版动作重绘**；两形态共用 character id，面板用静态图，不进 128 管线。

## 9. 三档内容量与估工（不含美术/音频制作成本，仅设计/实现/测试）

| 项 | M 最低 | R 推荐 | D 豪华 |
|---|---|---|---|
| 高层状态 | 9（复用 7 tag） | 16 | 16（+细分反应） |
| 微动作 | 4（内嵌） | 12 | 14（+整理领带/轻敲平板） |
| tag / 帧（美术参考，不计价） | 7 / 36（沿用） | 20 / ~100 | 25 / ~120 |
| 交互分区 | 1（全身） | 6 | 6 + 边缘/甩动 |
| 台词（baked） | 12–14 | 25 | 60–80 |
| SFX | 3（可后补） | 9 | 9（每类 2–3 变体 + focus 键盘底噪） |
| Pet Brief | 不做 | remind/pose 映射 | +work.state/成功/安静时段全链路 |
| 时段 | 昼夜 | 6 时段 | 6 时段 + 整点/收工/周末 |
| 多对象 / 天气 | 不做/不做 | 不做/不做 | 原型/手动窗景（各另计） |
| 设计 | 1 天 | 2.5–3 天 | 4–5 天 |
| 实现 | 1.5–2 天 | 5.5–9 天 | 14–20 天 |
| 测试/QA | 0.5–1 天 | 2 天 | 3–4 天 |
| **合计（设计+实现+测试）** | **3–4 天** | **10–14 天** | **21–29 天** |

说明：M 档复用现有 7 tag/美术即可上线（行为数据重写）；R 档是"汀岚像汀岚"的推荐值，卡在 20 tag 美术（按~100 帧推算约 30–55 人天，参考 ORCA-RUNTIME 的 13–22 人天/36 帧；美术不计入本估工）；D 档不建议 1.0 前做。R 档估工不含 v3 立绘面板（C 双形态工程 +1–2 天）与美术/音频制作。

## 10. 验收清单与待拍板

**验收（数据/行为，不依赖最终美术）**：①事件→state 的 golden trace 稳定（固定 seed，含冷却/概率）；②6 分区命中→不同状态；③spam→refuse 且不扣任何数值；④发言闸门：60s 内 ≥2 次发声被拒、同句 10min 去重；⑤drag 中 pat 类事件全部 L3；⑥sleep 中 hover 不唤醒、pat 可唤醒；⑦30 分钟内同一微动作不出现 ≥3 次；⑧Brief：P0→remind+台词、P2→只姿态、过期→idle 无文本；⑨静音→无音频但有字幕；⑩`heroSnapshot` 暴露 state/tag/speechGate 供 E2E。
**待拍板**：①R 档美术是否按 3 波制作（决定 20 tag 可行性；否则降 M 档）；②双击面板是否作为 v3 立绘唯一入口（与 C 双形态工程绑定）；③是否允许 P0 在 22–8 出字幕（默认允许 1 次）；④语音选 stella 还是 tide（12 句盲听，1 人 30min）；⑤多对象/天气是否进 1.0（本设计建议否）。

## 附：与现有文档的关系/不重复造

- 契约/字段：本设计只新增**数据内容**与**宿主行为**，不改 FCI schema、不改 render API、不改存档；`extensions["famling.hitZones"]` 走 data-only 扩展。
- 不重复：包/版本协商见 CHARACTER-INTERFACE-V0.2；接线步骤见 PET-INTERACTION-LAYER-PLAN；128 可读性与窗口成本见 REMAINING-ORCA-RUNTIME；隐私红线见 PET-PRIVACY；TTS/ASR 实测见 VOICE-PILOT-RESULTS。
- 本文件只设计行为/语音；美术帧、SFX 制作、TTS 烘焙、v3 立绘页 UI 均为后续工作，不含在本估工。
