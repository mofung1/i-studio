# iStudio 运营后台

后台使用 Vite、TanStack Router 和 shadcn/ui，侧栏、顶栏、搜索及主题基于 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin/tree/e16c87f213a5ba5e45964e9b67c792105ec74d26)。上游授权见 `LICENSE.shadcn-admin`。

从仓库根目录，随本地 Compose 启动：

```sh
docker-compose -f docker/docker-compose.yml up -d --build --wait admin
```

打开 <http://127.0.0.1:33001/admin/login>，使用现有管理员账号。前台仍可在原端口使用。新版后台使用独立端口，第一次访问时需重新登录。`ADMIN_PORT` 可改变该端口，`ADMIN_WEB_ORIGIN` 可设置“返回前台”的地址。

本地开发需要 Node.js 22.12+ 与 pnpm，并需要可访问的 Go API：

```sh
cd admin
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Vite 默认将 `/v1` 转发到 `http://127.0.0.1:44000`。API 在其他端口时，可在 `admin/.env.local` 设置 `ADMIN_API_PROXY`。Docker 镜像由 Caddy 托管 `/admin/` 和静态资源，并通过 Compose 网络将 `/v1` 转发给 `api:4000`。

已接入登录、运营概览、AI 服务、模型与定价、系统提示词、用户与余额、生成任务、意见反馈、公共灵感库、投稿审核、网站配置、图片存储、运营设置、操作日志。管理员身份与权限由 Go API 校验，独立后台沿用现有数据。新版验收期间，旧 `/admin` 入口仍可访问。根目录 `compose.yml` 的单镜像安装当前仍使用旧入口。
