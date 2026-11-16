# AI 内容政策：生成、披露、标识与供应商条款 — 草案

> **状态：DRAFT · 2026-11-15 · 非法律意见。** 待用户 + 律师确认。本文是项目内部规范 + 发布检查表；具体法定义务以官方原文为准（链接见 §5，URL 于 2026-11-15 本机核验可达，平台页面可能改版，发布前须复核）。
> 适用：AI 生成的图/文/音/视频/对话/宣发，AI 训练/微调/语音合成，以及向终端用户的 AI 披露。
> 关联：[CONTENT-POLICY](./CONTENT-POLICY.md) · [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) · [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) · `AI-PROVENANCE.md`。

## 1. 本项目 AI 使用事实（2026-11-15 快照）

| 类型 | 事实 | 记录位置 |
|---|---|---|
| 角色图 | `openai/gpt-image-2.6-sunburst`（经 OpenRouter Images API），2026-11-14/15，19 次生成 + 人工筛选/裁剪/像素化 | `AI-PROVENANCE.md`（含 sha256） |
| 语音 | DeepSeek TTS（音色 “stella”），2026-11-14，18 个 WAV；**再分发条款 TBD** | `THIRD-PARTY.md` §2、manifest |
| 实时识别 | DeepSeek ASR，经 Rust 代理；音频不持久化、≤8 MiB、≤60 s | [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) §3 |
| 对话/文案 | 桌宠台词为规则/脚本（无默认云 LLM）；ASR 文本仅做关键词匹配；若未来接入 LLM/云对话，须先按本政策披露 | 应用内 About |
| 语音输出 | 默认 provider 链：baked 预生成 → 系统语音 → 静音 mock；云 TTS 仅在配置后加入，计每日字符预算（默认 2000 字/日）、不落盘 | `src/voice/service.ts`、`src/pet/main.ts` |
| 占位像素图 | 确定性脚本（`placehold.py`），非模型生成 | `art/assets.csv` |
| 第三方参考图 | `art/_private-reference/refs/`（gitignored，**不得发布**） | `AI-PROVENANCE.md` 缺口说明 |

## 2. 披露原则（六条，全部场景适用）

1. **显式 + 隐式双标识**：可感知的文字/角标 + 机器可读元数据；两者都不得删除、遮挡、伪造。
2. **不得冒充真人**：不得称“真人绘制/真人配音/真人撰写”；不得把 AI 输出说成实拍、真实录音、真实用户评价。
3. **可追溯**：每个发布物保留 prompt/模型/日期/输出 sha（模板见 `AI-PROVENANCE.md`）；元数据与台账一致。
4. **不隐瞒、不缩小**：商店调查、分级问卷、平台申报逐项如实；营销素材与成品同等对待。
5. **不越权**：不得生成/使用未经授权的他人风格、角色、声音、肖像（见 [ASSET-REPLACEMENT](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) §3–4）。
6. **不训练**：本项目**不使用**用户对话、语音、记忆数据训练模型；如未来改变须先告知并取得同意（PIPL 要求）。

## 3. 生成内容禁止（与内容政策联动）

不得生成/分发：未成年人性化内容（零容忍）；仇恨/歧视；色情；暴力虐待与自伤美化；违法教程；政治操纵与冒充官方立场；真人肖像/声音克隆（无书面同意）；他人 IP 角色与商标；用于诈骗/虚假新闻/伪造官方公告的内容；冒充医生/律师等专业结论；恶意代码。触犯即拒绝生成/下架/报告。

## 4. 落地清单（发布前逐项打勾）

- [ ] 图片：角落“AI 生成”显式标识（不易裁剪）+ PNG tEXt/XMP/IPTC 或 C2PA 隐式标识。
- [ ] 语音：可感知提示（播放器标明“AI 语音”/首启声明/音轨提示）；不得声称真人配音。
- [ ] 对话：About/首启/设置页写明“AI 语音与对话，可能出错”；危机/自伤场景给求助信息。
- [ ] 角色包/内容包：`ai.status` + `ai.tool` 必填且真实；不得伪填 `none`。
- [ ] 商店页/宣发：AI 标签与内容调查一致；营销图同样标识。
- [ ] 首发/更新说明：本次新增 AI 内容的清单。
- [ ] 台账：`AI-PROVENANCE.md` 补记录；`THIRD-PARTY.md` 补供应商条款核对日期。
- [ ] 标识机制：代码/管道不得提供“一键去标识”；发现被删标识须恢复。

## 5. 法域与平台要求（公开来源，2026-11-15 核验）

| 法域/平台 | 要求（摘要） | 官方来源 |
|---|---|---|
| 中国《人工智能生成合成内容标识办法》（2025-09-01 施行） | 生成合成内容需显式 + 隐式标识；不得删除/伪造/篡改标识 | https://www.cac.gov.cn/2025-03/14/c_1743654685896173.htm |
| 中国 GB 45438-2025（同日实施） | 标识方法的国家标准 | https://std.samr.gov.cn//gb/search/gbDetailed?id=301E0388CB75788DE06397BE0A0AE1B4 |
| 中国《生成式人工智能服务管理暂行办法》（2023-08-15 施行） | 服务提供者义务、内容安全、标识与投诉 | https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm |
| 中国《互联网信息服务深度合成管理规定》（2023-01-10 施行） | 深度合成内容标识、不得用于虚假信息 | https://www.cac.gov.cn/2022-12/11/c_1672221949354811.htm |
| 中国《网络信息内容生态治理规定》（2020-03-01 施行） | 违法与不良信息清单（内容政策 T1–T8 的依据之一） | https://www.cac.gov.cn/2019-12/20/c_1578375159509309.htm |
| EU AI Act 第 50 条（2026-08-02 适用） | 与 AI 交互告知；合成内容/深伪披露（机器可读）；营销不得伪装真实 | https://artificialintelligenceact.eu/article/50/ · https://eur-lex.europa.eu/eli/reg/2024/1689/oj |
| Steam 内容调查 | 预生成与实时生成式 AI 均须申报；实时内容说明安全护栏 | https://partner.steamgames.com/doc/gettingstarted/contentsurvey?l=schinese |
| Apple App Review 5.1.2(i) / Google Play AI 政策 | 向第三方 AI 共享个人数据前披露/同意；生成内容政策 | 商店政策页（若上移动端再核对原文） |
| DeepSeek 开放平台协议 | 向终端用户披露 AI 输出、可能出错；输出权利/再分发条款 | https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html |

## 6. 供应商与模型条款（TBD 台账）

| 供应商 | 待确认 | 状态 |
|---|---|---|
| OpenRouter / OpenAI Images | 输出商用/再分发/署名/内容限制 | **TBD**（发布前复核 Model Terms） |
| DeepSeek TTS | 输出商用、**预生成音频再分发**、音色限制、署名 | **TBD**（P0：不确认则替换 18 WAV） |
| DeepSeek ASR | 音频传输/留存/跨境 | **TBD**（隐私政策须披露） |
| SDXL/ComfyUI（历史 3 行资产） | checkpoint 许可（CreativeML Open RAIL++-M 等） | **TBD**（来源不明 = 不可发布） |

要求：每个供应商记录**条款版本 + 日期 + URL + 结论**；不得在包/仓库/日志中放入 API key；条款变更须重审。

## 7. 待律师确认

- [ ] 中国/ EU 标识义务的具体落地形式（是否需备案、元数据字段、提示语措辞）。
- [ ] AI 生成物的可版权性与对外许可/署名条件（与 `LICENSE-ART` 联动）。
- [ ] 实时对话/语音的“AI 告知”频次与位置是否满足平台与法域要求。
- [ ] 未成年人使用场景的额外保护（家长同意、时长/内容限制）。

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版 | draft；待用户 + 律师 |

> 草案，不是法律意见。
