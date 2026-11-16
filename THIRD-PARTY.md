# THIRD-PARTY（第三方素材与依赖台账）· 草案

> **状态：DRAFT（草案）— 待用户（PerryLink）+ 律师确认。** 快照：2026-11-15。
> 本文件不是法律意见。目的：公开任何版本前，把仓库内/发布包内的第三方素材盘点清楚，
> 让 **TBD = 0**、让每个被跟踪的第三方产物都有可核对的条款与处置动作。
> 相关文件：`NOTICE`（汇总声明）、`LICENSE-ART`（Orca OC 美术）、`AI-PROVENANCE.md`（AI 生成记录）、`docs/LEGAL-STATUS-2026-11-15.md`（状态与清单）。

## 0. 盘点方法（可复核）

```bash
git ls-files '*.wav'                                  # 18 个
git ls-files '*.png' | sed -E 's|/[^/]+$||' | sort | uniq -c
git ls-files | grep -Ei '\.(exe|ttf|otf|woff2?|mp3|ogg)$'
git log --oneline --stat -- assets/voice/pet   # 3 个提交
sha256sum assets/voice/pet/*.wav
```

盘点结果：**git 跟踪的第三方音频 18 个（DeepSeek TTS）；已确认的第三方图片 0 个（来源未确认 1 个：Tauri 图标，见 §5）；第三方字体 0 个；第三方可执行文件 1 个（rustup-init.exe，应移出）；其余 tracked PNG/HEX/JSON 为项目自有占位/截图/规范。** 参考同人图与 Pearl AI 草稿在 gitignore 内，**不在发布范围**。

## 1. 分级定义

| 标记 | 含义 |
|---|---|
| **可发布** | 条款明确允许随产品/仓库分发（含所需的署名/许可文本） |
| **内部占位** | 仅开发/测试可用，**不得**进入公开发布包、商店页、宣传素材 |
| **待确认** | 条款/来源需上游或律师确认；确认前按“不可发布”处理 |
| **应移出** | 不应留在仓库/发布包，需清理或迁出 |

## 2. 已跟踪的第三方音频：DeepSeek TTS（18 个 WAV）— **待确认 / 内部占位**

### 2.1 事实

| 项 | 值 |
|---|---|
| 路径 | `assets/voice/pet/*.wav`（仓库内，git 跟踪） |
| 数量 | **18**（不是早期文档写的 10；10 为首轮 pilot，后续补 8） |
| 总字节 | **1,588,632 B** |
| 格式 | PCM WAV，24,000 Hz，单声道，16-bit（脚本实测） |
| 服务/音色 | **DeepSeek TTS API**，`voice_id=stella`，`format=wav`，endpoint `https://api.deepseek.com/v1/tools/tts`（`scripts/voice-pilot.mjs`） |
| manifest | `assets/voice/pet/manifest.json`（`"voice": "deepseek-stella-pilot"`，18 句台词 + 文件映射） |
| 生成日期 | 2026-11-14 |
| 生成提交 | `86de18c`（首轮 10 个 TTS，替换掉更早的本地 SAPI 占位）、`9c15330`（补 8 个） |
| 计费字符（估算） | 256（按 `scripts/voice-pilot.mjs` 的规则：中文 2、其他 1） |
| 成本记录 | 首轮 10 句 stella：156 计费字符、估算 **¥0.0234**（`docs/VOICE-PILOT-RESULTS.md`）；补录 8 句的成本**未单独入账 ⇒ TBD** |
| 当前用途 | 桌宠预生成语音占位（“development placeholder, not final voice”） |

文件清单与大小：

```text
fold_a.wav 88364    fold_b.wav 103724   give_a.wav 76844
give_b.wav 90284    give_c.wav 78764    hello.wav 48044
idle_a.wav 103724   idle_c.wav 69164    morning_a.wav 132524
need_paper.wav 76844 night_a.wav 109484 pat_a.wav 84524
pat_b.wav 73004     pat_c.wav 73004     pat_d.wav 36524
rename_a.wav 73004  rename_b.wav 128684 return_a.wav 142124
```

> 历史说明：更早的 10 个 WAV 由本机 Windows SAPI 生成（已提交 `f57ca62`，后被 `86de18c` 替换，**当前仓库已不含 SAPI 版本**）。`docs/VOICE-PILOT-RESULTS.md` 中“ASR 输入 hello.wav 63,514 B，SAPI 生成”指被替换前的旧文件；当前 `hello.wav` 为 48,044 B 的 DeepSeek TTS 版本。旧 SAPI 文件在 gitignore 的 `artifacts/voice-sapi/`（本地，未跟踪）。

### 2.2 条款状态（**TBD，需上游/律师确认**）

- 研究快照（`docs/research/LEGAL-IP-ORCA.md` §6.2）称：DeepSeek 开放平台服务协议（2026-04-29 生效）§4.2 输出权利归用户、§8 要求向终端用户明确披露输出系 AI 生成。
- **本轮未重新核对官方原文**，且未确认：
  1. `stella` 音色是否允许**商业使用**、是否允许**再分发预生成音频文件**（尤其随游戏/桌宠分发）；
  2. 是否要求保留特定署名/水印/元数据；
  3. 是否限制将输出用于**音色克隆/训练**（本项目不做克隆，但需明确）；
  4. 平台协议更新后的最新文本（以官方为准）。
- ⇒ 在这 4 点确认前：**WAV 按“内部占位、不可发布”处理**；发布包若使用，须替换为已确认条款的语音或取得书面许可。

### 2.3 处置动作

- [ ] 由用户/律师核对 DeepSeek 最新 TTS 条款（含商业与再分发），记录条款版本 + 日期 + 链接到本文件。
- [ ] 若条款不允许再分发：公开前**替换**全部 18 个 WAV（自录/授权配音/明确许可的 TTS），或只保留运行时云 TTS（不预生成分发）。
- [ ] 若允许：在 `NOTICE`/`CREDITS` 增加“AI 合成语音（DeepSeek TTS, stella）”披露，并保留生成记录（脚本版本 + manifest + 日期）。
- [ ] 每句台词与文件 hash 入 `AI-PROVENANCE.md` §4（新增记录模板），便于替换/追溯。
- [ ] 确认 `artifacts/voice-sapi/`、`artifacts/` 下其他生成物始终在 gitignore 内（当前是）。

## 3. 参考同人图（14 张 + 1 张 contact sheet）— **禁止发布 / 仅本地**

位置：`art/_private-reference/refs/`（`.gitignore` 的 `art/_private-reference/*` 内，**未跟踪、未发布**）。逐图来源与许可见 `art/_private-reference/refs/PROVENANCE.md`。

| # | 文件 | 上游/作者 | 声明许可 | 处置 |
|---|---|---|---|---|
| 01–03 | `01-github-guyusky-idle/happy/thinking.png` | guyusky / `dsh-whale-girl-plugin` | MIT（推定） | 仅本地；如要发布需逐图核实/署名 |
| 04 | `04-github-vlln-idle-poseA.png` | vlln / `whale-girl` | MIT（推定） | 仅本地 |
| 05–06 | `05-github-dshtui-pixel-happy.png`、`06-github-dshtui-pixel-idle06.png` | ccch1mneyyy / `dsh-TUI` | MIT（推定；像素精灵可能源自上游，未核实） | 仅本地 |
| 07 | `07-github-aigisx-icon.png` | aigisx / `dsh-plugin-whale-girl` | MIT（推定） | 仅本地 |
| 08 | `08-github-meteornox-dsniang1.png` | MeteorNOX | MIT（推定；社区同人上游不确定） | 仅本地 |
| 09 | `09-github-duma520-pet-pat.png` | duma520 | MIT 与 README 版权声明**冲突**（TBD） | 仅本地 |
| 10 | `10-web-issue36-character-sheet.png` | JerryZRic（ref10） | unknown fan art（无授权） | **禁止**；仅本地 |
| 11 | `11-web-issue66-threeview-maid.png` | 世界猫；上游 ZipZipPipe / 上善无形 | **CC BY-NC-SA 4.0** | **禁止商用/需完整署名链**；仅本地 |
| 12 | `12-web-issue02-qchibi.png` | hyq13886640 | unknown fan art | **禁止**；仅本地 |
| 13 | `13-web-issue37-qchibi.png` | AATINF | unknown fan art | **禁止**；仅本地 |
| 14 | `14-web-issue56-fullbody.png` | 陆玖叁（says693） | unknown fan art | **禁止**；仅本地 |
| — | `contact-sheet.png` | 本项目合成（基于上述 14 张） | 受上游约束 | 仅本地，不发布 |

相关但同样不可发布的：`art/_private-reference/refs/ai-drafts/ref10-front-crop.png`、`ref10-front-crop-padded.png`（ref10 裁剪派生，无授权；曾上传 OpenRouter 用于内部 Pearl 草稿，见 `AI-PROVENANCE.md` §3）。

**动作**：
- [ ] 公开前再次确认 `art/_private-reference/` 全部仍在 gitignore（当前是）；不要 `git add -f`。
- [ ] 不把 refs 图片用于商店页、press kit、宣传、公开演示或发布包。
- [ ] 不把 refs 图上传到任何会保留/复用内容的 API 做发布素材（历史 Pearl 草稿违规风险见 `AI-PROVENANCE.md`）。
- [ ] 若未来要发布某张：逐图取得作者书面许可，或替换为明确可商用/可再分发的来源，并在本文件登记。

## 4. 字体 — **无第三方字体随仓分发**

- `git ls-files` 未发现 `.ttf/.otf/.woff/.woff2`；代码仅用系统字体栈：`"Segoe UI", "Microsoft YaHei", ui-sans-serif, system-ui, ui-monospace, Menlo, monospace`。
- 含中文的 `Microsoft YaHei` 属 Windows 系统字体，随 OS 授权；不能把字体文件打进安装包。
- 动作：若将来打包 Web 字体（如像素字体），必须单独取得 OFL/商用授权，并把许可文本放 `licenses/` + 更新本文件。

## 5. 已跟踪的二进制/图标/生成物（需处置）

| 项 | 路径 | 事实 | 风险/许可 | 处置 |
|---|---|---|---|---|
| Rust 安装器 | `.rustup-win/rustup-init.exe`（**git 跟踪**，12,839,424 B） | 第三方 Rust 工具链安装器；`.gitignore` 虽写 `.rustup-win/`，该文件仍被跟踪（历史误提交） | 第三方二进制；rust-lang 项目惯例 **MIT OR Apache-2.0**，但**仓内无随附许可文本、未核对 ⇒ TBD**；且与产品无关、体积大 | **应移出**：`git rm --cached .rustup-win/rustup-init.exe`（保留本地文件），加入发布前检查；不要随包分发 |
| Tauri 应用图标 | `app/tauri/src-tauri/icons/icon.png`、`icon.ico` | W1 Tauri 构建提交 `09b2818` 加入；**来源未记录（TBD）**，似占位笑脸图标 | 若为自绘：项目自有；若来自模板/第三方：需许可/替换。当前**不是**最终品牌 Logo | **待确认**；发布前替换为正式图标并记录来源/作者（商标/名称未定时不要定稿品牌图标） |
| 桌宠占位 pack | `public/assets/pet/{cat,dog,pearl}-placeholder/`（108 PNG + 3 manifest） | `scripts/placehold.py` 确定性生成（无图像模型） | 项目自有占位素材；`pearl-placeholder` 的**角色设计**关联 Pearl/溟月链（非商业） | 标注 placeholder-only；`pearl-placeholder` 不随商业版发布；最终美术另授权 |
| 应用截图 | `docs/assets/*.png`（20）、`docs/look-test/*.png` | 自建应用 headless 截图 | 项目自有；可能含系统字体渲染，但不含第三方美术 | 可发布（发布前人工过一遍，确认无敏感信息/第三方图） |
| Contact sheet / style refs | `art/_style/refs/*.png` | 本项目占位脚本生成 | 项目自有（占位） | 可（注明 placeholder） |
| 调色板 | `art/_style/palettes/*.hex`（5 个） | 本项目自有色值 | 颜色本身不受版权保护；**对外称谓**“DSH 蓝”有品牌风险 | 可；对外改称 “orca blue / ocean blue” |
| 签名开发密钥（公钥） | `packs/keys/dev-public.pem` | 本项目开发用**公钥** | 无秘密；私钥不入库 | 可保留；确认私钥未入库 |
| 生成工具脚本 | `art/_private-reference/refs/tools/*.py`（gitignored）、`scripts/*.py` | 本项目自写像素化管线 | 项目自有 | 可（若未来开源单独定许可） |

## 6. 依赖（npm / Rust / 运行时）

### 6.1 npm 直接依赖（`package.json`；许可取自本机 `node_modules/*/package.json`）

| 包 | 版本范围 | 许可 |
|---|---|---|
| `@sentry/browser` | ^9.47.2 | MIT |
| `@tauri-apps/api` | ^2.12.4 | Apache-2.0 OR MIT |
| `cordis` | 4.0.0-rc.12 | MIT |
| `pixi.js` | ^8.22.0 | MIT |
| `@types/node`（dev） | ^22.10.0 | MIT |
| `ajv`（dev） | ^8.20.0 | MIT |
| `electron`（dev） | ^45.3.0 | MIT |
| `fake-indexeddb`（dev） | ^6.2.8 | Apache-2.0 |
| `tsx`（dev） | ^4.23.15 | MIT |
| `typescript`（dev） | ^5.9.3 | Apache-2.0 |
| `vite`（dev） | ^8.3.8 | MIT |

- 传递依赖（`package-lock.json`）未逐一列出；发布前应生成完整第三方许可清单（见 §8）。
- **Electron 分发**：必须随附 Electron/Chromium 的许可文件（如 `LICENSES.chromium.html`），并确认 Electron 版本条款。
- **Tauri 分发**：Windows 使用系统 WebView2 运行时（不打包则无需分发其文件）；不要随意内嵌 WebView2 二进制。
- **Steamworks**：`steamworks-rs` 是 MIT/Apache-2.0 绑定；**Steamworks SDK 本体为 Valve 专有，不在仓内，不得提交或随公开构建分发**（`NOTICE` 保留该条）。

### 6.2 Rust 直接依赖

| 位置 | 直接依赖 | 许可（按 crates.io 惯例，**待 `cargo deny` 复核**） |
|---|---|---|
| `app/tauri/src-tauri/Cargo.toml` | `tauri` 2、`serde`、`serde_json`、`reqwest` 0.12（rustls-tls）、`base64` 0.22、`windows-sys` 0.61、`dlc-verify`（本仓 path） | tauri MIT OR Apache-2.0；serde/serde_json MIT OR Apache-2.0；reqwest MIT OR Apache-2.0；base64 MIT OR Apache-2.0；windows-sys MIT OR Apache-2.0 |
| `native/dlc-verify/Cargo.toml` | `base64`、`ed25519-dalek` 2、`serde`、`serde_json`、`sha2` 0.10 | ed25519-dalek **BSD-3-Clause**；sha2 MIT OR Apache-2.0；其余同上 |

- 传递依赖见 `Cargo.lock`；发布前跑许可扫描（§8）。

### 6.3 运行时/系统组件

- Electron/Chromium（本地 `.electron-win/`，gitignored）：若分发 Electron 构建，随附其许可文件。
- WebView2（Windows 系统组件）：随 OS/系统更新授权，不作为项目素材分发。
- Steamworks SDK：专有，**不提交**。

## 7. 调色板 / 颜色（无版权风险，但有品牌风险）

- 仓库/`<private-path>` 使用 `#151517 / #F5F6F7 / #3964FE / #99C8FF` 等色值；**颜色本身不是版权对象**，无需第三方许可。
- 但对外不得称“DSH 蓝 / DeepSeek 蓝”，避免暗示官方关联；改称 **orca blue / ocean blue**（见 `NOTICE`）。
- `art/_style/palettes/*.hex` 为项目自有；若采用第三方调色板，应按其许可登记（当前未发现）。

## 8. 清零动作（发布前把 TBD 清零）

按优先级：

1. **P0 — 移出误跟踪的 rustup 安装器**：`git rm --cached .rustup-win/rustup-init.exe`；确认 `.rustup-win/` 仍在 `.gitignore`；不要随包分发。
2. **P0 — DeepSeek TTS 条款**：确认商业/再分发/署名/音色限制；写入本文件；决定 18 个 WAV 保留或替换。
3. **P0 — 参考图零发布**：再次核对 `art/_private-reference/` gitignore 状态；公开构建/商店素材中不得出现 refs/ref10/Pearl 草图。
4. **P0 — `art/assets.csv` 6 行 `license=TBD`** 清零：填入明确许可（Orca 相关 = CC BY 4.0 草案；Pearl 相关 = CC BY-NC-SA 4.0 / 不可发布；占位 = placeholder-only），并补 `source_sha`。不要伪造。
5. **P1 — 生成完整依赖许可清单**：npm（`license-checker` / 等价脚本）+ Rust（`cargo deny` / `cargo license`）；把许可文本/链接归档 `licenses/`；更新本文件。
6. **P1 — Tauri 图标来源确认**：确认 `icon.png/ico` 是否自绘；不是则替换/署名；品牌名/商标检索未完成前不要定稿最终图标。
7. **P1 — Electron/Chromium/WebView2 分发披露**：按宿主选择补齐许可文件。
8. **P1 — AI 披露随发布物**：`NOTICE`/`CREDITS`/首启/商店页；见 `docs/LEGAL-STATUS-2026-11-15.md` §6。
9. **P2 — 提交 Steamworks 边界**：保持 SDK 不入库；公开构建前检查 `.gitignore`/构建脚本。
10. **P2 — 定期复核**：每次新增第三方素材/AI 资产时更新本文件；每季度复核 DeepSeek/OpenRouter/OpenAI 条款。

## 9. 未决 TBD 汇总

| # | TBD | 归属 | 状态 |
|---|---|---|---|
| 1 | DeepSeek TTS 输出的商业/再分发/署名/音色条款 | 上游 + 律师 | **TBD** |
| 2 | 补录 8 句 TTS 的实际计费（记录缺失） | 用户/记账 | **TBD** |
| 3 | `rustup-init.exe` 的许可文本（未随仓附） | 上游/清理 | **TBD**（建议直接移出） |
| 4 | Tauri 图标来源（自绘/模板/第三方） | 用户 | **TBD** |
| 5 | 参考图 09 的 MIT/版权声明冲突 | 上游 | **TBD**（保持不发布） |
| 6 | 逐项 npm/Rust 传递依赖许可（未扫描） | 工程 | **TBD** |
| 7 | `art/assets.csv` 6 行 license=TBD | 用户 + 工程 | **TBD** |
| 8 | 参考图 10/12/13/14 的许可（unknown fan art） | 上游 | **TBD**（保持不发布） |

## 10. 变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版草案：实测 18 WAV（非 10）、refs 14 张、字体 0、rustup 误跟踪、依赖清单与清零动作 | draft；待用户 + 律师确认 |

> 本文件是草案，不是法律意见；所有“TBD/待确认”项在确认前按“不可发布”处理。
