# 汀岚 / Tinglan — 非官方桌宠角色与素材仓

本仓是 **桌宠角色/素材/接口子集**；完整可执行桌宠壳与游戏基座在私有仓，不在此发布。
非官方项目，不关联 DeepSeek；不使用官方 Logo/字标/官方鲸鱼娘形象。

## 许可

- 代码（本仓脚本/接口）：**PolyForm Noncommercial 1.0.0**（见 `LICENSE` / `LICENSE-COMMERCIAL.md`）；非 OSI 开源，商业需书面许可。
- 桌宠美术/设定：**CC BY-NC-SA 4.0**（见 `LICENSE-ART`）；非商业 + 同协议 + 署名；部分 CC0 素材见 `ASSET-LICENSES.md`。
- 第三方/参考素材、TTS 音频：各自条款；TTS 未确认前不分发。
- 角色名/Logo/商标不随 CC 许可授权；“Orca”不得作产品名（第42类在先商标）。

## 内容

- `public/characters/`：角色定义/行为/台词（汀岚为 behavior-only，暂无 final 美术/音频）
- `public/assets/pet/`：程序化占位包
- `src/pet/character/`、`src/pet/render/`、`src/pet/scene/`：FCI 接口/运行时/渲染插件的公开子集
- `content/schema/`、`scripts/validate-character.mjs`：角色包校验
- `docs/legal/`、`docs/modding/`、角色/UI/Advisers 设计文档

## 校验

```bash
npm install
npm run validate:character
```

## 声明

见 `DECLARATIONS.md`、`docs/legal/`、`docs/modding/`。反馈/安全：novelnexusai@outlook.com。
不提供 final art/audio；不承诺可执行 app；不得用本仓素材暗示官方合作/背书。
