# 使用 Docker 镜像安装 iStudio

应用镜像：`mofugn1/istudio`，同时提供 `linux/amd64` 和 `linux/arm64`。Docker 会按当前电脑架构选择镜像，适用于普通 Intel/AMD 电脑、Linux 服务器和 Apple Silicon 的 Docker Desktop。

一个应用镜像包含 Next.js 前端、Go API、同源访问网关，以及版本化的公共灵感库。Compose 另行启动 PostgreSQL 和 Redis。目标电脑只需 Docker Engine / Docker Desktop 与 Docker Compose v2，无需安装 Node.js、Go、Python，无需下载源码或构建镜像。

## 首次安装

在一个新的空目录打开终端，可直接从镜像导出 [`compose.yml`](../compose.yml)，再生成随机数据库密码和管理员密码：

```sh
umask 077
docker run --rm mofugn1/istudio:latest compose > compose.yml
docker run --rm mofugn1/istudio:latest setup > .env
docker compose up -d --wait --wait-timeout 180
```

`.env` 是当前安装的配置文件，请保存好。管理员用户名为 `admin`，密码是该文件中的 `ADMIN_PASSWORD`；没有通用默认密码。`setup > .env` 只用于新的安装目录，已有安装请保留原文件。

也可以复制 [`.env.example`](../.env.example) 为 `.env`，在编辑器里填写新的 `POSTGRES_PASSWORD` 和 12–128 位 `ADMIN_PASSWORD`，然后执行同一条 Compose 启动命令。Windows PowerShell 可使用此方式；使用重定向生成配置时，应将文件保存为 UTF-8。

启动完成后打开：

- 当前电脑：`http://localhost:8080`
- 同一局域网其他电脑：`http://这台电脑的IP:8080`
- 后台：`http://localhost:8080/admin/login`

端口由 `.env` 的 `WEB_PORT` 控制。只需本机访问时设 `BIND_ADDRESS=127.0.0.1`。数据库和 Redis 不对宿主机发布端口。应用浏览器请求使用同源 `/v1/`，无需为不同 IP、端口或域名重新构建前端。

## 首次初始化与后续升级

当前镜像内置 798 条公共提示词、13 个分类和 798 张封面。首次启动自动迁移数据库、校验并复制封面、创建灵感库及独立后台管理员。原仓库图片仍保存在 `server/storage/uploads/inspiration/`，构建时从这个原目录复制进镜像，没有移动到其他种子图片目录。

每个数据库只初始化公共库一次。重启、重建容器或换新镜像会保留已编辑、停用和删除的条目；接入已有公共库时也不会合并覆盖。新镜像增加的内置条目不会自动写入已有站点，需按对应增量批次有选择地导入。全新站点不需要内置灵感时，在第一次启动前设置 `INSTALL_INSPIRATION=false`。

镜像只携带公共内容，不携带开发电脑的账号、积分、用户上传、私人作品、AI 服务配置或密钥。AI 地址、密钥、模型和价格在新站后台配置；前台注册的用户仍为普通用户。

升级：

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 180
```

需要固定版本时，在 `.env` 把 `ISTUDIO_IMAGE` 从 `mofugn1/istudio:latest` 改为对应版本标签，再执行上述命令。数据库迁移随应用执行；升级前应先备份，旧版本不保证兼容新版本迁移后的数据库。

查看状态和日志、停止服务：

```sh
docker compose ps
docker compose logs --tail 100 app
docker compose down
```

数据库、Redis 和上传/生成图片使用当前 Compose 项目的命名卷持久化。普通 `down` 保留数据；不要对需要保留的安装执行 `down -v`。备份至少包括 `.env`、PostgreSQL 导出和 `uploads` 数据卷，后者也保存应用自动生成的签名及配置加密密钥。

公网服务应由现有反向代理提供 HTTPS，并转发到宿主机的 `WEB_PORT`。需要网站收录时设置 `SITE_ENV=production` 和 `NEXT_PUBLIC_SITE_URL=https://你的域名`，重建应用容器即可；默认 `preview` 阻止搜索收录。

## 构建与发布

维护者更新公开灵感内容后，重新导出版本化清单：

```sh
python3 scripts/prepare-image-catalog.py
```

这一步只读查询本地公共库，输出 `server/seed/inspiration-catalog.json` 和封面校验值；不复制或迁移图片。清单只保留公开字段，拒绝云存储、跨目录路径和符号链接。公共清单与原图片目录一起提交。

本机构建当前架构并验证：

```sh
docker buildx build -f docker/image.Dockerfile -t istudio:local --load .
python3 scripts/test-docker-image.py --image istudio:local
```

验收脚本使用随机项目名、独立数据卷和仅本机访问的端口，检查公共图片、管理员登录、升级保留和进程故障恢复；结束后仅清理自己的测试项目，不调用收费 AI。

GitHub Actions 的 `Publish Docker image` 提供手动发布。在仓库 Actions 配置变量 `DOCKERHUB_USERNAME` 和密钥 `DOCKERHUB_TOKEN`，手动选择 Docker Hub 镜像名与版本标签后，同时构建并推送 amd64、arm64。凭据不写入仓库或镜像。参照 [Docker 官方多架构构建说明](https://docs.docker.com/build/ci/github-actions/multi-platform/)。

原有 `docker/docker-compose.yml` 继续用于本地开发，`docker/compose.production.yml` 和 `docker/compose.baota.yml` 保留现有部署用途；根目录 `compose.yml` 专用于镜像安装，使用独立项目名和命名卷。
