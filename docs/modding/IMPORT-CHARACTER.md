# 导入角色包（作者侧 CLI）

Status: **可用（author-side，非运行时）**。该工具只复制/校验数据，**不执行包内代码**，也没有网络。

## 用法

```bash
# 1. 干跑：校验并显示目标目录，不写文件
node scripts/import-character.mjs ./my-pack

# 2. 复制到 public/characters/<id>
node scripts/import-character.mjs ./my-pack --apply

# 3. 指定目录名 / 覆盖本地实验包（官方 ID 默认拒绝）
node scripts/import-character.mjs ./my-pack --id my-pack --apply --force
```

## 检查项

- `character.json` 存在且 JSON 合法；`license` 与 `ai.status` 必填。
- 运行 `scripts/validate-character.mjs <dir> --json --strict`，失败即拒绝。
- 官方 ID（humanoid-default / pet-default / pet-cat / pet-dog / tinglan）默认拒绝覆盖。
- 只复制数据/资源；过滤 `node_modules/.git/dist/artifacts/target`。
- 写入 `IMPORTED.json`（导入时间、源路径、许可、AI 状态、校验器），便于溯源。
- 覆盖已有目录时旧包改名 `*.replaced-<timestamp>` 保留，审查后自行删除。

## 导入后

1. `npm test` 与 `npx tsc --noEmit`；
2. `node --import tsx scripts/validate-character.mjs public/characters/<id> --strict`；
3. 0.3 包可直接用 `pet.html?hero=1&character=<id>` 行为预览（无美术 HUD）；正式带美术的页面仍需注册/接入 pack；
4. 发布前跑 `npm run legal:check`（见 [docs/legal/](../legal/)）。

## 声明

导入 = 你确认拥有/有权使用全部素材；必须在包内保留作者、许可、AI 披露、非官方声明。禁止导入真人声音克隆、未授权音源、他人 IP、可执行代码。模板见 [DECLARATION-TEMPLATES.md](DECLARATION-TEMPLATES.md)。
