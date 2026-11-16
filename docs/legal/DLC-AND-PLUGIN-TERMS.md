# DLC / 角色包 / 插件条款 — 草案

> **状态：DRAFT · 2026-11-15 · 非法律意见。** 待用户 + 律师确认。本文约束“向本项目添加内容”的第三方**以及第一方官方包**；属于包作者与项目方的双向边界，**不影响**作者对自己作品依其自选许可享有的权利。
> 适用范围：内容包（Content Pack）· 角色包（Character Pack，FCI 0.1/0.2）· DLC · 渲染器/插件。**本仓当前不接纳第三方可执行插件**（见 §2）。
> 关联：[CONTENT-POLICY](./CONTENT-POLICY.md) · [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) · [TRADEMARK-AND-NAMING-POLICY](./TRADEMARK-AND-NAMING-POLICY.md) · [TAKEDOWN](./TAKEDOWN-AND-REPORTING.md) · 模板 [TEMPLATES](./DECLARATION-TEMPLATES/TEMPLATES.md)。

## 1. 定义与技术事实（2026-11-15 实测）

| 类型 | 形态 | 现状 |
|---|---|---|
| 内容包 Content Pack | `manifest.json`（id/name/version/contentApi/minBase/files+sha256/Ed25519）+ `content.json` + `signature.txt` | 已有 `packs/reef-pack`、`packs/farm-seasons`；loader 只读校验，不执行 |
| 角色包 Character Pack | 外壳 `manifest.json` + `character.json`（FCI 0.1/0.2：license、ai、render、minRuntime）+ 图集/音频 | 纯数据；**任何** `script/eval/code/execute/permissions` 键在任意嵌套层被拒绝 |
| DLC | 经签名/哈希校验的内容包（可收费，需另行协议） | 分发走本地目录（dlc/packs/steamapps），无商店/自动更新 |
| 插件/渲染器 | 可执行扩展 | **仅第一方、构建期 allowlist**；不提供第三方执行入口 |

**硬事实**：包内**不得**出现可执行代码；签名 = Ed25519 + 逐文件 sha256；缺 `signature.txt` 或校验失败时 loader 抛错、不挂载（“用户显式信任/指纹确认”UI 仍在补齐，见 [REMAINING-PLUGIN-ECOSYSTEM](../research/REMAINING-PLUGIN-ECOSYSTEM.md) §1）。

## 2. 允许与不允许

**允许**：纯数据内容包/角色包/替换包（美术、音频、行为参数、i18n、UI 皮肤）；作者自选许可（须在 manifest `license` 字段可读）；免费或（另行签约后）收费分发。

**不允许**：
1. 任何可执行文件/脚本/动态库、安装器、更新器、后台服务、驱动；
2. 绕过或篡改签名/哈希、伪造官方签名、冒用官方密钥/包 id；
3. 修改宿主程序、注入进程、提权、读取与包功能无关的用户数据；
4. 静默联网、采集遥测/凭据/剪贴板/键击、外传本机文件；
5. 自动更新、热修复、远程加载代码/内容（可被替换为恶意内容的“配置”同样禁止）；
6. 捆绑第三方软件、广告、挖矿、捐赠诱导伪装成功能；
7. 删除/隐藏作者、AI、许可、非官方声明或安全提示；
8. 用他人 IP/角色/商标/音源/字体/模型（含未授权 AI 模型权重）；
9. 用「Orca」或产品名作包名/id/图标/展示名，或冒充官方/官方兼容。
→ 违反即拒绝加载/下架/封禁发布者，必要时移交平台与执法机关。

## 3. 包作者的声明义务（每包必备）

1. **许可**：`license` 字段填 SPDX 标识或明确说明 + 许可链接；包内放 `LICENSE.txt`；素材逐项来源可查（见 [THIRD-PARTY-AND-CREDITS-POLICY](./THIRD-PARTY-AND-CREDITS-POLICY.md)）。
2. **署名**：`author`/`credit` 字段 + 包内 `CREDITS.md`（TASL：Title/Author/Source/License）；保留原作者的署名与修改说明。
3. **AI 披露**：`ai.status`（none/concept/final）+ `ai.tool`；AI 生成的图/音/文须在包内说明并符合 [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md)。
4. **非官方声明**：包内 `README.md` 与详情页写明“非官方、与 PerryLink/DeepSeek 无关联”；**不得**使用“官方/正版/认证/授权”字样（除非获得书面授权）。
5. **兼容性**：声明 `contentApi`/`minRuntime`/`minBase` 与测试过的宿主版本；不做超范围兼容承诺。
6. **联系方式**：真实可达的作者联系方式（责任主体），用于下架/投诉。
7. **内容合规**：遵守 [CONTENT-POLICY](./CONTENT-POLICY.md) §2 零容忍项；含成人/UGC 话题须按平台要求标注（本项目默认不分发此类包）。

## 4. 安全、沙箱与配额（宿主侧执行）

- 未签名 → 拒绝加载（loader 已强制）；**目标**：首次导入展示签名指纹（TOFU），指纹变化须用户确认（UI 待补齐）。
- 校验：路径遍历、符号链接、zip 炸弹、文件数/总字节/帧数/画布尺寸/音频时长上限；任一失败不挂载。
- 纯数据：不加载脚本、不执行 `eval`、不访问网络；UI 渲染置于受限视图/CSP。
- 不承诺“沙箱绝对安全”：数据包仍有解析器漏洞与供应链风险；用户安装第三方包风险自担（见 §6）。
- 包作者不得要求用户关闭安全机制/校验（“请关掉签名校验”= 违规）。

## 5. 兼容性、更新与弃用

1. 版本语义：`apiVersion` MAJOR.MINOR 窗口 + `minRuntime` 范围（**不用**单一递增标量）；MAJOR 变更可不兼容，提前公告。
2. 不保证：跨版本可加载、行为一致、存档兼容、性能达标；弃用字段保留至少一个 MINOR 周期（内部目标，非承诺）。
3. 更新由用户手动导入；**不提供**自动更新通道；作者不得内置更新器。
4. 第一方包同样适用本条款（官方包亦须署名/AI 披露/许可，不得例外）。

## 6. 免责与责任分配

1. 第三方包由**作者**负责：内容合法性、素材许可、安全、更新、支持、税务；项目方不为其背书。
2. 项目方可**拒绝加载/下架/移除索引**任何包（含无理由的兼容性理由），不承担由此产生的作者损失。
3. 使用第三方包可能导致崩溃、存档损坏、数据泄露；用户自行评估并备份；项目方不承担间接损失。
4. 作者保证其包不侵权、不含恶意代码；因作者原因导致第三方索赔，由作者承担（最终责任分配须律师定稿）。
5. 收费 DLC：须另行签署书面协议（分成、退款、税务、客服、下架、审计），**未签协议不得收费**；平台规则优先于本文件。

## 7. 下架与申诉

触发：违反 §2/§3、举报成立、许可证过期/被撤销、恶意行为、冒充官方、侵权通知。
流程：临时下架 → 通知作者（可达时）→ 作者申辩（内部目标 10 个工作日）→ 终局（恢复/永久下架/封禁）。恶意举报与恶意下架同样追责。详见 [TAKEDOWN-AND-REPORTING](./TAKEDOWN-AND-REPORTING.md)。

## 8. 待律师确认

- [ ] 本条款与 CC BY-NC-SA 4.0（包内可能含 CC BY-NC-SA 美术）的关系：不得对已按 CC BY-NC-SA 发布的作品追加限制；本文件仅约束“本项目分发渠道 + 名称/安全/平台”。
- [ ] 签名/信任模型的安全责任边界与免责写法。
- [ ] 收费 DLC 的合同结构、分成、消费者退款与平台规则衔接。
- [ ] 第三方包致损的责任限制条款（中国法下免责条款有效性）。

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版 | draft；待用户 + 律师 |

> 草案，不是法律意见。
