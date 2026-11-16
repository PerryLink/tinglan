# Character packs

Status: **placeholder / DRAFT**；未对外发布。角色数据为纯数据（JSON+PNG/音频），运行时不执行包内代码。

| 目录 | 角色 | 类型 | 美术 | 说明 |
|---|---|---|---|---|
| `humanoid-default/` | Pearl-compatible humanoid | humanoid | placeholder 96×96 | legacy 占位；非 final |
| `pet-default/` | cat-like behavior default | pet | pending | 行为-only |
| `pet-cat/` | 猫占位 | pet | programmatic 96×96 | placeholder-only |
| `pet-dog/` | 狗占位 | pet | programmatic 96×96 | placeholder-only |
| `tinglan/` | 汀岚 Orca secretary | humanoid | **pending（128 Q / v3 立绘待定）** | FCI 0.3 行为/语音定义；no art/audio yet |

## 声明

- 角色包是**数据**，不包含可执行代码；不得发布脚本/插件形式绕过。
- 每个包的 `license`/`meta`/`audio[].license`/`credits` 必须写清素材来源、作者、AI 披露；第三方素材按 [THIRD-PARTY.md](../../THIRD-PARTY.md)。
- 官方角色美术 **CC BY-NC-SA 4.0**（用户 2026-11-16 决定；非商业+同协议；律师审查暂缓；见 [LICENSE-ART](../../LICENSE-ART)）；角色名/Logo/商标不随 CC BY-NC-SA 授权。
- 二创/替换/新增动作请读 [docs/modding/](../../docs/modding/)；法务与内容红线见 [docs/legal/](../../docs/legal/) 与 [DECLARATIONS.md](../../DECLARATIONS.md)。
- 禁止：冒充官方/暗示 DeepSeek 合作、真人声音克隆、未授权音源/他人 IP、恶意代码、未成年人性化内容、抢注角色名/商标。
- 未完成的占位包**不得**作为 final art 发布；`pearl-placeholder` 仅 placeholder-only。
