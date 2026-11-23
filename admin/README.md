# iStudio 运营后台

后台使用 Vite、TanStack Router 和 shadcn/ui，侧栏、顶栏、搜索及主题基于 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin/tree/e16c87f213a5ba5e45964e9b67c792105ec74d26)。上游授权见 `LICENSE.shadcn-admin`。

网站的 `/admin/login` 是各部署方式共用的后台入口。在仓库根目录用开发 Compose 启动网站及其依赖：

```sh
docker compose -f docker/docker-compose.yml up -d --build --wait web
```

打开 <http://127.0.0.1:33000/admin/login>，使用现有管理员账号。原有直连地址 <http://127.0.0.1:33001/admin/login> 也可使用。浏览器按来源保存会话，首次换端口访问时需登录。开发 Compose 的 `ADMIN_PORT` 控制直连端口，`ADMIN_WEB_ORIGIN` 指定“返回前台”的地址。

单独运行 Vite 热更新或后台测试时，宿主机需要 Node.js 22.12+ 与 pnpm。调试页面时可连接开发 Compose 的 Go API。

```sh
cd admin
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Vite 默认将 `/v1` 转发到 `http://127.0.0.1:44000`。API 在其他端口时，可在 `admin/.env.local` 设置 `ADMIN_API_PROXY`。Docker 镜像由 Caddy 托管 `/admin/` 和静态资源，并通过 Compose 网络将 `/v1` 转发给 `api:4000`。

已接入登录、运营概览、AI 服务、模型与定价、系统提示词、用户与余额、生成任务、意见反馈、公共灵感库、投稿审核、网站配置、图片存储、运营设置、操作日志。管理员身份与权限由 Go API 校验，独立后台沿用现有数据。

单镜像、分服务生产和宝塔部署均由 Caddy 在网站端口托管这套后台。现有书签、带查询参数的深链和管理员会话沿用原来的站点地址。详见[各部署方式的后台入口](../docs/development.md#各部署方式的后台入口)。
