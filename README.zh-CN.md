# ContextParcel

**切换 AI Agent 时，不必再把项目从头解释一遍。**

把 ChatGPT 中已经讨论清楚的上下文，一次交给 Codex、Claude Code 或 Cursor。Discuss anywhere. Build anywhere.

[English](README.md) · [开放协议](docs/protocol.md) · [安全说明](SECURITY.md)

[![CI](https://github.com/AIM135D/contextparcel/actions/workflows/ci.yml/badge.svg)](https://github.com/AIM135D/contextparcel/actions/workflows/ci.yml)

```text
ChatGPT / 网页选中文本
          │
      点击 Handoff
          ▼
    ContextParcel
    对话上下文 + Git
          │
    本地 handoff.md
     ┌────┼─────┐
     ▼    ▼     ▼
  Codex Claude Cursor
```

所有对话都留在本机。ContextParcel 不依赖云端后端，不要求账号或 API key，也不会读取用户没有明确交接的其他对话。

## 完成第一次交接

ContextParcel 目前通过 GitHub Releases 分发。npm 包名已经保留，但尚未发布到 npm registry。

```bash
npm install -g https://github.com/AIM135D/contextparcel/releases/download/v0.2.0/contextparcel-0.2.0.tgz

cd /path/to/your/project
contextparcel setup
```

`setup` 会注册项目、检查 Git 和受支持的 Agent CLI、在后台启动 daemon，并显示配对码。重复执行不会创建重复项目或进程。

接着安装浏览器扩展：

1. 从 [v0.2.0 Release](https://github.com/AIM135D/contextparcel/releases/tag/v0.2.0) 下载 `contextparcel-extension-v0.2.0.zip` 并解压。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 启用“开发者模式”，点击“加载已解压的扩展程序”，选择刚才解压的目录。
4. 填入 `contextparcel setup` 显示的一次性配对码；如需新配对码，可运行 `contextparcel pair`。
5. 打开一个 ChatGPT 对话，点击 **Handoff**。

预览阶段只向 `127.0.0.1` 发送消息数量、选项和项目 ID。只有点击 **Send** 后，对话正文才会在本机传给 daemon。

## 会交接什么，不会交接什么

| 用户勾选后会交接                            | 不会交接                                           |
| ------------------------------------------- | -------------------------------------------------- |
| 指定范围内的对话消息和当前任务              | 其他对话或隐藏历史                                 |
| 分支、HEAD、变更文件名、diff 统计和近期提交 | `.env`、SSH key、认证信息、仓库文件内容或完整 diff |
| 已注册项目的身份和目标 Agent                | 云端上传、遥测或账号数据                           |

## 四项主要能力

### 一键交接

可以发送指定消息、最近 N 条消息或当前完整对话。如果 ChatGPT 更新页面结构导致 adapter 暂时失效，仍可在任意网页选中文字，通过右键菜单中的 **Handoff selection** 完成交接。

### 感知项目状态

每个 packet 会把用户授权的对话与本地仓库状态放在一起，包括分支、HEAD、工作区是否有修改、变更文件名、diff stat 和最近五条提交。Git 采集全程只读，不读取完整 diff 或仓库文件内容。

### 本地优先

扩展只连接绑定在 `127.0.0.1` 的本地 daemon。一次性配对码用于建立扩展专属 secret；此后每次访问非公开路由，都必须同时通过精确 Origin 校验和 bearer token 校验。

### 开放 Handoff 协议

每次交接都会生成版本化的 `handoff.json` 和便于人工检查的 `handoff.md`。第三方 source/target adapter 可以直接实现同一套 [Handoff Packet v1](docs/protocol.md)。

## 初始化后会创建什么

`contextparcel init` 会记录项目的规范化根目录，并在项目内创建：

```text
.contextparcel/
├── config.json
└── handoffs/
    └── .gitkeep
```

命令还会把以下规则写入 `.gitignore`：

```gitignore
.contextparcel/handoffs/*
!.contextparcel/handoffs/.gitkeep
```

每次交接的 `handoff.json` 和 `handoff.md` 保存在 `.contextparcel/handoffs/<id>/`。全局 history 只记录必要元数据，packet 中的对话正文则留在本地项目目录，直到用户执行 `contextparcel delete <id>` 或 `contextparcel clear`。

## 浏览器中的使用流程

面板提供以下选择：

- 目标：Codex、Claude Code 或 Cursor；
- 对话范围：指定消息、最近消息、完整对话或任意网页选区；
- 项目：通过 `contextparcel init` 主动注册的本地根目录；
- 附带内容：Git 上下文、用户消息、助手消息和当前任务。

扩展不会操作 ChatGPT 输入框，不会代替用户发送消息，也不会浏览其他对话。网页同样不能借扩展要求 daemon 执行任意 shell command。

## 项目定位

ContextParcel 只处理“浏览器对话进入本地开发环境”这一段：用户明确选择消息范围，工具生成可检查的本地 packet，附上只读仓库状态，再交给已有的 Coding Agent CLI。它不是聊天归档、提示词管理器、云同步服务或 Agent 编排器。

## CLI

```text
contextparcel init [path]            初始化并注册项目
contextparcel setup [path]           引导式、可重复执行的首次设置
contextparcel start                 在后台启动 daemon
contextparcel stop                  停止由 ContextParcel 管理的后台 daemon
contextparcel restart               重启后台 daemon
contextparcel serve                 在前台启动 daemon
contextparcel status                查看 daemon、配对和项目状态
contextparcel pair                  生成六位一次性配对码
contextparcel doctor                检查 Node、Git、daemon、扩展和 Agent CLI
contextparcel history               查看本地 handoff 元数据
contextparcel delete <id>           删除一个 packet 及其对话内容
contextparcel clear                 删除全部 packet 和 history
contextparcel send                  从文件、参数或 stdin 创建交接
contextparcel demo                  显示示例 handoff
```

只生成 packet 和 bootstrap prompt，不启动 Agent：

```bash
contextparcel send --target codex --message "实现已经确认的 API" --dry-run
```

也可以发送由 `{ "role": "user|assistant", "text": "..." }` 组成的 JSON 消息数组：

```bash
contextparcel send --target claude --project my-project --file conversation.json
```

## Target adapter

| 目标        | 检测方式                                                  | 启动方式                        | 安装文档                                                                    |
| ----------- | --------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Codex       | `codex --version`                                         | `codex --cd <project> <prompt>` | [Codex CLI](https://developers.openai.com/codex/cli/)                       |
| Claude Code | `claude --version`                                        | `claude <prompt>`               | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage) |
| Cursor      | 先检测 `agent --version`，再检测 `cursor-agent --version` | `<command> <prompt>`            | [Cursor CLI](https://cursor.com/docs/cli/overview)                          |

ContextParcel 沿用 Agent 已有的登录状态，不读取或复制认证文件。启动进程时使用明确的 executable 和 argv 数组，不会把用户文本拼接成 shell 命令。

## 安全边界

扩展只能提交项目 ID，不能向 daemon 提交本地路径。daemon 通过本机 registry 解析 ID，并验证每个生成路径都位于已注册项目的规范化根目录内。所有请求都经过严格的 Zod schema 校验，body 上限为 2 MiB；CORS 只对已经配对的 `chrome-extension://` Origin 开放。

ContextParcel 不会读取 `.env`、SSH key、credentials、仓库文件内容或完整 Git diff。完整威胁模型和漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 从源码开发

需要 Node.js 20 或更高版本。

```bash
git clone https://github.com/AIM135D/contextparcel.git
cd contextparcel
npm ci
npm run verify
node dist/contextparcel.cjs demo
```

执行 `npm run build` 后，可将 `apps/extension/dist` 作为未打包扩展加载。

## Demo

运行 `contextparcel demo` 可以直接查看示例，也可以打开 [`examples/sample-handoff`](examples/sample-handoff)。[`docs/demo-script.md`](docs/demo-script.md) 提供一份 10～20 秒的真实录制脚本。仓库没有用模拟画面冒充真实浏览器录屏。

## 相关项目

- [ContextRelay](https://github.com/proofofwork-agency/contextrelay) 主要处理 Coding Agent 之间的上下文协作。ContextParcel 聚焦更前一段流程：把 Web AI 中的规划对话连同仓库状态交给本地 Coding Agent。
- [HandoffKit](https://github.com/dyngai/handoffkit) 探索 AI 编码工作的结构化交接。ContextParcel 增加了明确的浏览器到本地流程，以及经过配对认证的 localhost 访问边界。

这些项目处理相邻问题，上述说明只用于划分范围，不评价项目质量。

## V0.2 的限制

- 目前只有 ChatGPT Web 支持结构化消息解析，其他网站使用文字选区；
- 扩展通过 Release ZIP 分发，尚未进入 Chrome Web Store 或 Edge Add-ons；
- npm registry 发布仍需维护者账号登录，请先安装 Release 中的 tarball；
- packet 是本地文件，不包含云同步、团队空间或自动总结。

欢迎参与贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。source/target adapter 接口很小，新增支持不需要改动核心流程。

MIT © 2026 ContextParcel contributors
