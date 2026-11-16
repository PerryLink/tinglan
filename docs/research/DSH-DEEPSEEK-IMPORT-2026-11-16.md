# DSH/DeepSeek 会话导入：ZIP 格式、webview 路线与补全设计

> 日期：2026-11-16 · 服务：Famling/汀岚 · 性质：**只读研究 + 设计文档**（本轮不改代码/资产、不调 API、不生成图音、不碰 git/hub）
> 参考实现：DSH 实验性官方插件 `@deepseek-ai/dsh-deepseek-chat-import`（`/home/yy/deepseek-harness/packages/experimental/deepseek-chat-import`，v0.2.2-rc.3）
> 现状代码：[`src/pet/chat-import/`](../../src/pet/chat-import/)、[`chat-import.html`](../../chat-import.html)、[`docs/DEEPSEEK-WEB-IMPORT.md`](../DEEPSEEK-WEB-IMPORT.md)

## 0. 结论速览

1. **事实核对**：DSH 插件**不是**"webview 打开官网抓取"，而是"用户先下载官网导出 `deepseek_data-*.zip`，再上传 ZIP，Host 端解析写入会话"。它可参考的是**格式解析/线性化/限额/失败语义**，不是 webview 路线。
2. **ZIP 是最完整的官方途径**：覆盖全部（含私有）会话、消息树、当前分支、思考、联网搜索/网页/阅读链接、图片；分享链接 API 只覆盖单条公开分享、当前解析器只留文本+THINK。
3. **webview 打开官网做自动抓取：不推荐、不建议实现**。登录态/Cookie 进入应用进程、注入脚本读私有历史、未公开接口与平台条款风险都高于收益。推荐：**webview 最多作为"打开官网（系统浏览器）/导出说明"的入口，不承载登录与抓取**；用户主动导出 ZIP 后本地导入。
4. **推荐 P0（约 3–4 人日，不依赖模型/美术/API Key）**：修可达性（同窗入口，替换 `window.open(...,'noopener')`）→ ZIP 模式（前端 `fflate` + Worker）→ 校验 `manifest`/`index` → 按索引选最近 K 个 → `current_message_id` 线性化 → 复用现有 `buildDigest` → **加密**本地单/多槽摘要 + 去重账本 + 本地化错误（超限/版本/损坏）。**不保存原文**。
5. **最高风险不是技术，是隐私与发布**：① 私有历史明文落盘/无删除（审计 P2-6 已指出摘要含原文句）；② 入口与 Tauri 产物不可达（审计 P0-1/P1-1：`noopener` 恒返回 null、capabilities 无新建窗口权限、已构建二进制不含新命令）；③ 大 ZIP 在 WebView2 内存/zip 炸弹。

## 1. 背景与事实核对

- 现有分享导入链路：`chat-import.html` →（Tauri Rust `fetch_deepseek_share`，固定 host、严格 id、25s 超时）→ `normalizeSharePayload` → `buildDigest`（纯本地）→ 摘要存 `localStorage` 单槽 `desktop-games/pet/chat-import/v1`。它只处理公开分享，不登录、不读私有历史。
- DSH 插件的真实链路（README/Agent Note）：浏览器上传 ZIP → Host 精确路由 `POST /api/deepseek-chat-import/archive?workspaceId=…` → `openExportArchive`（fflate，内存中）→ 选会话/线性化/映射 → 写 DSH Session 持久层。**全程无 webview、无官网登录、无网络抓取**。
- 因此"参考 DSH 插件"的正确落点是：**把官网 ZIP 导入补进 desktop-games**，而不是复刻一个网页抓取器；DSH 插件是 DSH Host 插件，不能作为依赖直接装进 Tauri 应用（运行时、服务、持久化模型都不同）。

## 2. 官网导出 ZIP 格式（`export_format_version: 3`）

### 2.1 包结构

| 条目 | 读取字段（插件实际校验/使用） | 说明 |
|---|---|---|
| `manifest.json` | `export_format_version`（仅接受 3） | 缺失=`missing-manifest`，损坏=`unreadable-archive`，版本≠3=`unsupported-version` |
| `chat_session_index.json` | 数组：`id`、`inserted_at`、`updated_at`（`title`/`pinned`/`message_count` 存在但插件不校验） | 会话选择顺序来源；缺失/损坏=`missing-index` |
| `chat_sessions/{id}.json` | `id`、`title`(可 null)、`current_message_id`(可缺省/null)、`inserted_at`、`messages[]` | 一个会话一棵消息树 |
| `chat_sessions/{id}_files/…` | 由 `FILE` fragment 的 `export_path` 引用 | 图片本体；非图片文件本体不在导出内 |
| 未知条目 | — | 插件只按名/前缀取数，未选中条目不解析 |

消息节点：`{ id:int 自增, parent_id:int|null, role: 'USER'|'ASSISTANT', status:string, inserted_at:RFC3339(0/3/6/9 位小数), fragments[] }`。
时间：`inserted_at` 解析为 epoch ms；同一会话内可能 assistant 早于配对 user 几毫秒，写入时**单调钳制**。标题：`title` 折叠空白、截断 UTF-8 80 字节，作为**用户标题**固定，不再触发标题生成。

### 2.2 消息树与分支选择

- 消息是 `parent_id` 树（重新生成/编辑提问产生分叉）；DSH/本应用只有线性记录。
- 选中链：`current_message_id` → 沿 `parent_id` 回溯到根 → 反转。**其他分支丢弃**。
- 兜底：`current_message_id` 缺失/null/指向不存在 → 取 `id` 最大消息（id 自增，必为叶子）。
- 判无效（会话跳过）：`messages` 空、id 重复、`parent_id` 指向不存在、回溯成环。
- 语义提醒：导出时用户停在哪个分支，就导入哪个分支——**升级/回退分支会改变导入结果**，UI 必须说明。

### 2.3 Fragment 映射（插件规则，供移植裁剪）

| Fragment | 映射 | 进入模型上下文 | 本应用 P0 建议 |
|---|---|---|---|
| `REQUEST` | 用户文本 | 是 | 保留（现有 `ImportedMessage.text`） |
| `RESPONSE` | 助手正文 | 是 | 保留 |
| `THINK` | 独立 reasoning 块（`elapsed_secs` 影响 step 时间） | 是（无签名 thinking） | 存 `thinking`，**不参与摘要**（现有行为正确） |
| `FILE`(图片) | 附件服务存图 → image 块；否则伪造文件卡 | 是/句柄 | P0 只计数"图片未导入"；P1 再存缩略图/Blob |
| `FILE`(非图片) | 伪造文件卡（`name`/`bytes`，无字节） | 是（句柄） | P0 仅元数据计数 |
| `TOOL_SEARCH` | `web_search` 调用 + 结果卡；`WIP` 略去，`FAILED` 错误结果 | 是 | P1 查看器可展示为"联网搜索"折叠块，不进摘要 |
| `TOOL_OPEN`(有 url) | `web_fetch` 调用；无 url 的记录略去 | 是 | 同上 |
| `READ_LINK` | 每结果一行 `[title](url)`；正文加密不可解 | 是（文本） | P1 可选保留链接行 |
| `TOOL_FIND` / `TOOL_IMAGE_SEARCH` / `PARTIAL_FILE_READ` / `TIP` / `CONTENT_RISK` | 丢弃（界面提示/无信息量） | 否 | 丢弃 |
| `TEMPLATE_RESPONSE` | 整条回答排除，turn 以错误结束 | 否 | 丢弃并计数 |
| 未知类型 | 忽略（新结构不整包拒收） | 否 | 忽略（前向兼容关键） |

### 2.4 会话选择与状态

- 选择：`chat_session_index.json` 按 `updated_at` 降序 → `inserted_at` 降序 → id 升序，取最新 `min(maxSessions, 条数)` 个，按压缩包顺序处理。
- 失败补位：某会话转换/写入失败时，由索引中下一个更旧的会话补位；`omittedByLimit` 统计未触及的索引行。
- 回答状态：仅 `FINISHED` 进入上下文；`CONTENT_FILTER` 的提问+回答**一起丢弃**（官网显示"已撤回"）；`FAILED/TIMEOUT/CONTEXT_LENGTH_EXCEEDED/INCOMPLETE/WIP` 保留提问、回答以错误行收尾（固定 `DEEPSEEK_EXPORT_*` 码，不可"继续生成"）；无任何 turn 的会话不导入。
- 事件时间：取自导出 `inserted_at`，单调不减；Session `createdAt`=首事件时间。

### 2.5 附件

- 图片扩展名白名单 `png/jpg/jpeg/webp/gif`；附件服务按内容去重；单张失败只降级为伪造文件卡 + Host 警告，不中断会话。
- 非图片文件：**导出内没有本体**，只能伪造卡片（`attachmentId=sha256('deepseek-chat-export:'+file.id)`，`bytes=file_size`，缺失记 0）。
- 已知浪费：图片扫描先于会话解析，被撤回轮次/丢弃分支/转换失败会话的图片会成为**无事件引用的附件**；持久化与附件存储均无删除接口（DSH 侧限制，移植时应避免）。

### 2.6 失败原因与限额（插件默认值，可配置）

| 失败原因 | 触发 |
|---|---|
| `too-large` | 归档 > maxUploadBytes；条目声明/实际 > maxEntryBytes（含 manifest/index） |
| `unreadable-archive` | 非 ZIP、manifest 损坏、stored 条目声明大小不符、**中央目录重名**、扫描中途损坏 |
| `missing-manifest` / `missing-index` | 缺文件 / 不可解析 |
| `unsupported-version` | `export_format_version ≠ 3` |
| `no-conversations` | 索引为空 |
| `workspace-not-found` | 目标工作区消失（导入停，已写保留） |
| `busy` | 同一 Host 已有导入 |

限额：`maxSessions=1000`、`maxUploadBytes=512 MiB`、`maxEntryBytes=256 MiB`、`maxTitleBytes=80`；**整包在内存中**；每 64 KiB 让出事件循环；同一 Host 单导入槽位；取消后已写会话保留。
已知边界（文档自述）：同步解压可被"声明小、实际高压缩比"的条目拖住（上限只阻止保留字节，不阻止解压）；重复检测只覆盖中央目录（本地头改名可多交付）；`read()` 截断到声明大小；重复导入同一导出会产生重复会话。

### 2.7 写入语义（DSH 侧，移植时可跳过）

不创建 live Agent，直接写持久化：`Session.create` 做种子校验（seq 连续/surface 合法）→ `create` header → 追加事件 → flush/close → 投影缓存冷快照 → 挂到工作区。首个 turn 前插一条空 `system/message` 作为 surface 头（恢复时替换为真实系统提示）。本应用没有 Session 持久层，**不需要**这套语义，只沿用"整会话先转换校验、再落库"的顺序。

## 3. 与分享链接 API 的差异

| 维度 | 分享链接（现状） | 官网 ZIP（新增） |
|---|---|---|
| 覆盖 | 单条会话，必须已公开分享 | 全部会话（按索引取最近 K，含私有）；批量 |
| 内容完整性 | 当前解析器只取 `REQUEST/RESPONSE/THINK`，其余 fragment 丢弃；分享接口未文档化，是否携带附件/分支/搜索记录**未验证** | 消息树+当前分支+思考+搜索/打开网页/阅读链接+图片+状态/时间；按 2.3 裁剪 |
| 授权方式 | 用户提供公开分享 URL | 用户在官网"导出全部会话"后提供 ZIP（数据主体本人） |
| 网络 | 请求未公开接口 `…/api/v0/share/content`（UA/Referer 伪装、无重试；平台变更/风控即失效，见审计 U11） | **纯本地解析，零网络** |
| 私密性 | 只读公开内容；但内容仍经网络 | 私有数据进入本机：必须加密、可删除、默认不留原文 |
| 成本 | 不调模型；解析可忽略 | 不调模型；CPU/内存在本机（大包要注意） |
| 稳定性 | 依赖页面内部接口/风控 | 依赖导出格式版本（v3；官方导出结构也会漂移） |
| 结论 | 保留为轻量"公开对话"入口 | **作为"完整聊天记录"主入口**；两者共用归一化模型与摘要 |

## 4. "webview 打开官网"路线评估

### 4.1 可行性

- Tauri v2 可以开 WebView2 窗口加载外部站点，但当前 `capabilities/default.json` **没有** `core:webview:allow-create-webview-window`，`window.open` 在桌面端大概率被拒（审计 P1-1 实测 `noopener` 恒返回 null + 权限缺失）。要做也得加权限、加独立 capability，并处理下载、登录态、单点登录跳转。
- 登录态在嵌入式 WebView2 的 profile 里长期驻留；应用进程将持有 DeepSeek 会话 Cookie。应用内任何 XSS/依赖投毒都可能触及该 profile（比系统浏览器隔离差）。
- 读取页面内容需注入初始化脚本或直接调私有接口；跨域限制只对普通页面 fetch 生效，**Tauri 注入脚本/Rust 命令不受浏览器 CORS 约束**——也就是说"技术上做得到"，代价是合规与安全。
- 官网"导出全部会话"是设置里的异步导出/下载流程，嵌入式 webview 能否稳定完成下载（WebView2 下载事件、文件落盘、用户可见性）都要额外工程，收益远低于让用户用系统浏览器导出。

### 4.2 合规

- 分享页抓取已属"未公开接口 + 伪装 UA"（审计 U11 已列为 P1 风险，要求 ToS 核对）；再扩展到**私有历史**是性质变化：相当于用用户凭据做自动化数据抓取，可能违反平台条款与风控策略，且应用是非官方项目，商标/免责声明压力更大。
- 若导入对话含**第三方个人信息**（客户名、承诺、联系方式），本应用目前无"处理边界/保留期/删除承诺"（审计 LEGAL §5、§63 已指出）。无论哪条路线都必须补：导入前权利声明勾选、保留期、一键删除、不训练/不外传声明。
- 用户主动导出 ZIP 是最接近"数据可携带权"的合法路径：数据主体自己发起，应用只做本地解析。

### 4.3 安全

- 嵌入 webview 的风险：远端页面在应用进程内运行、Cookie/Token 驻留、IPC 注入面扩大、远端页面可诱导跳转/下载、无法保证 TLS 与内容策略一致。
- 若真要嵌入，最低要求：独立 WebView2 profile、不注入任何脚本、不读 Cookie、不调私有 API、只做只读展示；并且提供"在系统浏览器打开"作为首选。
- **禁止**：注入 JS 遍历会话列表、复用 Cookie 调 `/api/v0/chat_session/...`、自动下载/解析私有历史、把登录态写进应用配置或日志。

### 4.4 推荐（分级）

| 路线 | 判定 | 说明 |
|---|---|---|
| A. 系统浏览器打开官网（`open external`）+ 引导导出 → 用户选 ZIP 导入 | ✅ 推荐 | 零登录态、零抓取、合规成本最低；P0 可只放一个链接/说明 |
| B. 内嵌 webview 仅展示"导出说明/分享页"（不注入、不登录） | 🟡 可选 | 收益低；需新增权限与窗口生命周期；建议 P2 再评估 |
| C. 内嵌 webview 完成登录并抓取 DOM/私有接口 | ❌ 不实现 | 合规/安全/稳定性三输；与"不自动抓取"产品红线冲突 |

## 5. 补全设计

### 5.1 导入模式

| 模式 | 输入 | 优先级 | 说明 |
|---|---|---|---|
| 分享链接 | `https://chat.deepseek.com/share/<id>` | 现有，保留 | 公开单条；修复入口可达性 |
| 官网 ZIP | `deepseek_data-*.zip` | **P0 新增** | 完整历史主入口；本地解析 |
| 粘贴 JSON/Markdown | 分享 API JSON / 导出会话 JSON / 纯文本 Markdown | P1 | 无附件；用同一归一化+摘要；限制大小（如 2 MiB）与去重 |

### 5.2 入口

- 现状：`pet.html` 面板按钮 `#chat-import` + `setup.html` 链接；`main.ts` 用 `window.open('/chat-import.html','_blank','noopener')`。
- **P0 必改**：改为同窗导航或页内 `<dialog>` 模态（pet 窗口在 capabilities 内，`invoke` 可用），删除 `noopener` 成功判断；`setup.html` 保留链接。这样同时解决桌面端"点了没反应"和浏览器端"100% 误报被拦截"。
- P1：把导入区并入设置/说明页（模式 Tab），不再依赖独立窗口；P2 才考虑托盘/右键菜单（当前无托盘，需新增 Tauri tray 与权限，收益低）。

### 5.3 架构（P0）

```
[pet/setup 入口] → 导入对话框（同窗）
  ├─ 模式：分享链接 / ZIP（P0）
  ├─ ZIP: <input type=file accept=.zip> → File.arrayBuffer()
  │        └─ Web Worker: fflate 中央目录 → 校验 manifest/index → 选最近 K
  │             → 仅解压选中 `chat_sessions/{id}.json` → 线性化 → 归一化
  ├─ 预览：标题/消息数/更新时间/大小，复选框选择（默认最近 20，上限 200）
  ├─ 导入：buildDigest（纯本地）→ 加密存储 + 去重账本 → 结果摘要
  └─ 失败：本地化原因（超限/版本/损坏/无可导入）
[分享模式] normalizeSharePayload → 同一 digest/存储接口
```

### 5.4 ZIP 解析放哪

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 前端 `fflate` + Worker | 零 Rust、零新命令、可单测（Node 里 `zipSync` 造夹具）；MIT ~9 KB；DSH 已验证 | 内存受 WebView2/JS 限制；大包需流式+上限 | **P0 采用**（限额 128 MiB 归档 / 64 MiB 条目 / 总解压 256 MiB） |
| Tauri Rust `zip` crate | 可流式落盘、真正限制解压、性能稳 | 需加 crate、新命令、文件对话框/权限、Windows 重编与 E2E；IPC 传大包成本 | P1 若实测大包 OOM/卡顿再上；需路径穿越防护 |
| Node CLI 脚本 | 便于开发/夹具/批量离线转换 | 终端用户不可用（打包应用无 Node） | 仅作为**开发与测试工具**（`scripts/import-ds-export.mjs`），不承诺用户入口 |

安全限制（无论哪层）：归档大小上限；单条目声明/实际大小上限；**总解压预算**（防多条目叠加炸弹）；条目数量上限（如 10k）；中央目录重名拒绝；`manifest` 版本门禁；未知 fragment 忽略而非拒收；超时/取消（AbortController/Worker terminate）；单导入槽位。若 Rust 落盘：拒绝绝对路径/`..`/盘符/符号链接，解压到应用数据 `mkdtemp` 并校验 canonical 前缀，结束即清理；**P0 一律不按条目名写文件**。

### 5.5 复用现有 `src/pet/chat-import`

- `deepseek-share.ts`：把 `ImportedConversation` 升级为归一化模型（`messages[{role,text,thinking?,timestamp?}]` + `files`/`status` 元数据），ZIP 转换器产出同一类型；`digest.ts` 的 `buildDigest` 原样复用（只吃 user 文本，THINK 天然不参与）。
- `fetch.ts`：分享模式不动；新增 `export-zip.ts`（解析）+ `convert.ts`（树→归一化）纯函数，便于测试。
- `store.ts`：单槽 `v1` 升级为 `v2` 多条目账本（`{contentHash,source:'zip'|'share',importedAt,title,digest}`，上限 50，**加密**）；保留 `v1` 迁移/清理。删除入口要覆盖全部导入痕迹。
- 费用提示：页面顶部与保存后提示保留；**P0 文案必须改成真实能力**——"导入/本地摘要不调模型、不收费；模型融入（P2）才可能收费"（审计已指出 setup 页把不存在的"模型融入"写成现有能力）。
- 隐私/声明：沿用 `rawStored:false`、页脚非官方/版权/删除联系方式；新增"导入前权利声明勾选 + 保留期 + 一键删除"。

### 5.6 去重 / 分页 / 选择 / 分支 / 附件 / think

- **去重**：对每个会话算 `sha256(规范化 JSON)`（id+current_message_id+消息 id/时间/fragment 内容摘要；不含附件字节），账本命中即跳过并显示"N 个重复已跳过"；重复导入同一 ZIP 不再产生副本（DSH 的已知缺陷在此规避）。
- **分页/选择**：按索引 `updated_at` 排序，页大小 20，默认勾选最近 20；显示标题、更新时间、消息数、预计体积；上限 200 会话（P0）；"全选本页"。
- **分支**：默认 `current_message_id` 链；兜底最大 id；UI 明示"只导入导出时所在分支"。P2 才考虑分支树选择（需保留树结构）。
- **附件**：P0 只统计"图片 N 张未导入"；P1 将选中会话图片存 IndexedDB（WebCrypto 加密，配额/体积上限，如 50 MiB），非图片只显示元数据卡；不实现"伪造文件卡"的假句柄语义（本应用无模型文件句柄需求）。
- **THINK**：独立字段存储；摘要只用 user 文本；查看器默认折叠；**不参与训练/不上传**。
- **状态**：`CONTENT_FILTER` 整轮丢弃；非 `FINISHED` 保留提问并标记"原回答未完成/失败"；绝不把模板回答当模型输出。

### 5.7 导入后"融汇"接口（显式、可撤销、不自动上传）

- **P1 确定性融汇（无模型、无费用）**：预览 `digest` 条目（主题 ≤12、偏好/承诺句 ≤8）→ 用户勾选 → 写入 `state.memory`（`src/kernel/memory.ts` 的 `upsertMemory`）：`source:'confirmed'`、`tags:['imported','chat',importId]`、`key:'import.<hash>.<i>'`（同键去重/覆盖）；同步 legacy `memories` 列表；保存走现有加密存档；提供"撤销本次导入"（按 `importId` 删除 + `history` 留痕）。
- **隐私**：偏好/承诺当前是**原文整句**（审计 P2-6）——P0 要么只存主题词/统计，要么先加密；加密方案复用 `src/pet/crypto.ts`（WebCrypto AES-GCM，key extractable=false）或 Tauri DPAPI（`protect_text`/`write_save`）。
- **Advisers**：本应用是 `~/.advisers/pet-brief.json` 的**只读消费端**（契约见 [`docs/contracts/pet-brief/`](../contracts/pet-brief/README.md)），**不能直接写 Advisers 账本**。P2 方案：导出 `pagefold-chat-digest.json`（schema+版本+来源+生成时间）供 Advisers CLI 显式导入，或新增 `~/.advisers/inbox/` 契约；均需跨仓契约更新与用户确认，**不得自动投递**。
- **模型摘要/融合（P2）**：必须显式按钮 + 费用提示 + 预算/配额 + 可撤销；默认关闭；请求前展示将发送的内容范围（不发原始全文，仅摘要句）；失败不影响本地数据。

### 5.8 存储与隐私（P0 硬约束）

| 数据 | P0 存放 | 约束 |
|---|---|---|
| 摘要/账本 | `localStorage`（加密后密文） | 上限 50 条；无明文；删除按钮清空 v1/v2/ack key |
| 原始对话 | **不落盘** | `rawStored:false`；P1 才引入加密归档 |
| 原文句（偏好/承诺） | 加密或降级为短语 | 与现有 DPAPI/WebCrypto 存档一致 |
| 导入元数据 | 同上 | 来源、导入时间、内容哈希、会话计数 |

## 6. P0 / P1 / P2 实现方案

### 6.1 P0（约 3–4 人日；无模型/美术/API Key）

1. **可达性修复（0.5 d）**：同窗 modal/导航替换 `window.open`；保留 setup 链接；`npm run build` + 真机（Windows Tauri）点击验证。附带 Tauri 重编/NSIS 的发布项（审计 P0-1）。
2. **ZIP 模式（1.5–2 d）**：`fflate` 依赖 + Worker 解析；`manifest`/`index`/会话文件校验；分支线性化；归一化；选择列表（最近 20，上限 200）；错误本地化。
3. **摘要/账本/隐私（0.5–1 d）**：`store v2` 加密多条目 + 内容哈希去重 + 删除全部；复用 `buildDigest`；保持 `rawStored:false`。
4. **测试/文档（0.5 d）**：Node 测试用 `fflate.zipSync` 造 ZIP（正常/分支/撤回/非 FINISHED/超限/重名/坏包/版本）；`docs/DEEPSEEK-WEB-IMPORT.md` 更新；DECLARATIONS/隐私文案对齐。

验收：分享模式回归通过；ZIP 导入 20 条合成会话成功；重复导入 0 新条目；超限/坏包给出中文原因；无网络请求、无模型调用；删除后 localStorage 无残留。

### 6.2 P1（约 5–7 人日；仍无模型）

- 加密本地归档 + 查看器（会话列表/分页/消息流；THINK 折叠；搜索/打开网页/阅读链接折叠展示；图片可选存 Blob + 配额）。
- 去重账本 → 导入历史（列表/撤销/删除单条）；重复导入提示；导出/备份格式。
- 粘贴 JSON/Markdown 模式；设置页统一入口。
- 大包实测后决定是否加 Rust `zip` 命令（+1–2 d，含权限/重编/E2E）。

### 6.3 P2（约 5–8 人日；依赖模型与跨仓）

- 分支树选择；附件完整归档；模型摘要/融合（费用确认+预算+可撤销）与 Advisers 导出契约；托盘/右键入口；i18n。

### 6.4 汇总

| 阶段 | 估工 | 依赖模型/美术/API | 可独立交付 |
|---|---|---|---|
| P0 | 3–4 d | 否 | ✅ 可达性 + ZIP 摘要导入 + 隐私修复 |
| P1 | 5–7 d | 否 | ✅ 完整聊天记录本地归档/查看/去重 |
| P2 | 5–8 d | 模型（摘要/融合）、跨仓契约 | 部分（分支/附件不依赖模型） |

## 7. 风险与验证

| 风险 | 等级 | 缓解 |
|---|---|---|
| 私有历史明文/无删除/无保留期 | **最高** | P0 加密+不存原文+删除全部；声明页补第三方个人信息/保留期；导入前勾选 |
| 入口与发布不可达（P0-1/P1-1） | 高 | 同窗入口；Windows 重编并真机 E2E；发布清单加"导入入口必须实测" |
| 大 ZIP/zip 炸弹/OOM（WebView2） | 高 | Worker + 总量预算 + 条目上限 + 超时/取消；实测再转 Rust 流式 |
| 导出格式漂移（v3/2026-11-12 结构） | 中 | 版本门禁 + 未知 fragment 忽略 + 结构化错误；文档标注"仅支持 v3" |
| 重复导入/无撤销 | 中 | 内容哈希账本 + 导入历史 + 删除 |
| 分享接口未公开/伪装 UA（U11） | 中 | 保留但收敛（失败降级文案、可关闭开关）；不对私有接口扩展 |
| 费用文案误导（把不存在的模型融入写成现有） | 中 | P0 改真实文案；付费模型调用前确认 |
| 版权/第三方内容 | 中 | 页脚+勾选声明；仅限有权使用的对话 |

验证清单：① 单测（解析/限额/分支/去重/加密/删除）；② 无网络断言（ZIP 路径 mock fetch 抛错）；③ 真机 Windows Tauri：入口→选 ZIP→导入→摘要→删除；④ 隐私抽查：`localStorage`/IndexedDB 无明文原文，ack key 可清理；⑤ 性能：100 MiB/500 会话包的耗时与内存记录。

## 8. 来源

| 资料 | 位置 |
|---|---|
| DSH 导入插件 README（中文，格式/限制/失败） | `/home/yy/deepseek-harness/packages/experimental/deepseek-chat-import/README.zh.md` |
| DSH 插件 Agent Note（设计/映射/备选/后果） | `/home/yy/deepseek-harness/.agents/notes/implemented/feature/2026-11-11-deepseek-chat-export-import.zh.md` |
| 插件源码：格式校验 / 归档 / 线性化 / 导入 | `…/src/format.ts`、`…/src/archive.ts`、`…/src/conversation.ts`、`…/src/importer.ts`、`…/src/index.ts`、`…/src/types.ts` |
| 合成 ZIP 夹具（结构参考） | `…/tests/helpers/zip.ts`、`…/tests/importer.host.spec.ts` |
| 现有分享导入 | [`src/pet/chat-import/deepseek-share.ts`](../../src/pet/chat-import/deepseek-share.ts)、[`fetch.ts`](../../src/pet/chat-import/fetch.ts)、[`digest.ts`](../../src/pet/chat-import/digest.ts)、[`store.ts`](../../src/pet/chat-import/store.ts)、[`chat-import.ts`](../../src/pet/chat-import.ts)、[`chat-import.html`](../../chat-import.html) |
| 分享导入说明与限制 | [`docs/DEEPSEEK-WEB-IMPORT.md`](../DEEPSEEK-WEB-IMPORT.md) |
| Tauri 分享抓取命令 / 权限 | [`app/tauri/src-tauri/src/main.rs`](../../app/tauri/src-tauri/src/main.rs)、[`capabilities/default.json`](../../app/tauri/src-tauri/capabilities/default.json) |
| 审计：入口/发布/隐私/法务/ToS | [`AUDIT-CODE-RUNTIME-2026-11-16.md`](../audit/AUDIT-CODE-RUNTIME-2026-11-16.md)（P0-1/P1-1/P2-6）、[`AUDIT-ADVISERS-PRODUCT-2026-11-16.md`](../audit/AUDIT-ADVISERS-PRODUCT-2026-11-16.md)、[`AUDIT-LEGAL-RELEASE-2026-11-16.md`](../audit/AUDIT-LEGAL-RELEASE-2026-11-16.md)、[`AUDIT-OPS-UNCONSIDERED-2026-11-16.md`](../audit/AUDIT-OPS-UNCONSIDERED-2026-11-16.md)（U11） |
| 记忆/加密/Pet Brief 接口 | [`src/kernel/memory.ts`](../../src/kernel/memory.ts)、[`src/kernel/pet.ts`](../../src/kernel/pet.ts)、[`src/pet/crypto.ts`](../../src/pet/crypto.ts)、[`src/pet/main.ts`](../../src/pet/main.ts)、[`docs/contracts/pet-brief/README.md`](../contracts/pet-brief/README.md) |
| 既有分享 API 结构 | `GET https://chat.deepseek.com/api/v0/share/content?share_id=<id>`（响应 `code/data/biz_data/{title,messages[]}`，见 `deepseek-share.ts` 与 `main.rs:44`） |

## 9. 待人工确认（本机无法核实）

1. DeepSeek 用户协议/robots 对"导出文件导入"与"分享页接口读取"的具体条款（法务核对项，审计已列为未完成）。
2. 官网导出是否对免费/中国区账户有限制、生成时延、是否含全部会话（需一次真实导出验证）。
3. 导出格式 v3 的长期稳定性与官方文档（当前仅有逆向结论，DSH 插件以 2026-11-12 结构为目标）。
4. 是否引入 `fflate` 之外的压缩依赖、以及是否接受 `zod` 级校验依赖（建议 P0 手写校验、只加 `fflate`）。
5. Windows 真机上 WebView2 的 `window.open`/新窗口行为与 capabilities 修改后的权限边界（需重编后实测）。
