# AI-PROVENANCE（AI 生成调用链与证据）· 草案

> **状态：DRAFT（草案）— 待用户（PerryLink）+ 律师确认。** 快照：2026-11-15。
> 本文件不是法律意见；它汇总**已有的生成元数据**，供 AI 披露、可版权性证据、相似度审查与许可证登记使用。
> 不包含 API key / 凭据 / 账号 token。相关文件：`LICENSE-ART`、`CREDITS.md`、`THIRD-PARTY.md`、`docs/LEGAL-STATUS-2026-11-15.md`。

## 0. 证据来源（本机只读核对，2026-11-15）

| 来源 | 位置 | 内容 | 跟踪状态 |
|---|---|---|---|
| Orca 生成元数据 | `<private-path>`（19 个） | 每次调用的 `model / endpoint / called_at / params / prompt_sha256 / config_sha256 / body_sha256 / references[].sha256 / images[].sha256 / usage / cost_usd / elapsed_ms` | 仓外，未跟踪 |
| Orca 输出图 | `<private-path>`（122 张，含 82 张像素帧） | 概念/立绘/设定/变体/像素化/预览 | 仓外，未跟踪 |
| Pearl 生成元数据 | `art/_private-reference/refs/ai-drafts/*.json`（含 5 个 Pearl 阶段） | 同上；另 `gen-config.json` 保存部分 prompt 文本 | **gitignored**，未跟踪 |
| 调用台账 | `art/_private-reference/refs/ai-drafts/calls-ledger.jsonl`（24 行） | 汇总成本与文件路径 | **gitignored**，未跟踪 |
| 生成脚本 | `art/_private-reference/refs/ai-drafts/or-image-gen.mjs`（gitignored）、`scripts/voice-pilot.mjs`（tracked） | 参数/哈希记录逻辑 | 见上 |
| TTS 记录 | `docs/VOICE-PILOT-RESULTS.md`、`assets/voice/pet/manifest.json`、git 提交 | 音色/日期/句数/成本 | tracked |

**校验结果**：19 个 Orca 输出 PNG 与 5 个 Pearl 输出 PNG 的 sha256 **全部与元数据记录 MATCH**（2026-11-15 本机复核）。成本合计与 `calls-ledger.jsonl` 24 条记录一致（见 §2.3/§3.3）。
**注意**：元数据中的 `file` 路径仍指向迁移前的 `art/_private-reference/refs/ai-drafts/`；图片已迁到 `<private-path>`，以 **sha256** 判定为同一文件（路径差异不代表内容差异）。

## 1. 模型与调用方式（统一）

| 项 | 值 |
|---|---|
| 图像模型 | `openai/gpt-image-2.6-sunburst` |
| 供应商/端点 | OpenRouter Images API — `https://openrouter.ai/api/v1/images` |
| 通用参数 | `quality=high`、`background=transparent`、`output_format=png`、`n=1`、`aspect_ratio` 按图（1:1 / 2:3 / 3:2） |
| seed | **未发送/不可用**（参数中无 seed；因此生成结果**不可逐像素复现**，只能复现“请求级”） |
| 生成脚本 | `or-image-gen.mjs`，两个版本 sha256 前缀：`88dc4f6f`（早期：Pearl 5 次 + `phase-orca-oc` 首调）、`f55db20c`（其余 Orca 调用，当前文件 sha 为 `f55db20c6697d072c5ebe2ab80a4366c2a4f3e251b20dc28968f156ca9bf9b07`） |
| 参考图策略 | **Orca 只使用本 OC 自产图**；Pearl 草稿使用了无授权同人图 ref10（内部，见 §3） |
| key 处理 | key 仅在本机凭据文件/环境变量；元数据**不含 key**；本文件不记录 key。历史上的 key 处置见 `docs/PEARL-HERO-AI-DRAFT-LOG-2026-11-14.md` §5（已建议 revoke）。 |

## 2. Orca OC 调用链（19 次记录，合计 **$1.198385**）

> 时间均为 UTC（+08 = 本地）。输出 sha 为前缀（完整值见对应 `.json`）；`MATCH` = 与 `<private-path>` 磁盘文件 sha256 一致。
> 其中 2 组为同 prompt 重跑（`phase-orca-oc`、`orca-normal-front`，输出 sha 不同 ⇒ 是同提示词的再次生成，不是重复记录）。

| # | phase | called_at (UTC) | aspect | 参考图数 | prompt sha256（前 12） | 输出 sha256（前 12） | 成本 USD | 校验 |
|---:|---|---|---|---:|---|---|---:|---|
| 1 | `phase-orca-oc` | 2026-11-14T13:53:44.663Z | 1:1 | 0 | `ca4cebd73b46` | `3d338ad7a319` | 0.055210 | MATCH |
| 2 | `orca-normal-front` | 2026-11-14T14:04:06.635Z | 2:3 | 1 | `1d50084f91e4` | `89d00eb8435f` | 0.050832 | MATCH |
| 3 | `orca-normal-alt` | 2026-11-14T14:05:14.605Z | 2:3 | 2 | `70eef193fa07` | `21b41935df2b` | 0.062865 | MATCH |
| 4 | `orca-normal-sheet` | 2026-11-14T14:06:12.386Z | 3:2 | 2 | `2463a8190237` | `72ae84ccfae1` | 0.062935 | MATCH |
| 5 | `orca-chibi-sheet` | 2026-11-14T14:07:07.483Z | 3:2 | 1 | `1c1133471fbb` | `7373e5d1393c` | 0.050592 | MATCH |
| 6 | `phase-orca-oc`（重跑） | 2026-11-14T15:14:01.802Z | 1:1 | 0 | `ca4cebd73b46` | `e785a6774b3c` | 0.055210 | MATCH |
| 7 | `orca-normal-front`（重跑） | 2026-11-14T15:14:50.912Z | 2:3 | 1 | `1d50084f91e4` | `6070bdd62b3f` | 0.050832 | MATCH |
| 8 | `orca-sheer-tights` | 2026-11-14T15:15:52.638Z | 2:3 | 2 | `c4c98c1f139f` | `0ab05fdf99c0` | 0.062810 | MATCH |
| 9 | `orca-long-tail` | 2026-11-14T15:16:40.359Z | 2:3 | 2 | `412ddeac5b86` | `e211878aa5c7` | 0.062910 | MATCH |
| 10 | `orca-long-straight-hair` | 2026-11-14T15:17:31.695Z | 2:3 | 2 | `770c680d13ea` | `27b6945e5210` | 0.062910 | MATCH |
| 11 | `orca-cyber-mecha` | 2026-11-14T15:18:36.356Z | 2:3 | 2 | `28e1fe0fe3c7` | `9b5cc54ba44b` | 0.063240 | MATCH |
| 12 | `orca-cyber-modular-sheet` | 2026-11-14T15:20:01.890Z | 3:2 | 2 | `e19c141a15f6` | `60b45e98d08d` | 0.063150 | MATCH |
| 13 | `orca-cute-loli` | 2026-11-14T15:41:17.955Z | 2:3 | 2 | `2ad1e79a8a9e` | `9ba7fd8a2cfa` | 0.063295 | MATCH |
| 14 | `orca-blue-redesign` | 2026-11-14T15:50:29.602Z | 2:3 | 2 | `e10a1c5a5d06` | `6220f0df086a` | 0.063435 | MATCH |
| 15 | `orca-blue-redesign-chibi` | 2026-11-14T15:51:34.063Z | 1:1 | 3 | `1cff25194ea0` | `2af87635ecca` | 0.082792 | MATCH |
| 16 | `orca-breton-sheer` | 2026-11-14T15:52:25.881Z | 2:3 | 2 | `1647a0aad578` | `39e481574967` | 0.063105 | MATCH |
| 17 | `orca-nostreak-white-markings` | 2026-11-15T00:57:30.012Z | 2:3 | 2 | `7bfd704e069a` | `16dfe32c704f` | 0.063510 | MATCH |
| 18 | `orca-nostreak-v2` | 2026-11-15T01:12:54.540Z | 2:3 | 3 | `d98529e799a1` | `37b3f279fe49` | 0.077158 | MATCH |
| 19 | **`orca-nostreak-v3`** | 2026-11-15T01:18:49.259Z | 2:3 | 3 | `418cea769eed` | `13e0f8d8fba9` | 0.081594 | MATCH |

**合计（19 条）**：prompt 字符 27,138；成本 **$1.198385**（JSON `cost_usd` 求和；与 `calls-ledger.jsonl` 中 Orca 部分一致）。

### 2.1 临时权威 v3 的完整记录（用户 2026-11-15 指定“暂时为准”）

```text
文件            <private-path>
尺寸/透明度     1024×1536 PNG，has_alpha=true，1,113,951 B
prompt_sha256   418cea769eed3d865e73d819c7243cf76f83e7b7cbb8c522f0f0720c508db2c1
prompt_chars    2815
config_sha256   ba99c13c46d290796ed44cbfdab9460cb15e52fa8b97aab2483ed7367fbcad9d
body_sha256     30039eb2a90e202bb6cd3fe0687f91ce1fa9345576b93b3c161a2f5d6a1bbb5f
body_bytes      4,511,761（含 base64 参考图）
output_sha256   13e0f8d8fba992e241837b08f6c8653a6f93fe7ef9fc5df45b4bd2b4d3152edf
参数            aspect_ratio=2:3, quality=high, background=transparent, output_format=png, n=1
参考图          orca-nostreak-v2-20261115-091254.png        37b3f279fe49b2c010be7396152ae223039a51ffc059b94002a24b91d6acde7a
                orca-nostreak-white-markings-…png         16dfe32c704f243d319766cee53e2cfc10c07c99e0d9254144dca55b02677bd3
                orca-normal-front-20261114-231450.png     6070bdd62b3f0ffa5055cc52e2729db9d9845530e7a42bd06cda0bee83880f98
调用            2026-11-15T01:18:49.259Z（本地 09:18:49+08），elapsed 46,556 ms，HTTP 200
usage/cost      prompt 5,322 tok / image 1,372 tok / total 6,694 tok → $0.081594
note（脚本通用）  "AI draft for internal evaluation only; not final art; reference-derived draft input is not licensed for release."
```

> 关于 `note`：这是生成脚本的**通用提示**；v3 的 3 张参考图均为本 OC 自产图（见上），不涉及 ref10/溟月。但“不是 final art、内部评估用”的判断仍然有效——v3 未做人工像素终审。

### 2.2 人工修改链（Human edits，非 AI 调用）

| 处理 | 工具/脚本 | 脚本 sha256（前 16） | 备注 |
|---|---|---|---|
| 像素化 128 pack | `art/_private-reference/refs/tools/ai_hero_pipeline.py`（gitignored） | `5a73493b8306489e` | 生成 `<private-path>`；`pipeline-result.json` 记 PASS/36 帧/bbox/色数 |
| 像素化 128（自定义调色板） | `art/_private-reference/refs/tools/ai_hero_pipeline_128.py` | `3c3ee15d68cd538f` | 同上 |
| 蓝色调色 | `art/_private-reference/refs/tools/blue_orca_grade.py` | `374608f58a291c05` | 13 张原图本地确定性调色，无新 AI 调用 |
| 通用像素化 | `scripts/pixelize.py`（tracked） | `efa5c217aac142ac` | |
| 占位渲染 | `scripts/placehold.py`（tracked） | `aeed16b5bac7402f` | 无图像模型 |
| 语音 pilot 生成 | `scripts/voice-pilot.mjs`（tracked） | `ae1912c23d0c1c34` | 见 §4 |
| v3 细节图 | 本地裁切/合成 `orca-nostreak-v3-details.png` | — | 无独立生成记录（非 AI 调用） |

> 这些脚本在 `art/_private-reference/`（gitignored）；若未来要作为“人类智力投入/可复现管线”证据随产品发布，应把**脚本版本 + sha** 与输出一起归档（当前只有本地）。

### 2.3 成本交叉核对

- Orca 19 条：$1.198385；Pearl 5 条：$0.31249；合计 **$1.510875** = `calls-ledger.jsonl` 24 条成本求和（精确一致）。
- `<private-path>` 的 “$0.282434（早期 5 次）” 是上述 #1–#5 的子集：0.055210+0.050832+0.062865+0.062935+0.050592 = 0.282434。
- 价格快照为 2026-11-14/15 的 OpenRouter 记录；后续以账单为准。

## 3. Pearl 调用链（5 次记录，合计 **$0.31249**）— 仅内部，**不可发布**

| # | phase | called_at (UTC) | aspect | 参考图 | prompt sha256（前 12） | 输出 sha256（前 12） | 成本 USD |
|---:|---|---|---|---|---|---|---:|
| 1 | `phase-a` | 2026-11-14T10:58:27.580Z | 1:1 | `ref10-front-crop-padded.png`（同人图，无授权） | `b7061b02301a` | `57abc991bd42` | 0.063122 |
| 2 | `phase-b` | 2026-11-14T10:59:23.508Z | 1:1 | phase-a 输出 | `f07e769c1828` | `d4075d8fbe4b` | 0.062242 |
| 3 | `phase-a-128` | 2026-11-14T12:09:41.004Z | 1:1 | `ref10-front-crop-padded.png` | `cb79d75bf4dd` | `0ea3108437f2` | 0.062237 |
| 4 | `phase-a-128-v2` | 2026-11-14T12:31:13.678Z | 1:1 | `ref10-front-crop-padded.png` | `a4a4e179b642` | `3d693ddf8313` | 0.062352 |
| 5 | `phase-a-128-v3` | 2026-11-14T12:37:09.953Z | 1:1 | `ref10-front-crop-padded.png` | `3db0b9a7f4cb` | `98f4266e699b` | 0.062537 |

- **风险（重要）**：Pearl 草稿把 **ref10（JerryZRic，无授权同人图）** 作为 `input_references` 上传至 OpenRouter/OpenAI。据此派生的图与像素化结果**不得发布、不得进商店/宣传/press kit、不得当正式素材**（`docs/PEARL-HERO-AI-DRAFT-LOG-2026-11-14.md` §4；`docs/PEARL-ART-LICENSE-CHAIN-2026-11-14.md`）。Orca 的生成**未使用** ref10/溟月参考图（Orca JSON 的 refs 均为自产图；另有用户文档声明）。
- Pearl prompt 文本部分保存在 `gen-config.json`（如 `phase-a` / `phase-b` / `phase-a-128*` 的完整 prompt）；Orca prompt 文本**未见落盘**（只有 sha/字符数，见 §5 缺口）。
- 输出 sha 与本地 `ai-drafts/*.png` 同样全部 MATCH；文件在 gitignored 目录。

## 4. 语音（TTS）生成链 — 非图像，内部占位

| 项 | 值 |
|---|---|
| 服务/模型 | DeepSeek TTS API，`voice_id=stella`，`format=wav` |
| 端点 | `https://api.deepseek.com/v1/tools/tts` |
| 脚本 | `scripts/voice-pilot.mjs`（sha256 前 16 `ae1912c23d0c1c34`） |
| 首次生成 | 2026-11-14；提交 `86de18c`（10 句，替换旧 SAPI 占位） |
| 补录 | 提交 `9c15330`（+8 句） |
| 当前文件 | 18 个 WAV，`assets/voice/pet/`，合计 1,588,632 B，24 kHz 单声道 16-bit |
| 计费字符（估算） | 256（中文 2/其他 1） |
| 成本记录 | 首轮 10 句 ¥0.0234（156 字符）；补录 8 句成本**未单独入账 ⇒ TBD** |
| 条款状态 | 商业/再分发/署名/音色限制**待上游确认**（`THIRD-PARTY.md` §2） |
| 人工修改 | 无（直接使用 API 输出；无后期处理记录） |

## 5. 缺口与待办（证据层）

| # | 缺口 | 影响 | 建议动作 |
|---|---|---|---|
| 1 | **Orca prompt 原文未落盘**（只有 sha/字符数；`gen-config.json` 是 Pearl 阶段） | 可复现性与“人类智力投入”证据减弱；律师可能要求 prompt 文本 | 从生成会话/本地记录恢复 prompt，按 §6 模板保存（**不含 key**）；恢复不了则标注“不可恢复” |
| 2 | `request_id` 为 null | 无法向供应商对账单次请求 | 未来调用记录 provider 返回的 id；对账用账单 |
| 3 | 无 seed | 无法逐像素复现 | 记录“不可复现”；保留输出 sha + 参考图 sha 即可追溯 |
| 4 | 元数据内 `file` 路径过期（指向旧 `ai-drafts/`） | 人工按路径找文件会困惑 | 未来记录写迁移后路径；本次以 sha 认定 |
| 5 | Pearl 5 次含无授权参考图 | 草稿/派生不得发布 | 保持 gitignored；公开前扫描确认未入库；不要复用其像素化输出 |
| 6 | TTS 补录 8 句无成本记录 | 记账不完整 | 若账单可查则补记；否则标 TBD |
| 7 | 人工修改工具多为 gitignored 本地脚本 | 管线不可复现/证据不随产品 | 关键脚本（pixelize/pipeline）纳入版本控制或归档，并记录 sha |
| 8 | 未做 C2PA/IPTC 元数据写入 | AI 隐式标识缺失 | 发布流程 P1 落地（见 `docs/LEGAL-STATUS-2026-11-15.md` §6） |

## 6. 如何新增记录 / 保留证据（模板）

### 6.1 每条生成记录的 JSONL 模板

建议文件：`provenance/orca.jsonl`（**未来新增，本草案未创建该文件**；仓外可先放 `<private-path>`）。一条一行：

```json
{
  "asset_id": "orca.oc.v3",
  "file": "<private-path>
  "phase": "orca-nostreak-v3",
  "model": "openai/gpt-image-2.6-sunburst",
  "provider": "OpenRouter",
  "endpoint": "https://openrouter.ai/api/v1/images",
  "called_at": "2026-11-15T01:18:49.259Z",
  "params": { "aspect_ratio": "2:3", "quality": "high", "background": "transparent", "output_format": "png", "n": 1 },
  "prompt_text_path": "<private-path>
  "prompt_sha256": "418cea769eed3d865e73d819c7243cf76f83e7b7cbb8c522f0f0720c508db2c1",
  "prompt_chars": 2815,
  "references": [
    { "path": "<private-path> "sha256": "37b3f279fe49b2c010be7396152ae223039a51ffc059b94002a24b91d6acde7a" }
  ],
  "output_sha256": "13e0f8d8fba992e241837b08f6c8653a6f93fe7ef9fc5df45b4bd2b4d3152edf",
  "usage": { "cost_usd": 0.081594, "prompt_tokens": 5322, "image_tokens": 1372 },
  "human_edit": [
    { "tool": "scripts/pixelize.py", "tool_sha256": "efa5c217…", "what": "128x128 pixelize, 27 colors", "at": "2026-11-15" }
  ],
  "license": "CC-BY-NC-SA-4.0 (draft; LICENSE-ART)",
  "ai_disclosure_required": true,
  "release_ok": false,
  "note": "internal draft; not final art"
}
```

### 6.2 新增一次生成的落地步骤

1. **调用前**：确定 `asset_id`；保存 prompt **原文**（`prompts/<phase>.txt`）与完整参数；确认参考图均有明确许可（**禁止**使用无授权同人图做发布素材；若只用内部，必须在记录中标记 `internal_only=true`）。
2. **调用后**：立即保存供应商返回的 `.json` 元数据与输出文件；`sha256sum` 输出；记录 `called_at`、`cost_usd`、`usage`、`request_id`（若有）。
3. **校验**：重算输出 sha 与元数据 `images[0].sha256` 比对；不一致则不可入库；记录校验日期。
4. **后处理**：任何像素化/调色/裁切/合成/再生成都追加 `human_edit[]`（工具、脚本 sha、动作、日期）；保留中间文件（或至少保留 sha）。
5. **登记**：更新本文件（或在 `provenance/*.jsonl` 增行）→ `CREDITS.md` 加 TASL → 相关图随附 `LICENSE-ART`。
6. **发布判定**：`release_ok=true` 需要同时满足：许可已确认 + 相似度审查通过 + 第三方条款确认 + AI 披露方案落地；否则保持 `false`。
7. **保留期与安全**：保留 prompt/元数据/输出 sha 至少与发布物同寿命；**绝不写入 API key、账号 token、个人隐私数据**；如 prompt 含个人信息，先脱敏再入库。

### 6.3 可复核命令

```bash
# 输出 sha 与元数据核对
sha256sum "D:/Orca/oc-revisions/orca-nostreak-v3-20261115-091849.png"
python3 - <<'PY'
import json
d=json.load(open('D:/Orca/oc-revisions/orca-nostreak-v3-20261115-091849.json'))
print(d['response']['images'][0]['sha256'])
PY

# 全部 Orca 元数据一览（只读）
python3 - <<'PY'
import json,glob
for j in glob.glob('D:/Orca/**/*.json',recursive=True):
    d=json.load(open(j))
    if 'request' in d: print(d['phase'], d['called_at'], d['response']['cost_usd'])
PY

# TTS 文件 hash（用于替换/追溯）
sha256sum assets/voice/pet/*.wav
```

### 6.4 TTS 新增记录要点

- 记录：`voice_id`、API 端点、manifest 版本、生成日期、脚本 sha、每句计费字符、成本；
- 保存：`manifest.json` + 生成结果（WAV）+ 文件 sha；不要保存请求头/Authorization；
- 若用运行时云 TTS（非预生成），记录“哪一句实时生成、供应商、缓存位置”，并在首启/设置页披露 AI 合成语音。

## 7. 与 AI 披露/可版权性的关系

- 本文件的记录是**人类智力投入**（提示词迭代、参考图组织、筛选、后处理）的辅助证据；它**不能保证** AI 输出在中国/美国/欧盟构成作品（见 `LICENSE-ART` §5）。
- 发布时按渠道做显式 + 隐式标识：图片角落 “AI 生成” 标注、PNG/XMP 元数据、商店页 AI 申报、首启 “AI 语音/对话，可能出错” 等；具体待律师/用户确认（`docs/LEGAL-STATUS-2026-11-15.md` §6）。
- 本文件不记录任何 key；若发现 key 泄露，按用户凭据流程 revoke，**不要**把 key 写进任何文档/提交。

## 8. 变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版草案：汇总 Orca 19 条 + Pearl 5 条 + TTS 18 文件；记录校验/成本/缺口与新增模板 | draft；待用户 + 律师确认 |

> 本文件是草案，不是法律意见；所有成本/条款以供应商账单与官方文本为准。
