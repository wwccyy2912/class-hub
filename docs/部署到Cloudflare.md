# 部署到 Cloudflare（Workers + D1 + R2）

本站是 Cloudflare Workers 应用：页面与 API 跑在 Worker 上，账号/权限/消息/课程存在 **D1**，文件与聊天附件存在 **R2**。
第一次打开网站会进入**初始化向导**（填学校、班级、管理员账号密码），所以部署时不需要预先配置任何管理员密钥。

## 一、准备（只做一次）

```bash
cd class-site
npx wrangler login                                  # 浏览器里授权你的 Cloudflare 账号
npx wrangler d1 create class-local                  # 建数据库，记下输出里的 database_id
npx wrangler r2 bucket create class-local-files     # 建对象存储桶
```

把上一步的 `database_id` 填进 `wrangler.jsonc`：

```jsonc
{"name":"class-resource-hub","main":"dist/server/index.js","compatibility_date":"2026-09-01",
 "d1_databases":[{"binding":"DB","database_name":"class-local","database_id":"<粘贴真实 id>","migrations_dir":"drizzle"}],
 "r2_buckets":[{"binding":"BUCKET","bucket_name":"class-local-files"}]}
```

## 二、构建并发布

```bash
npm ci
npm run build                                       # 生成 generated/* 与 dist/server/index.js
npm run deploy:migrate                              # 应用数据库迁移到远端 D1
npm run deploy                                      # 发布 Worker
```

发布成功后会得到一个免费子域：`https://class-resource-hub.<你的子域>.workers.dev`。也可以绑自己的域名：Cloudflare 控制台 → Workers → 该 Worker → Settings → Domains & Routes → Add custom domain。

## 三、第一次打开

1. 打开站点地址，看到的是**初始化页面**；
2. 填学校名称、班级名称（可选副标题）、管理员账号与密码（≥12 位）→「完成初始化并进入网站」；
3. 进去后在「管理后台 → 用户组」建组、「资料与账户 → 创建班级账户」给同学开号；
4. 同一栏的「网站信息」「聊天设置」可随时改学校/班级名称、撤回时限与历史消息保存天数。

初始化只能做一次；数据库里已经有管理员后，再访问就是普通登录页。

## 四、之后的更新

```bash
npm run build && npm run deploy:migrate && npm run deploy
```

只改了页面/样式也要 `npm run build`：Worker 是打包后的 `dist/server/index.js`。

## 五、备份与恢复

```bash
# 数据库导出（含账号、权限、消息、课程）
npx wrangler d1 export DB --remote --output backup-$(date +%F).sql
# 对象存储里的资料与附件
npx wrangler r2 object get class-local-files/<对象名> --file 本地路径
```

## 六、常见问题

- **上传大文件失败**：视频上限 200 MB（>8 MB 自动分片，每片 8 MB）。若在代理/公司网络下失败，检查是否限制了单次请求体大小。
- **登录后提示会话失效**：改权限、换用户组、停用或重置密码都会立即失效该账号的登录，重新登录即可。
- **想换管理员**：用管理员账号建一个新的管理员账号，登录后到「账户与权限」把旧的管理员停用或删除（不能删除自己）。
- **不要**把 `.dev.vars`、`交付资料/` 里的任何文件上传到公开仓库；现在项目里已经没有内置管理员凭据了。
