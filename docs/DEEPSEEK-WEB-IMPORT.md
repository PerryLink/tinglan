# DeepSeek 网页分享对话导入（本地优先）

Status: **可用（需 Tauri 桌面版；网页/browser-fallback 受 CORS 限制）**。不登录、不读取私有会话列表、不上传导入内容。
用户入口：`chat-import.html`（pet 面板“导入会话”按钮打开），或直接访问该页。

## 支持的输入

DeepSeek 网页对话的**分享链接**，例如：

```text
https://chat.deepseek.com/share/trp6sludpfs17gs6hw
```

也接受裸 share id。分享页是只读公开内容；私有对话必须先由用户在 DeepSeek 网页里“分享”生成链接。

## 读取方式

网页分享页实际从公开接口读取：

```text
GET https://chat.deepseek.com/api/v0/share/content?share_id=<id>
```

浏览器直接 fetch 会受 CORS/风控限制；Tauri 版通过 Rust 命令 `fetch_deepseek_share`（固定 host、严格校验 id、25s 超时）读取，再交给前端解析。**不使用第三方代理**。

返回结构（节选）：

```json
{"code":0,"data":{"biz_data":{"title":"...","messages":[
  {"role":"USER","fragments":[{"type":"REQUEST","content":"..."}]},
  {"role":"ASSISTANT","fragments":[{"type":"THINK","content":"..."},{"type":"RESPONSE","content":"..."}]}
]}}}
```

解析规则：

- `USER` + `REQUEST` → 用户消息；`ASSISTANT` + `RESPONSE` → 助手消息；
- `THINK` 只保留为独立字段，**不作为用户内容**、不进入摘要；
- 空消息/非文本 fragment 忽略；无 user/assistant 文本则报错；
- 标题缺失用 `DeepSeek shared conversation`。

## 本地摘要（默认不调模型）

`buildDigest()` 本地确定性提取：

- 主题：用户文本的中文 2–4 字 n-gram + 英文词，按频次取前 12；
- 偏好/约定：含“我喜欢/习惯/不要/以后/记住/叫我/希望/请用…”的句子；
- 待办/承诺：含时间/截止/记得/安排/跟进…的句子；
- 统计：user/assistant 轮数、总消息数；
- **默认只保存摘要**（`localStorage: desktop-games/pet/chat-import/v1`），不保存原始对话；`rawStored:false`。

## 费用与隐私提示

- 页面顶部显著提示：读取分享不调用模型；**后续模型摘要/融入/语音会产生费用**，由用户自己的 API Key 账户承担。
- 导入完成后状态栏再次提示费用。
- 仅读取用户主动提供的公开分享链接；不登录、不抓私有历史、不扫描浏览器数据。
- 原始内容版权归原作者；只导入你有权访问/使用的内容；禁止导入他人隐私/未授权内容。
- 相关声明：[TTS-TERMS](legal/TTS-TERMS.md)、[SECURITY-AND-PRIVACY](legal/SECURITY-AND-PRIVACY.md)、[FANWORK-POLICY](legal/FANWORK-POLICY.md)。

## 限制 / 下一步

- 分享链接必须公开可访问；失效/风控/429 会报错，可稍后重试。
- 网页版无 Tauri 时直接 fetch 可能 CORS 失败；这是浏览器安全限制，不用代理绕过。
- 尚未做“原始对话本地加密归档”“模型摘要/融入”（当前只做本地摘要 + 摘要存储）；接入模型前必须再次显示费用提示。
- 不会自动把原始对话发送给任何模型；未来若提供“模型融入”按钮，必须是显式操作 + 费用确认 + 可撤销。
