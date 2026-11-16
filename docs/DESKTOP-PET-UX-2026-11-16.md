# 桌宠 UX：pet-only 桌面形态、右键菜单与缩放设计（2026-11-16）

- 日期：2026-11-16 · 作者：desktop-pet-ux（设计子代理，**只读**）
- 状态：**设计稿，未实现**。未改代码/资产、未跑构建/E2E/API、未做 git、未写 hub；本文件是唯一写入。
- 需求：2026-11-16 用户指令——桌面只显示桌宠；正常左键拖动/互动；右键功能与设定菜单；1×–4×（或 100–200%）缩放；像素整数缩放；菜单/文本默认等比、文字比例可独立；目标 480×336（=128@2×）。
- 基线核对（写作时）：`pet.html`(91) · `src/pet/main.ts`(1088) · `src/pet/pet.css`(209) · `app/tauri/src-tauri/src/main.rs`(531) · `tauri.conf.json` · `capabilities/default.json`；desktop-games HEAD `86a5299`，工作树仅 `docs/research/<private-doc>.md` 有并发改动。实现前请重新核对行号。
- 复用既有设计（不重复论证）：[PET-INTERACTION-LAYER-PLAN](research/PET-INTERACTION-LAYER-PLAN.md)（拖角色=拖 OS 窗口、部位命中、抛/落）· [HIGH-DPI-SIZING-STRATEGY](research/HIGH-DPI-SIZING-STRATEGY.md)（N-first、480×336 推导）· [DESKTOP-PET-INTERACTION-SURVEY](research/DESKTOP-PET-INTERACTION-SURVEY.md)（分层待机/部位命中/回应分档）· [REMAINING-WINDOWS-QA](research/REMAINING-WINDOWS-QA.md) §2.5 · [REVIEW-2026-11](REVIEW-2026-11.md) #10/#15 · [DECISION-MEMO-2026-11-15](DECISION-MEMO-2026-11-15.md) §5。

## 0. TL;DR

1. **desktop 壳**：`html[data-pet-shell="desktop"]`（Tauri pet 页默认），`?shell=window` 保留现布局给开发/E2E 视觉回归。只改可见性/布局：header/aside `display:none`，`#pet-app/.book/#pet/#bubble` 与全部按钮 id 原样保留（JS `.click()` 仍可用）。
2. **窗口**：pet 窗改 transparent + no shadow + 无边框 + alwaysOnTop(可关) + 不可缩放；**透明区用 Win32 `SetWindowRgn` 做命中裁剪**（菜单/面板打开时临时扩到整窗）。这是对 2026-11-11/11-15「透明/置顶/穿透 = No-Go」的**改判请求**，也动冻结区「Tauri 窗口 flags」→ 必须先记录 D-2026-11-16 并获批准。
3. **交互**：左键短按(<250ms、<6px)=按部位摸；拖动≥6px=宠物移动（`startDragging()` 锚定拖动，宠物跟窗走）；原地按住 600ms=按住说话；右键=HTML 上下文菜单；双击=打开菜单（无右键设备兜底）；Ctrl+滚轮=缩放；Shift+F10/Enter/方向键为键盘等价。
4. **缩放**：Z=1/2/3/4 名义 CSS 倍率，内部按 **N=round(Z×DPR) 整数设备像素**落地（N-first）；窗口逻辑尺寸 `W=max(480,128·Zeff+224)`、`H=max(240,128·Zeff+80)` → 480×240 / **480×336** / 608×464 / 736×592。菜单/面板默认随 Z 等比（`ui=clamp(Z,1,2)`），文字默认同倍，另有独立「文字大小 80–150%」；持久化 localStorage，越界/换屏自动收回工作区。
5. **最大风险**：透明置顶窗 + WebView2 + SetWindowRgn 组合在本机零实测，且推翻既有 No-Go；只做 0.5–1 天 spike，失败则退回「紧贴式不透明小窗 + 同套菜单/缩放」，其余设计不受影响。

## 1. 现状与约束（只列相关项）

| 现状 | 证据 | 对本设计的影响 |
|---|---|---|
| 桌面窗 = 整页：header 19–29、aside.panel 44–68 常驻，宠物只在 `.book` 中间 | `pet.html` | 需新增 desktop 壳，且不能删元素（E2E 选择器契约） |
| 当前窗口 480×240；`--pet-size 480x272` 可选；无 480×336 | `main.rs` `game_route()`:314–323、`parse_pet_size_arg()`:348–352 | 480×336 需改 route 默认尺寸（或前端 `setSize`）；`--pet-size` 保留 QA |
| 窗口 flags：`decorations(false)`、`skip_taskbar`、`focused(false)`；**无 transparent / alwaysOnTop** | `main.rs:410–446`；`tauri.conf.json` | 三件套是新增；透明必须同时 `shadow(false)`，否则矩形阴影露馅 |
| 窗口拖动只靠 header 的 `data-tauri-drag-region` | `pet.html:20`；`main.ts:731–737` | header 隐藏后必须由宠物拖动接管；`?shell=window` 保留 header 拖动 |
| 位置记忆 key `desktop-games/pet/window`，只在 header pointerup/beforeunload 保存；恢复时按当前屏裁剪 | `main.ts:697–729` | 缩放/拖动/换屏都要扩：anchor + zoom + monitor 一起存 |
| E2E 契约：`#pet-app`、`.book`、`aside.panel`、`#pet` rect、全部按钮 id、`#bubble` 文本 | `<private-doc>` §4；`PET-HERO-INTEGRATION` §151 | desktop 壳只改可见性；新增 QA 脚本，不改既有选择器 |
| hero 指针拖动 = canvas 本地跟手 + 松手回弹，**不做窗口拖动** | `main.ts:804–891`；`PET-HERO-INTEGRATION` §213 | desktop 壳要把该分支改成 `startDragging()`；hero 默认关 |
| 已有 window 能力：`currentMonitor`/`setPosition`/`outerSize`/`scaleFactor`；缺 startDragging/setSize/alwaysOnTop/show/hide/ignoreCursor | `capabilities/default.json` | 需加权限（已在 `gen/schemas` 核对存在）：`allow-start-dragging`、`allow-set-size`、`allow-set-always-on-top`、`allow-show`、`allow-hide`、`allow-set-ignore-cursor-events`、`allow-available-monitors` |
| 既有 No-Go：v1 opaque、no click-through、no overlay；透明 companion 独立 No-Go；透明/置顶/穿透估 5–8 人天 + 独立评审 | `REVIEW-2026-11.md` #10/#15；`REMAINING-WINDOWS-QA` §2.5；`PLAN-2026-11.md:116` | 本需求与其冲突：**必须显式改判**，不能当已批准 |
| 480×336 与 128 运行时是建议值，仍标「需用户确认」 | `DECISION-MEMO-2026-11-15` §0/#4/#5 | 本设计沿用 480×336，但把「Z=2 默认」列入待拍板 |
| 已知 bug：`window.open(...,'noopener')` 恒 null（导入入口误报） | `main.ts:1067–1072`；MASTER-STATUS P0-1 | 菜单入口不依赖 `window.open`：走同窗工具页导航（§3.5） |
| 已有 `is_fullscreen`（Win32 SHQueryUserNotificationState） | `main.rs:273–291`；`src/shell/fullscreen.ts` | 全屏自动隐藏可直接复用 |

## 2. 目标 / 非目标

**目标**：桌面上常态只有宠物（含可选气泡）；左键互动/拖动、右键菜单可达全部旧功能与设置；1×–4× 整数像素缩放；菜单/文字默认等比 + 文字独立比例；保留现有摸/拖/说/存档/窗口记忆/E2E 选择器契约与 `?hero=1`、行为预览、Advisers、导入、setup 费用提示。
**非目标**：托盘图标/全局快捷键/多开/换角色 UI（Phase 2）；宠物在窗口内自由走动/物理抛掷（美术+物理，Phase 2）；移动端/macOS/Linux；原生像素菜单皮肤（美术）；应用内 API Key 输入（安全线另立）。

## 3. pet-only 桌面形态

### 3.1 三种壳（同一 HTML，不新开页面）
| 壳 | 触发 | 用途 | 差异 |
|---|---|---|---|
| desktop | **默认**：Tauri pet 页；浏览器加 `?shell=desktop` 预览 | 用户形态 | 只显示宠物+气泡；菜单/面板按需浮现 |
| window | `?shell=window` 或 localStorage 强制 | 开发/E2E 视觉回归、排障 | 即现状：header+侧栏+笔记全显示 |
| panel | desktop 内打开设置/折页簿/Advisers/工具页时 | 临时面板 | 宠物留在底层（可调暗），面板占窗并把 region 提升为整窗 |

解析优先级：`?shell` > localStorage `desktop-games/pet/shell/v1.mode` > Tauri⇒desktop / 浏览器⇒window（浏览器默认保留旧形态便于调试）。E2E：旧 `cdp-pet*.mjs` 走 Tauri 默认 desktop，但按钮 `display:none` 仍可脚本 `.click()`；`cdp-launch.ps1` 可加 `-Shell window` 参数（脚本非冻结区）。**不新增页面**，避免选择器/存档路径分叉。

### 3.2 DOM 保留方案（只改可见性/布局，选择器全保留）
| 元素 | desktop 壳处理 | 兼容说明 |
|---|---|---|
| `#pet-app` | `position:fixed; inset:0; padding:0; background:transparent; display:flex; flex-direction:column` | id 保留；`__pet`/E2E 正常 |
| `header`（含 `data-tauri-drag-region`） | `display:none` | window 壳仍可用 header 拖动；hidden 元素不占布局 |
| `main` / `.book` | `main{display:block;position:absolute;inset:0}`；`.book`=整窗舞台：绝对定位、无边框、透明底、`align-items:flex-end;justify-content:center;padding-bottom:32px` | `.book` 保留且非零；hero runtime 量它取尺寸（需 scaleOverride，见 §5.5） |
| `#pet`（折角占位） | 保留；按 128 画布归一化缩放：`transform-origin:bottom center; transform:scale(calc(var(--pet-css-scale)*128/104))`，rect 随 transform | hero 模式沿用现有 `visibility:hidden` 保留 rect 的做法 |
| `#bubble` | 保留；宠物上方居中、最大宽 90%、字号用 `--ui-font`；`.show` 逻辑不变 | 截图/E2E 文本路径不变 |
| `#hero-stage`/canvas | 底部居中；CSS 尺寸 = `pack.canvas × Zeff`；透明窗下 canvas 背景透明 | `?hero=1`/行为预览保持；新增 `scaleOverride` |
| `aside.panel`、`.actions` 按钮、`#memories`、`.note` | `display:none`（DOM/监听全保留） | 旧按钮 `.click()` 仍触发；笔记信息搬进菜单/设置（读同一 `state`，不读隐藏 DOM 文本）；`aside.panel` rect 变 0×0，旧 layout 脚本只记录不设阈值，desktop 断言放新脚本 |
| `#setup-notice` | desktop 下永不显示；文案搬进设置「模型与 API Key」+ 首启气泡/菜单红点（同 `setup-ack-v1`） | 首启提示仍可见但不再用整幅 banner 遮宠物 |
| `#advisers-panel`/`#memory-screen` + 新 `#pet-menu`/`#pet-settings` | 同窗覆盖层（`position:fixed;inset:0`），`role=dialog`/`role=menu`，打开时 region=整窗 | 现有面板结构复用，只改入口与层级 |

### 3.3 布局草图（文字版）
```
[desktop · Z=2 · 480×336 逻辑 px · 透明=不渲染且点击穿透]
┌──────────────────────────────────────────────┐ 0
│  ░░透明·点击穿透░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░ ┌ bubble 气泡 ┐ ░░░░░░░░░░░░░░░░░  │ 48 ← 气泡区(≤40)
│  ░░░░░░░░ └─────────────┘ ░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░ ┌─────────────┐ ░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░ │ #pet/hero   │ ░░░░░░░░░░░░░░░░░  │ 宠物 256×256
│  ░░░░░░░░ │ 256×256     │ ░░░░░░░░░░░░░░░░░  │ 底边距 32
│  ░░░░░░░░ └─────────────┘ ░░░░░░░░░░░░░░░░░  │ 336
└──────────────────────────────────────────────┘
header/aside = display:none（0×0）；#pet-app/.book = 整窗；命中 region = pet∪bubble∪(打开中的菜单/面板)
Z=1: 480×240（兼容现值）；Z=2: 480×336（目标）；Z=3: 608×464；Z=4: 736×592
```
右键菜单（指针处展开、clamp 在窗口内；打开时 region=整窗）：
```
┌ 宠物菜单 ────────────────┐
│ 摸摸                    │ ← Enter/单击；同旧 #pat
│ 互动 ▸                  │   给纸片/折一下/说句话/按住说话
│ 折页簿…                 │
│ 导入 DeepSeek 会话…     │   副标题：只读公开分享；导入不调模型
│ Advisers ▸              │   简报…/开启/关闭/说明（状态后缀）
│ 设置与窗口 ▸            │   设置…/移动窗口/复位位置/置顶✓/宠物大小▸
│ 关于与声明…             │
│ 退出                    │   保存后退出
└─────────────────────────┘
```

### 3.4 Tauri 窗口行为
- **builder（仅 `id=="pet"`）**：`.transparent(true).shadow(false).decorations(false).skip_taskbar(true).focused(false).resizable(false).maximizable(false).minimizable(false).always_on_top(true)` + `.visible(false)`；前端 shell 初始化完成后 `show()`，避免白闪/尺寸跳变。`--pet-size` 保留，`?shell=window` 仍按旧尺寸。
- **透明 CSS**：仅 desktop 壳设置 `html,body,#pet-app,.book{background:transparent}`；window 壳不动（保持不透明回归基线）。
- **命中裁剪（点击穿透）**：新增 Rust 命令 `pet_hit_region(rects: Option<Vec<Rect>>)`：`Some(rects)`→物理像素矩形并集 `CreateRectRgn`+`CombineRgn`+`SetWindowRgn(hwnd,rgn,1)`；`None`→`SetWindowRgn(hwnd,null,1)`（整窗，菜单/面板/首次加载时）。前端 `scheduleRegionUpdate()` 统一在 rAF+80ms debounce 后发送：shell 初始化、Z 变化、气泡 show/hide、菜单/面板开合、`onScaleChanged`。失败/非 Windows → no-op 并置「穿透不可用」（设置里说明，不回退崩溃）。
- **焦点**：启动 `focused(false)`、不主动 `setFocus`；用户点击/右键才激活本窗。Tauri 未暴露 `WS_EX_NOACTIVATE`，「点击宠物不完全打断当前应用输入」列为 Phase 2 的 Rust 扩展课题；Phase 1 不承诺该效果（见 §7.4 风险 2）。
- **置顶 / 全屏**：默认置顶，设置可关；`is_fullscreen` 2s 轮询，全屏→`hide()`，退出全屏→`show()`；设置可关（默认开）。
- **退出/恢复**：菜单「退出」→`saveNow()`→`close()`（已有 allow-close）；存档失败二次确认。无托盘（skipTaskbar 后靠菜单退出；Phase 2 再评估 tray/全局快捷键）。启动时位置越界必须收回可见区（§5.4），避免「宠物消失且无入口」。
- `setIgnoreCursorEvents(true)` 只留作「全窗穿透」紧急开关，不进默认路径；菜单打开时绝不穿透。

### 3.5 菜单/面板的窗口策略
- 菜单 = **窗口内 HTML 覆盖层**（非原生菜单）：可像素化、可 E2E、可键盘导航；480×336 下根菜单 9 项在 ui=2 时约 320px，装得下。备选 Phase 2 原生 `Menu.popup()`（`@tauri-apps/api/menu` 2.12 可用）：不受窗口限制，但不是像素风、样式不可控、平台差异大。Phase 1 不做原生菜单。
- 设置/折页簿/Advisers = 同窗 panel 覆盖层（沿用现有 `#memory-screen`/`#advisers-panel` 模式），打开时 region=整窗、Esc 关闭、关闭后焦点回宠物。
- 导入/配置页 = **同窗导航**：`chat-import.html?from=pet`、`setup.html?from=pet`；进入前 `saveNow()`，工具页 `setSize(720×560)` 并带「← 返回桌宠」；返回 pet 页启动流程会重新应用 zoom/位置并 `loadNow()`。不依赖 `window.open`（绕开已知 bug），也无需 Rust 建子窗。

## 4. 交互设计

### 4.1 手势仲裁（左键/触摸共用一个 pointer 状态机；阈值可配、可单测）
| 手势 | 判定 | 行为 | 备注 |
|---|---|---|---|
| 左键短按 | down→up ≤250ms 且位移 <6px | 按部位 pat：head/body/tail/crease→`doPat(actorId?)`；hero 模式用 `hero.hitActor()` 取部位 | 复用 kernel/语音/字幕；旧 `#pet` click 在 desktop 壳 early-return，防双触发 |
| 左键拖动 | 位移 ≥6px | Tauri `startDragging()`（锚定抓取点）→宠物跟窗走；hero 发 `drag.start`；松手后 `drag.end`/`land` + 节流保存 anchor | 不做 canvas 本地 translate 回弹（现 hero 行为仅保留给 window 壳/QA）；浏览器降级本地跟手供测试 |
| 长按 | 原地按住 ≥600ms 未移动 | 按住说话 PTT：`startTalk()`，松手 `finishTalk()`；无麦/不支持→一次气泡说明 | 触屏长按默认给 PTT；菜单改用双击/双指轻点 |
| 右键 | `contextmenu`（或 pointer button=2） | 打开根菜单；再右键/Esc/点窗外(整窗 region 内)关闭 | 触屏无右键：双击=菜单（见下）；长按可切给菜单（设置项） |
| 双击 | 300ms 内二次 down（第一次已 pat） | 打开根菜单（无右键设备兜底） | 不额外加 bond；不触发 zoom |
| 滚轮 | desktop 壳内 wheel | **Ctrl+滚轮**=Z 1→2→3→4 循环；普通滚轮=发 `hover/curious`（Phase 2 美术）；`preventDefault` | 触控板双指=普通滚轮，避免误缩放 |
| 拖到窗口外松手 | `onMoved` 静默 150ms | 保持新位置，不 snap；保存 anchor；越界 clamp | 抛掷/惯性/悬挂 = Phase 2（美术+物理） |

### 4.2 宠物拖动 vs 窗口拖动（用户要求的「不是窗口拖动」如何落地）
- Windows 只有一个 HWND：**「宠物移动」的物理结果就是窗口移动**，但两者语义/反馈不同：
  - **宠物移动**（默认左键拖动）：抓取点锚定在宠物身上；播放 `drag.start`/`drag.end`/`land`；松手不弹回（与现 hero `?hero=1` 的本地回弹不同）；这是用户感知的「牵着它走」。
  - **移动窗口模式**（右键菜单「移动窗口」/`Alt+M`）：`html[data-pet-mode="move"]`，光标 grabbing，气泡提示「拖到新位置；Esc 或右键结束」；此模式不播放互动、不触发 pat/PTT，左键在任何命中区只拖窗；用于跨屏/精确摆放。Esc 退出回 normal。
- window 壳：header `data-tauri-drag-region` 原样保留（现状）。
- 键盘移动：`Alt+方向键` 8px、`Shift+Alt+方向键` 1px（按 scaleFactor 换算物理/逻辑）；「复位到右下角」复用 `#reset-window` 逻辑（`main.ts:622–636`）并清位置 key。
- 若产品后续要求宠物**在窗口内**位移（站立点挪动），那是 Phase 2 美术+物理，另立设计，不在本稿混入。

### 4.3 触屏 / 键盘 / 可访问性
- 统一 Pointer Events；宠物与拖动区 `touch-action:none`；`#pet` `tabindex="0" role="button" aria-label="汀岚，桌宠。回车/空格摸摸，Shift+F10 打开菜单，Alt+方向键移动窗口"`。
- 键盘：Tab 进宠物；Enter/Space=pat；Shift+F10 或 ContextMenu 键=菜单；菜单内 ↑↓/Home/End/Enter/Esc、→ 进子菜单、← 返回；设置面板 Tab 顺序 + 焦点陷阱 + `aria-modal` + Esc 关闭；`prefers-reduced-motion` 时关气泡过渡/嘴动画。
- 触屏：tap=pat；drag=移动；长按=PTT（默认）/菜单（设置可切）；菜单行高 ≥44 CSS px（`pointer:coarse`）；不依赖 hover。
- 可读性：字幕始终可用（`#bubble` 不动）；菜单/设置字号 ≥12px（现状 7–10px 属缺口）；费用/错误用文本提示且可复读；对比度跟随系统。
- 语义：菜单项用 `role=menuitem`/`menuitemcheckbox`，`aria-checked` 表达置顶/穿透；危险项（删除存档/退出）醒目标记 + 二次确认。

### 4.4 事件表（实现按此接线）
| 事件 | 来源 | 处理 | 调用/状态 | E2E 影响 |
|---|---|---|---|---|
| pointerdown(button 0) | pet/hero | `ensureAudio()`+resume；记录 down；不 preventDefault | 现有 `ensureAudio`（main.ts:126） | 脚本 `.click()` 不受影响 |
| pointerup 短按 | 同上 | 分区 pat | `doPat(actorId?)`→`patPet`+`say` | 旧 `cdp-pet.mjs` 不点宠物，安全 |
| pointermove≥6px | 同上 | `startDragging()`；hero `drag.start` | `bridge.startDragging()` | 新脚本断言 GetWindowRect 变化 |
| 拖动结束 | `onMoved` 静默 150ms | hero `drag.end`/`land`；保存 anchor | `bridge`/`persist` | 新 |
| 长按 600ms | pet | 启动 PTT / 或菜单（设置） | `startTalk`/`finishTalk` | 需 fake media 可选 |
| contextmenu | 整窗（desktop） | openMenu(x,y)；preventDefault（输入框除外） | menu.ts | 新脚本 |
| keydown | document | 4.3 的键盘映射 | menu/settings/zoom/move | 新脚本 |
| wheel | pet/整窗 | Ctrl→zoom；普通→hero hover cue | zoom apply | 新 |
| 菜单动作：摸摸/给/折/说 | menu | 与旧按钮同一函数 | `doPat/doGive/doFold/startTalk` | `__pet.shell.act('pat')` 供深链 E2E |
| 菜单动作：缩放/置顶/穿透/文字 | menu/settings | applyZoom / `bridge.setAlwaysOnTop` / region / CSS 变量 + 持久化 | zoom/bridge/persist | 新 |
| 菜单动作：Advisers ▸ | menu | toggle / 打开简报 | 现有 `AdvisersFaceController` | 复用现有测试 |
| 菜单动作：导入/配置 | menu | `saveNow()`→同窗导航工具页 | chat-import/setup `?from=pet` | 修 P0-1 前后都可 |
| 菜单动作：退出 | menu | saveNow→close；失败确认 | `saveNow`/`close()` | 新 |
| onMoved / onScaleChanged | Tauri | clamp + persist + region/字体重算 | bridge/zoom | Windows 矩阵 |
| visibilitychange hidden | 现有 | `saveNow()`（保留） | main.ts:638–642 | 不变 |
| fullscreen poll | Tauri | hide/show | `is_fullscreen` | 新 |

## 5. 缩放设计

### 5.1 三层缩放
| 层 | 变量 | 默认 | 规则 |
|---|---|---|---|
| 美术/宠物 | Z=1..4 名义 CSS 倍率 | 2（480×336） | N-first：`N=clamp(round(Z×DPR),1,8)`、`Zeff=N/DPR`；宠物 CSS=`128×Zeff`；canvas 背板=`128×N` 设备像素（Phase 2）；DOM 占位 `image-rendering:pixelated`+transform |
| 菜单/面板 | `uiScaleMode`=跟随/固定(75–200%) | 跟随 `ui=clamp(Z,1,2)` | 菜单盒/行高/间距按 ui；面板打开不改变窗口尺寸 |
| 文字 | `textRatio` 80/90/100/120/150% | 100% | `font=clamp(12, round(12×ui×ratio), 32)px`，行高 1.4；中文最小 12px（替代现状 7–10px） |

「等比」定义：Z1→Z2 菜单/文字严格 ×2；Z3/Z4 封顶 2×，防止菜单吞掉桌面；需要严格等比可在设置切「固定 200%」再调文字比例。用户要求的「文字比例独立」= `textRatio`，任意 Z 下可调；菜单行高 `max(28, round(font×1.5))`（Z2≈36，9 项根菜单约 320px 仍装得下 336）。

### 5.2 窗口尺寸矩阵
公式：`Zeff=N/DPR`、`petCss=128·Zeff`、`W=max(480, ceil((petCss+224)/4)*4)`、`H=max(240, ceil((petCss+80)/4)*4)`。
| Z | N @ DPR 100/125/150/175/200% | pet CSS（100% / 150% / 200%） | 窗口逻辑（100%/150%/200%） | 用途 |
|---|---|---|---|---|
| 1× | 1 / 1 / 2 / 2 / 2 | 128 / 171 / 128 | 480×240 / 480×252 / 480×240 | 兼容现值/省屏 |
| 2× | 2 / 3 / 3 / 4 / 4 | 256 / 256 / 256 | **480×336** / 480×336 / 480×336 | 默认（目标） |
| 3× | 3 / 4 / 5 / 5 / 6 | 384 / 427 / 384 | 608×464 / 652×508 / 608×464 | 大字/展示 |
| 4× | 4 / 5 / 6 / 7 / 8 | 512 / 512 / 512 | 736×592 / 736×592 / 736×592 | 展览/大屏 |

注：125%/175% 下部分档位 CSS 尺寸 ±20% 偏移（N-first 的已知代价，见 HIGH-DPI 研究）；100%/150%/200% 三档与名义一致，覆盖绝大多数 Windows 用户。窗口尺寸按 4 的倍数取整，避免半像素。若只想「100–200%」：用 1×/2× 两档 + 菜单固定百分比即可；不提供连续滑块，避免 125%/175% 的分数 CSS 缩放发虚。

### 5.3 菜单/文本默认等比 + 独立比例
- 默认 `ui=clamp(Z,1,2)`：Z1 文字 12px/行高 28；Z2 文字 24px/行高 36（9 项根菜单 ≈320px，装得下 336；Z1 的 240 高窗口需滚动）。Z3/Z4 菜单仍 2×，宠物更大但不遮桌面。
- 设置项「菜单缩放」：跟随宠物 / 固定 100 / 125 / 150 / 200%；「文字大小」：80 / 90 / 100 / 120 / 150%（默认 100）。两档叠加后 font 仍 clamp 12–32，防止不可读/溢出。
- 字体：系统「Microsoft YaHei / Segoe UI」（中文像素字体授权/清晰度另立 Phase 2）；字号取整到 CSS px，避免分数抗锯齿。
- 所有改动即时预览；滑块类 debounce 300ms 落盘，避免写爆 localStorage。

### 5.4 持久化 / 恢复 / 越界 / 多屏
- 键：`desktop-games/pet/shell/v1`（JSON：`version/mode/petScale/uiScaleMode/uiScale/textRatio/alwaysOnTop/clickThrough/fullscreenAutoHide`）；`desktop-games/pet/window/v2`（`{anchor:{x,y}, monitor:{name,scaleFactor}, zoom}`，物理屏幕坐标）；兼容读取旧 `desktop-games/pet/window` `{x,y}` 并迁移。
- Anchor = 宠物底边中点（物理坐标）。缩放时保持 anchor：`newX=anchorX-W1/2`、`newY=anchorY-(H1-32)`；再 clamp 到 `monitor.workArea`（Tauri 2.12 `Monitor.workArea` 可用），至少留 16px 可见；anchor 屏不存在→主屏右下（复用 `placeBottomRight`）。不做自动吸附网格（Phase 2）。
- 保存时机：缩放/位置变化后 debounce 300ms、菜单关闭、`beforeunload`、`visibilitychange hidden`。启动顺序：读 shell config → 读 window/v2 并校验 → 先 `setSize`+`setPosition` → `show()`（**不要**沿用现有 600ms 延迟恢复，避免可见跳变）。
- 越界：加载、换屏、DPI 变化、缩放后都 clamp；非法/NaN/超界坐标丢弃回默认；设置提供「复位到右下角」与「恢复默认」。
- 多屏/DPI：允许跨屏拖动；松手后按 `currentMonitor()` 重新算 DPR→N→窗口尺寸（逻辑尺寸窗口跨屏自动换 DPI，`onScaleChanged` 触发重算 region/canvas/字体）；Z×DPR 非整数时按 N-first 重算并允许 ±20% 视觉变化。
- 兼容：`?shell=window` + `--pet-size 480x272` 保持；240/272 媒体查询只在 window 壳生效（desktop 规则全部前缀 `html[data-pet-shell="desktop"]`，避免打架）；480×336 是新默认（Z2），240 是 Z1。

### 5.5 hero/行为预览接线
现 `pickHeroScale` 按 `.book` 实测（480×240⇒1×、480×272⇒2×）；desktop 壳 `.book`=整窗会被误判为大空间。方案：`hero-runtime` 增 `scaleOverride?: number`（默认 null 保持现行为），desktop 壳传 `Zeff`；window 壳不变。`?character=`/`?heroScale=` 的 QA 行为保留。行为预览（tinglan-preview）是 HUD 文本层，desktop 下按 panel 覆盖层显示，菜单「行为实验台」入口 Phase 2 再加。

## 6. 菜单信息架构与文案（中文）

### 6.1 根菜单（右键/双击/Shift+F10；9 项，2–3 条分隔线）
| # | 文案 | 动作 | 备注 |
|---|---|---|---|
| 1 | 摸摸 | pat | Enter；同旧 `#pat` |
| 2 | 互动 ▸ | 给纸片 / 折一下 / 说句话 / 按住说话 | 同旧 `#give`/`#fold`/`#talk`；PTT 也支持长按 |
| 3 | 声音 ▸ | 静音/取消静音（当前态）/ 音量 + / 音量 − / 清语音缓存… | 同旧 `#mute`/`#vol`/`#voice-cache`；音量与设置 sheet 同状态 |
| 4 | 折页簿… | 打开 memory panel | 旧 `#memory-book` |
| 5 | 导入 DeepSeek 会话… | 同窗工具页 | 副标题：只读公开分享；导入本身不调模型、不产生费用 |
| 6 | Advisers ▸ | 简报… / 开启 / 关闭 / 说明 | 状态后缀：关 / 开 / 未找到简报 / 已过期 |
| 7 | 设置与窗口 ▸ | 设置… / 移动窗口 / 复位到右下角 / 置顶 ✓ / 宠物大小 ▸（1×/2×/3×/4×，实际 128×N 设备像素） | 当前项打勾；100%/200%/300%/400% 名义值 |
| 8 | 关于与声明… | 设置「关于」页 | 版本/非官方/AI 披露/许可/roleplay 边界 |
| 9 | 退出 | `saveNow()`→close | 存档失败二次确认 |

「设置…」打开同窗设置 sheet，不再做 3 层子菜单（480×336 容不下）。

### 6.2 设置 sheet 字段
- **外观**：宠物大小 1×/2×/3×/4×（含实际像素提示）· 菜单缩放（跟随宠物/固定百分比）· 文字大小 80–150% · 置顶开关 · 透明区点击穿透开关（不可用时置灰+原因）· 全屏自动隐藏开关。
- **声音**：静音/取消（旧 `#mute`）· 音量滑杆（旧 `#vol` 同一状态）· 清语音缓存（旧 `#voice-cache`）。
- **模型与 API Key**：状态「未配置（仅本地占位）/ 已检测到 key」· 费用提示 · 「查看配置说明」→ setup 工具页；**不读取/不回显 key**；无应用内 key 输入（沿用环境变量，keyring 另立）。
- **数据与隐私**：保存/读取（旧 `#save/#load`）· 备份存档/导入存档/删除存档（旧 `#save-export/#save-import/#save-delete`）· 折页簿/忘掉全部 · 说明：DPAPI 本机加密、换机不可恢复、备份口令丢失无法找回。
- **辅助功能**：减少动态效果 · 快捷键说明（只读）· 字幕始终开（无开关）。
- **关于**：版本（`package.json` 0.1.0）· 非官方/不关联 DeepSeek · AI 生成披露（DECLARATIONS.md）· 许可摘要 · 返回。

### 6.3 关键文案（可直接实现）
- 费用（导入副标题 / 模型设置节顶部）：「会调用你自己的 API 账户并产生费用；本应用不代付、不赠送额度。」
- 导入说明（保留工具页现文案并补一句）：「只支持你主动提供的公开分享链接；不登录、不抓私有会话。当前只做本地摘要，不调用模型、不产生费用；未来的模型融入会单独确认费用。」
- 模型/API Key：「未配置时只用本地占位能力；配置见 setup（环境变量 DEEPSEEK_API_KEY）。应用不会上传你的 key，也不会把它写进日志。」
- Advisers：「只读简报，来自本机 pet-brief.json；不读数据库、不改账本。可能含第三方信息（客户名/承诺），屏幕共享前请关闭面板。」
- Roleplay 边界（「关于」页 + 首启气泡；与 [TINGLAN-ROLEPLAY-VALUES](TINGLAN-ROLEPLAY-VALUES-2026-11-16.md) §6.2 对齐）：「我是汀岚，一个 AI 桌面秘书，不是真人，也没有真实情感或意识。我能陪你把事情理清楚、做场景演练，但不建立恋爱、主仆或独占关系，也不提供医疗/法律/心理诊断。重要的事，请自己核对或找专业人士。」另：「可演场景/虚构角色，不演恋爱、性、真实人物、专业权威、官方；随时说『出戏』就回来。」
- 首启气泡（替代现整幅 banner）：「使用前请配置你自己的模型与 API Key：模型/语音调用会产生费用，由你的账户承担。」（沿用 `setup-ack-v1`；菜单红点直到 ack）
- 穿透不可用：「当前系统不支持透明点击穿透；未穿透区域会接收点击。」
- 退出：「退出前会保存；下次从开始菜单重新启动。」

### 6.4 与其他线兼容
Advisers：只调现有 controller 的 toggle/panel/status，不新增生产端依赖；顺手修审计 P2-4（过期简报进面板）；Advisers 仍是独立 MIT 仓，本设计不改其许可/契约（见 [ADVISERS-INDEPENDENCE](research/ADVISERS-INDEPENDENCE-2026-11-16.md)）。导入：复用 `chat-import.html` 与其费用提示，只换入口；同窗 P0 路线与 [DSH-DEEPSEEK-IMPORT](research/DSH-DEEPSEEK-IMPORT-2026-11-16.md) 一致。模型/API：沿用 setup.html + 环境变量，不引入新凭据存储。桌面壳隐藏 header 的「羁绊/纸片/折物」数值，与 roleplay 线「UI 不展示好感/等级」一致；kernel/存档数值不动（冻结区）。AI 标识/依赖提醒/连续使用提醒由 roleplay 线与监管线执行；本设计只预留宠物角标「AI」与设置项（Phase 2），Phase 1 不常驻显示。

## 7. 实现计划

### 7.1 文件 / 函数 / 状态（建议）
| 文件 | 变更 | 内容 |
|---|---|---|
| `pet.html` | +少量 | 加 `#pet-menu`（`role=menu` hidden）、`#pet-settings`（`role=dialog` hidden）；不改既有 id |
| `src/pet/pet.css` | 追加 | 全部 desktop 规则前缀 `html[data-pet-shell="desktop"]`；菜单/设置/动画；window 壳零改动 |
| `src/pet/shell/config.ts`（新） | 纯函数 | `resolveShellConfig({search,storage,hasTauri})`；校验/默认/schema v1 |
| `src/pet/shell/zoom.ts`（新） | 纯函数 | `resolveDisplayScale({z,dpr})→{n,zeff,petCss}`、`windowSizeFor`、`anchorFor`、`clampWindowToWorkArea`、`fontPx` |
| `src/pet/shell/gestures.ts`（新） | 纯函数 | `classifyGesture({downAt,upAt,dx,dy,button,pointerType})→pat/drag/longpress/double/context` |
| `src/pet/shell/menu.ts`（新） | DOM | 菜单 IA 树、渲染、子菜单、键盘导航、动作分发、`window.__pet.shell.act()` |
| `src/pet/shell/settings.ts`（新） | DOM | 设置 sheet 分节、控件→apply、即时预览、重置 |
| `src/pet/shell/region.ts`（新） | Tauri 桥 | 计算可见 rect（宠物/气泡/菜单/面板）→`invoke('pet_hit_region')`；debounce；无 Tauri no-op |
| `src/pet/shell/bridge.ts`（新） | Tauri 桥 | startDragging/setSize/setPosition/setAlwaysOnTop/show/hide/monitors/onMoved/onScaleChanged；HAS_TAURI 保护 |
| `src/pet/shell/persist.ts`（新） | 纯+storage | 读写/迁移/损坏回退/旧 window key |
| `src/pet/main.ts` | 小改 | 初始化 shell；旧 `#pet` click/hero 指针在 desktop 壳 early-return 或改窗口拖动；菜单动作复用 `doPat/doGive/doFold/say/saveNow/loadNow/mute`；`__pet.shell` 只读 QA 快照（additive，不改现有键） |
| `app/tauri/src-tauri/src/main.rs` | 增 | pet builder flags；`pet_hit_region(Option<Vec<Rect>>)`；可选 `pet_open_tool`（本稿走同窗导航，不依赖） |
| `capabilities/default.json` | 增 | 见 §1 权限清单 |
| `tauri.conf.json` | 不改（Phase 1） | pet 窗 flags 在 Rust builder；tray/全局快捷键 Phase 2 再动 |
| `scripts/cdp-pet-desktop.mjs`（新） | E2E | desktop 壳 DOM/菜单/缩放/键盘断言 |
| `scripts/e2e-tauri.ps1` | 追加 | pet desktop 结果字段；不改旧断言 |
| `tests/pet-shell.test.ts`（新） | 单测 | §7.3 |

状态：`ShellState{ mode, petScale, uiScaleMode, uiScale, textRatio, alwaysOnTop, clickThrough, fullscreenAutoHide }` + `WindowState{ anchor, monitor, zoom }`；运行时 DOM 属性只读镜像 `html[data-pet-shell]`、`html[data-pet-zoom]`、`html[data-pet-mode]` 供 E2E/CSS 使用。

### 7.2 Phase 划分（无美术 vs 需美术）
- **Phase 1A（无美术，浏览器可验，约 3.5–4.5 人天）**：shell config/持久化、desktop CSS、菜单、手势（浏览器内本地拖动降级）、DOM 占位缩放、设置 sheet、首启/费用/roleplay 文案、浏览器 E2E + 单测。可先合入，默认 desktop 用 flag 控制，QA 稳定后转默认。
- **Phase 1B（Windows 窗口实验，约 4–6 人天，含 spike 0.5–1）**：Rust transparent/shadow/topmost/不可缩放、region 命令、startDragging 接线、anchor/monitor/DPI 恢复、全屏隐藏、权限、Windows E2E 矩阵。**前置：D-2026-11-16 批准（撤销透明 No-Go + 动冻结 Tauri flags）**。
- **Phase 2（需美术）**：128 真帧接入（整数 N 背板/DPR）、alpha mask 精确命中、拖/抛/落/悬挂动画、像素菜单皮肤/气泡尾巴、像素中文字体（需授权评估）：美术 10–20 人天 + 工程 2–3 人天。
- 顺序不可倒置：先定 Phase 1 的尺寸/字号/region，再让美术出帧，否则返工。

### 7.3 测试 / 验收
- 单测 `tests/pet-shell.test.ts`：config 默认/非法 query/损坏 JSON/越界枚举；zoom 公式遍历 DPR{1,1.25,1.5,1.75,2}×Z{1–4}（N 必为整数、窗口尺寸单调、anchor 守恒）；clamp（负坐标/超界/副屏/工作区过小）；gesture 阈值边界（5/6px、249/250ms、599/600ms、双击 300ms）；persist round-trip + 旧 key 迁移；菜单 IA id 唯一、每个 action 有 handler（纯数据）。
- 浏览器 smoke（Chrome headless+CDP，`cdp-pet-desktop.mjs`）：`?shell=desktop`→header/aside `display:none`、`#pet-app/.book/#pet/#bubble` rect>0；右键开菜单且焦点在第一项、Esc 关闭；Z 1–4 后 `#pet` rect 单调增大；`textRatio` 改 computed font-size 且 ≥12px；Enter=pat（`__pet.state.bond`+2）；Shift+F10 开菜单；`?shell=window` 旧布局与旧脚本全过。
- Tauri Windows（Phase 1B，新验收替代旧 R1–R4 反向回归）：R1' 透明（四角透桌面、无 DWM 矩形阴影）· R2' 置顶开/关（`WS_EX_TOPMOST` 切换）、启动不抢焦点（前台标题前后不变）· R3' 穿透（点透明角落→下层窗口收到；点宠物→bond+2；菜单打开时整窗接收）· R4' 拖动（`GetWindowRect` 位移、抓取点不跳）· R5' 缩放（Z1–4 物理尺寸、重启恢复、越界回收）· R6' DPI 100/125/150/175/200%（N 整数、无裁切、字≥12、region 对齐）· R7' 多屏/混合 DPI/重启位置 · R8' 全屏隐藏与恢复 · R9' 退出前存档写入。
- 回归：`npm test`（299+新增）、`npm run typecheck`、`npm run build`；`cdp-pet.mjs`/`cdp-pet-layout.mjs`/`cdp-pet-portable.mjs` 两壳均过；`e2e-tauri.ps1` 只追加字段不改旧字段。视觉验收（Phase 2）：`docs/look-test` 截图矩阵 1–4× × DPR × 两壳 + 透明四角棋盘底检查。

### 7.4 风险（按严重度）
1. **【最高】透明置顶窗+WebView2+SetWindowRgn 零实测，且推翻 No-Go/动冻结 flags**：失败=黑底、阴影矩形、穿透失效、region 与 DPI 错位、整窗失焦。缓解：独立 spike（0.5–1 天，Win10/11 各一轮），先 `?shell=window` 兜底，region 失败退化为「紧贴小窗」；spike 未通过不排正式工期。
2. **焦点/激活**：Tauri 未暴露 `WS_EX_NOACTIVATE`，点击宠物会激活本窗、可能打断用户输入。缓解：Phase 1 记录为已知限制，不宣称「不抢焦点」；Phase 2 评估 Rust 扩展 + 托盘，同时保留键盘可达路径。
3. **E2E/契约漂移**：header/aside 隐藏、`#pet` rect 变化、`.book` 尺寸变化可能影响旧断言/hero 布局。缓解：`?shell=window` 保底、选择器全保留、hero 加 `scaleOverride`、新旧脚本双跑。
4. **region 与动态内容不同步**：气泡/菜单/缩放/DPI 变化可能留残影或吞点击。缓解：单一 `scheduleRegionUpdate()`（rAF+80ms）、截图/点击 E2E 回归。
5. **3×/4× 窗口过大**（736×592）挤占小屏；只作可选展示档，菜单给提示，默认 2×。
6. **多屏/DPI 恢复偏移**：物理坐标×逻辑尺寸×scaleFactor 三元组在换 DPI 后可能漂移；按 workArea clamp，R6/R7 覆盖。
7. **小窗菜单溢出/中文换行**：480×240（Z1）必须 max-height+滚动；文案用短标签，不放大段说明到菜单。
8. **合规/文案**：费用/roleplay/AI 披露需与 DECLARATIONS 一致，属法务线确认；本稿只是建议文本。
9. **依赖旧产物/未发布命令**：新 Rust 命令需重建 exe；旧二进制/旧 E2E 不能当证据（同 MASTER-STATUS）。
10. **单实例缺失**：双开写同一窗口位置/存档（既有审计缺口），本线不修，仅记录。

## 8. 待拍板 / 决策记录
- **D-2026-11-16（需写入 DECISIONS）**：撤销 2026-11-11 v1「opaque / no click-through / no overlay」与 R2「不置顶」；批准为 pet-only 改冻结区「Tauri 窗口 flags」；验收由 R1–R4 反向回归改为 §7.3 的 R1'–R9'。
- 用户确认项：① desktop 壳为 pet 页默认（`?shell=window` 仅开发/E2E）；② 默认 Z=2/480×336（保留 Z1/480×240 兼容）；③ 置顶默认开；④ 透明区穿透默认开（失败置灰说明）；⑤ 是否允许 3×/4×（窗口最大 736×592）；⑥ 菜单用 HTML 覆盖层而非原生菜单；⑦ roleplay/费用/Advisers 文案定稿。
- 本稿未做：代码/资产改动、Tauri 构建、E2E 实跑、API 调用、git、hub 写入。实现前复核 HEAD 与行号（工作树可能被并发修改）。
