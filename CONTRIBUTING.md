# 参与贡献

谢谢你对这个班级网站感兴趣！无论是修 bug、加功能、改文案还是补文档，都欢迎。

## 可以做什么

- 🐞 **报 bug**：用 [Bug 反馈](.github/ISSUE_TEMPLATE/bug_report.yml) 模板，写清复现步骤、浏览器版本、看到的报错。
- 💡 **提需求**：用 [功能建议](.github/ISSUE_TEMPLATE/feature_request.yml) 模板，说清使用场景（谁在什么情况下需要它）。
- 📝 **改文档**：[`README.md`](README.md)、[`docs/使用说明.md`](docs/使用说明.md)、[`docs/部署到Cloudflare.md`](docs/部署到Cloudflare.md) 都欢迎直接改。
- 🔧 **写代码**：先开 issue 聊一下方向，避免白写；小的修复可以直接发 PR。

## 开发环境

需要 **Node.js 22+**（项目用到 `crypto.randomUUID`、内置 `fetch`、`node:test`）。

```bash
git clone https://github.com/wwccyy2912/class-hub.git
cd class-hub
npm install
npm run build          # 打包 Worker 与前端资源到 dist/、generated/
npm run db:migrate     # 建本地 D1 表结构
npm run dev            # http://127.0.0.1:4173，首次打开是初始化向导
```

本地 D1 与 R2 由 wrangler 在 `.wrangler/state/` 里模拟，不需要 Cloudflare 账号；想彻底重置就 `rm -rf .wrangler/state && npm run db:migrate`。

## 目录结构

```
src/server/     Worker 入口与后端逻辑（路由、鉴权、上传、聊天、日历）
src/client/     浏览器端：界面逻辑、网络自适应、PDF 阅读器
src/shared/     前后端共用：文件类型与限制、课程表算法、权限、ZIP 解析、PDF 大纲
assets/         HTML 模板、样式、主题脚本
db/schema.ts    Drizzle 表结构；drizzle/ 是迁移文件（改结构后跑 npm run db:generate）
scripts/        构建、图标生成、节假日同步、端到端测试驱动
tests/          单元测试与端到端套件（tests/browser/ 是需要本机 Chrome 的界面套件）
docs/           使用说明与部署文档
```

## 代码风格

- 源码刻意写得**紧凑**（一行里可以有多条语句、简短的变量名），改动时请跟随周围风格，不要顺手格式化整个文件。
- 注释、报错提示、界面文案一律用**简体中文**。
- 后端所有输入都要当作不可信：新加接口记得走 `needs(user, 权限键)`、限制请求体大小、校验文件头。
- 涉及数据库结构的改动，请用 `npm run db:generate` 生成迁移，不要手写改表。

## 测试

```bash
npm test            # 单元测试（纯 Node，很快）
npm run test:e2e    # 端到端：自动启本地服务，跑权限/聊天/上传/集成/限流
npm run test:browser  # 需要本机 google-chrome，先 npm run dev
```

**提 PR 前请至少跑通 `npm test` 与 `npm run test:e2e`**（也可以设置 `ADMIN_USER` / `ADMIN_PASSWORD` 复用已有数据库）。

## 提交 PR

1. Fork 仓库并从 `main` 切一个分支：`git checkout -b fix/chat-polling`。
2. 一次 PR 只做一件事；改动大的话先在 issue 里对齐方案。
3. Commit message 用中文，格式 `类型: 说明`，类型取 `feat` / `fix` / `docs` / `chore` / `perf` / `refactor` / `test`。
4. 在 PR 描述里写清「改了什么、为什么、怎么验证的」，涉及界面的改动建议附一张截图。

## 请不要提交

- `.dev.vars`、任何 token / 密钥 / 账号密码，以及真实的学生姓名、照片、学校文件。
- `dist/`、`generated/` 等构建产物（已在 `.gitignore` 里）。
- 与本次改动无关的大范围格式化。

## 许可证

本项目以 [GPL-3.0-or-later](LICENSE) 发布，你提交的代码会以同样的许可证分发。
