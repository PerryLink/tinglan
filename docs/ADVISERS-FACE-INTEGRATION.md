# 桌宠作为 Advisers 形象：接入方案与第一版桥接（2026-11-16）

Status: **v0 只读 Pet Brief 桥接已实现（可选开关）**；不是完整 Advisers GUI，也不是双向代理。普通桌宠行为（摸/拖/说/存档）始终独立可用。
参考会话：`session-ec8c3494-da9e-45b5-9a08-edcd964b405b`（Advisers 收口会话，24 turns，2026-11-14 12:47 创建）。

## 1. session-ec8c 的情况（只读核对）

- 它是 **Advisers 的收口/交接会话**：目标为“按 12-WORK-BACKLOG 执行所有可执行任务”，共 24 turns、783 steps；最后标记 goal complete；已产出 `docs/<private-doc>.md`、新会话提示词，并核对/修正文档。
- 交接时事实（写文档时）：HEAD `c7e30a0`；测试 **250/250**；Pet Brief producer 已实现（`e17b7ec`、`2a4d5f4`、`64a7f82`），但 **staged npm `.70` 不含 Pet Brief**；下次发布必须 bump `.71` 重新 stage；npm `next` 仍是旧 `0.1.0-preview.2`；approve 需账号所有者 OTP。
- 产品定位：**CLI 是产品本体**，DSH bundle 是薄适配器；本地优先、可审计、Office 交付；明确不做通用聊天/情感陪伴/GUI 重产品。
- 已知外部阻塞：OTP、独立人工金标/真实 dogfood、24h 通知验收、三端远端需实测；Pet Brief 未接消费端。
- 当前仓库实测（本轮）：HEAD 含 Pet Brief + 测试修复（`64a7f82` 后另有 handoff docs）；`pnpm -r test` 250/250（交接记录）；工作树曾 clean。

> 结论：Advisers 已经能产出**只读、脱敏、5 分钟 TTL、最多 10 项**的 Pet Brief；适合作为“脸”的第一条数据通道，但**发布链未闭环**（`.71` 未 stage/approve）。

## 2. 第一版架构（v0）

```text
Advisers CLI（本地账本，唯一事实源）
  └─ advisers pet-brief --out %USERPROFILE%\.advisers\pet-brief.json
        │  （定时刷新，建议 1–2 分钟；TTL 5 分钟）
        ▼
Tauri command read_advisers_brief
  └─ 固定路径 ~/.advisers/pet-brief.json；128 KiB 上限；只读
        ▼
desktop-games: AdvisersFaceController
  ├─ validatePetBrief（schema/TTL/脱敏/禁字段）
  ├─ toPresenceEvent + PresenceProjector（安静时段/每日气泡预算/去重）
  └─ PetDirective → 现有 pet 页面（bubble/pose/remind）
        ▼
汀岚/桌宠：普通摸/拖/说/存档照常；Advisers 只是可选“工作状态层”
```

### 实现文件

| 文件 | 作用 |
|---|---|
| `app/tauri/src-tauri/src/main.rs` | `read_advisers_brief` 命令：固定路径、大小限制、无写入 |
| `src/pet/advisers/face.ts` | 读取/校验/TTL/去重/投影；状态 `no-file/stale/invalid/fresh/quiet-or-deduped` |
| `src/presence/pet-brief.ts` | 已有 consumer：schema/脱敏/claims guard/TTL |
| `src/presence/projector.ts` | 已有 presence：quiet hours、每日气泡预算、secrecy |
| `pet.html` / `src/pet/main.ts` | “Advisers：开/关”按钮、状态行、点击状态行查看只读简报、可选自动启动（localStorage） |
| `tests/advisers-face.test.ts` | 5 项：disabled/no-file/fresh+dedupe/stale+invalid/transport |

## 3. 使用方式

1. Advisers 侧生成一次 brief（不调模型、只读账本）：
   ```bash
   advisers pet-brief --out "%USERPROFILE%\.advisers\pet-brief.json"
   ```
2. 用系统计划任务每 1–2 分钟运行一次（TTL 5 分钟；不刷新就会 `stale`，宠物不会用过时数据）。
3. 桌宠页点“Advisers：关”开启；状态行显示今天/承诺/风险数量。关闭后完全回到普通桌宠。
4. 无 `pet-brief.json` 时显示“未找到（可选）”，不影响摸/拖/说/存档。
5. 浏览器模式无 Tauri，显示“不可读取本地文件”，不绕过安全边界。

## 4. 映射规则（固定模板，不让模型自由发挥）

- `validatePetBrief` 先拒绝：过期、未知字段、reasoning/CoT/密钥/情感字段、suggestedLines 不可溯源等。
- `toPresenceEvent`：
  - 今日高风险承诺到期 → `commitment.due` P0（气泡：固定数字模板）；
  - 高风险/concerned → `brief.ready` P1；
  - 一般 → P2（只 pulse，不说话）。
- `PresenceProjector`：22–8 安静时段、P0/P1 每日气泡预算、去重；绝不产生 backlog。
- **不使用 brief 的 `suggestedLines` 自由文本**；渲染文本由 presence 模板拥有。
- 宠物行为优先级：拖拽/摸/说话不因 Advisers 被锁；brief 过期/错误自动退回普通状态。

## 5. 未来“真正形象/沟通”路线

### v1（近期，可开发）
- Advisers 定时 brief 已可用后，补：
  - 桌宠侧“问一句”入口 → 调用 `advisers` 只读 JSON 命令（today/commitments/risks）→ 用固定模板回答；
  - **费用提示**：任何模型调用前显示“会有花销”确认；
  - brief 状态显示“上次同步/过期”；用户可关闭。
- 不引入自由聊天；不做常驻 LLM；不读 Advisers 数据库。

### v2（需产品决策）
- 双向沟通：宠物说“提醒我 X” → 通过 Advisers CLI `capture/commit` 写入？**写操作必须显式确认 + 审计**，不能由宠物自动改账本。
- 多角色：Advisers 作为“幕僚”而不是宠物人格；汀岚保持工作搭子语气。
- 发布：Advisers `.71` 重新 stage/approve；Pet Brief consumer 20 向量；真实 dogfood。

### 明确不做（v0）
- 不把 Advisers 数据库/原始 CoT/客户文件交给宠物；
- 不让宠物自动发邮件/改期/承诺；
- 不做情感陪伴/恋爱人格；
- 不读私有聊天列表；网页导入只支持用户主动分享链接。

## 6. 当前限制

- Advisers 侧需要用户手动设置定时任务；未做自动安装器。
- 只映射 brief 的少量事件；没有“沟通会话”双向。
- 无 Tauri 的浏览器预览不能读本地文件。
- 发布链：`preview.70` staged 不含 Pet Brief；需 `.71` + OTP；`next` 未更新。
- 所有声明/许可仍 DRAFT；律师审查暂缓（用户 2026-11-16 决定）。

## 7. 验证

- `tests/advisers-face.test.ts` 5/5；`npm test` 全量见仓库当前数字；`tsc`/preflight。
- 构建产物中 pet 页面包含“Advisers：开/关”和状态行；无 Tauri 时安全降级。
- 未执行真实 Advisers 文件端到端（本机未生成 `pet-brief.json`）；可用示例契约做纯函数测试。


## 8. 本轮追加

- 点击 pet 侧“Advisers：已连接 …”状态行可打开**只读简报面板**：今天/承诺/风险（redacted），不显示 suggestedLines。
- 新增 `setup.html`（模型/API Key 配置说明 + 费用警示 + 安全边界），首次运行提示链接到该页；不在应用内保存 key。
- Advisers 侧实际定时任务仍需用户/后续安装器配置；本机未生成真实 brief 文件，`tests/advisers-face.test.ts` 用契约示例做纯函数验证。
