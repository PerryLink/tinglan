# 声明矩阵：场景 × 适用声明 × 必须展示位置 × 是否需律师 — 草案

> **状态：DRAFT · 2026-11-15 · 非法律意见。** 待用户 + 律师确认。“需律师”列表示**该场景在对外发布前**应取得律师意见；不是“没有律师就不能内部开发”。
> 用法：先在 §1 找到场景，按“适用声明”列去读对应文件；“展示位置”列是**最低要求**，少一处即视为未完成披露。
> 上位：[README](./README.md) 优先级规则、[NOTICE](../../NOTICE)、[LICENSE-ART](../../LICENSE-ART)、[LEGAL-STATUS](../LEGAL-STATUS-2026-11-15.md)。

## 1. 展示位置代码

| 代码 | 位置 | 说明 |
|---|---|---|
| P1 | 仓库根文件 | `LICENSE`/`NOTICE`/`LICENSE-ART`/`CREDITS.md`/`THIRD-PARTY.md`/`AI-PROVENANCE.md` 随仓可读 |
| P2 | 包内文件 | 包根 `LICENSE.txt` + `NOTICE.txt` + `README.md`（沿包分发，离线可读） |
| P3 | 应用内 About/设置页 | 版本号、许可清单入口、非官方声明、AI 声明 |
| P4 | 首启提示/引导 | 首次启动一次性告知：AI 生成、非官方、语音/记忆数据用途 |
| P5 | 商店页/详情页 | Steam/官网/工坊描述区的 AI 标签、非官方声明、授权状态 |
| P6 | 图像角落水印 | “AI 生成”显式标识（中国《标识办法》要求显式标识，位置需“适当”不可被轻易裁剪） |
| P7 | 元数据 | PNG/XMP/IPTC 或 C2PA、PNG tEXt；隐式标识，不得删除/伪造 |
| P8 | 音轨起始/结尾提示 | 合成语音的显式提示（或播放器内标明“AI 语音”） |
| P9 | 视频简介/置顶/直播标题 | “同人/非官方”+ 署名 + AI 披露 |
| P10 | 下载页/发布说明 | 适用声明链接、兼容版本、签名指纹 |
| P11 | manifest/签名块 | 包的 `license`/`ai`/`author`/`credit` 字段（机器可读） |
| P12 | 举报/下架入口 | 仓库根或官网的 `TAKEDOWN`/举报链接 |

## 2. 声明矩阵

| # | 场景 | 适用声明（canon） | 必须展示位置 | 需律师 | 硬红线（摘要） |
|---|---|---|---|---|---|
| 1 | 发布官方角色立绘/设定图（AI 生成） | [CONTENT-POLICY](./CONTENT-POLICY.md)·[AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md)·`LICENSE-ART` | P1 P3 P6 P7 | **是** | 生效前不得对外发布；不得称真人手绘；相似度 G2 未过不得公开 |
| 2 | 发布官方像素包/第一方角色包 | 同上 + [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) | P1 P2 P3 P11 | **是** | 署名/AI 披露进 manifest；不得移除 notices |
| 3 | 发布代码仓库/源码 | [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md)·根 `LICENSE`/`NOTICE` | P1 P3 | 建议 | 不得宣称 Apache-2.0/开源；商用需另签 |
| 4 | 发行桌宠程序包（官网/Steam） | README L1–L5 + 上列全部 | P1 P3 P4 P5 | **是** | 发行包不得缺 `LICENSE-ART`/`CREDITS`/`THIRD-PARTY`；不得含 refs/私钥/SDK |
| 5 | 第三方角色包/DLC（免费或收费） | [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) + [模板](./DECLARATION-TEMPLATES/TEMPLATES.md) | P2 P5 P10 P11 | **是** | 纯数据、签名、无恶意代码、不暗示官方；收费需另行书面协议 |
| 6 | 插件/渲染器/可执行扩展 | [DLC-AND-PLUGIN-TERMS](./DLC-AND-PLUGIN-TERMS.md) | P1 P3 P10 | **是** | 本仓当前**不接受**第三方可执行插件；不得以“插件”绕开包规范 |
| 7 | 动作替换包（动画/帧/behavior） | [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) + 模板 | P2 P5 P10 P11 | 建议 | 不得用他人动作/动捕数据；不得移除作者与 AI 署名 |
| 8 | 声音替换包/TTS 音色包 | 同上 + [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) | P2 P5 P8 P10 P11 | **是** | 禁止真人声音克隆（未获书面授权）；不得用未授权音源/影视游戏音频 |
| 9 | 形象替换包（模型换皮/立绘替换） | 同上 + [FANWORK-POLICY](./FANWORK-POLICY.md) | P2 P5 P10 P11 | **是** | 不得用他人 IP 角色；不得冒充官方版本；须注明修改 |
| 10 | UI 皮肤/主题 | [ASSET-REPLACEMENT-AND-MODDING-POLICY](./ASSET-REPLACEMENT-AND-MODDING-POLICY.md) | P2 P5 P10 | 建议 | 不得含商标性 Logo；不得遮挡/移除声明与安全提示 |
| 11 | 同人图/漫画/插画 | [FANWORK-POLICY](./FANWORK-POLICY.md) + 模板 | P9（发布处）/图内署名 | **是** | 标注“同人/非官方”；不得用官方 Logo/名义；AI 同人需披露 |
| 12 | 同人文/设定/二创剧情 | 同上 | P9/作品首尾 | 建议 | 不得宣称官方正史；不得抄袭他人同人；不得注册角色名 |
| 13 | 同人视频/直播/剪辑/游戏实况 | [FANWORK-POLICY](./FANWORK-POLICY.md) | P9、视频简介/直播标题/置顶 | 建议 | 标注非官方；不得暗示官方赞助；收益化见政策 §2–§3 |
| 14 | 同人周边（非商业限量 / 商业量产） | [FANWORK-POLICY](./FANWORK-POLICY.md) | 商品页/包装/随附卡片 | **是** | 非商业限量默认容忍（边界待律师）；**商业量产/众筹须事先书面授权** |
| 15 | AI 生成宣发图/视频/文案 | [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) | P5 P6 P7 P9 | **是** | 营销素材同样算 AI 内容，必须申报/标识；不得伪造成实拍 |
| 16 | 商店页/Steam 内容调查/分级 | CONTENT + AI + TRADEMARK 三份 | P5 + 调查表逐项如实勾选 | **是** | 不得隐瞒生成式 AI；不得虚报分级/内容 |
| 17 | 实时语音对话/语音输出（ASR/TTS） | [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md)·[AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) | P3 P4 P8、首次录音前提示 | **是** | 首次使用麦克风须告知；语音/文本上传第三方须披露；不得冒充真人 |
| 18 | 贡献 PR（代码） | [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md) | PR 描述 + `Signed-off-by` | **是**（CLA） | 不得提交第三方代码/密钥/Steamworks SDK；AI 辅助须披露 |
| 19 | 贡献 PR（美术/音频/设定） | [CONTRIBUTOR-TERMS](./CONTRIBUTOR-TERMS.md) + [THIRD-PARTY](./THIRD-PARTY-AND-CREDITS-POLICY.md) | PR 描述 + `CREDITS.md` TASL 行 | **是**（入站许可） | 不得提交来源不明/未授权素材；AI 生成须披露并给 provenance |
| 20 | fork/再分发/镜像 | 根许可 + [TRADEMARK-AND-NAMING-POLICY](./TRADEMARK-AND-NAMING-POLICY.md) | README 顶部非官方声明 | 建议 | 不得用官方名义/Logo 传播；不得移除许可与署名 |
| 21 | 举报/侵权投诉/下架处理 | [TAKEDOWN-AND-REPORTING](./TAKEDOWN-AND-REPORTING.md) | P12 | **是** | 反通知须谨慎；不得滥用举报；流程非法定承诺 |
| 22 | 读取本地数据（存档/记忆/Advisers） | [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) | P3 P4（数据用途说明） | **是** | 只读、最小必要、不得外传；秘密事项不得显示 |

## 3. 使用说明与失效条件

1. **一个场景可叠加多份**：内容类场景通常 = 内容政策 + AI 政策 + 名称政策；包类场景再加 DLC 条款。
2. **“必须展示位置”是最低集**：平台另有要求时取并集（见 [AI-CONTENT-POLICY](./AI-CONTENT-POLICY.md) §4 平台清单）。
3. **律师项未完成时**：该场景只能内部开发/私有测试；**不得**公开发布、收钱、上架。见 [LEGAL-STATUS §8](../LEGAL-STATUS-2026-11-15.md) 发布 Gate。
4. 本表随政策增删同步修订；解释以 [README §2](./README.md) 优先级规则为准。
5. 本表不构成法律意见，不保证覆盖所有法域；目标法域未定（中国为主，海外视渠道再评估）。

> 草案 2026-11-15；变更须记录日期与原因。
