# 安装部署

本指南使用仓库根目录的 `compose.yml`。应用、PostgreSQL 与 Redis 使用独立容器，默认仅发布网站 8080 端口；数据库与 Redis 不向宿主机发布端口。

## 环境要求

- Docker Engine 与 Compose v2 或更新版本，或运行 Linux 容器的 Docker Desktop。
- Linux amd64 / arm64；Docker 自动选择镜像架构。
- 能访问 Docker Hub。启用 AI 功能还需要能访问所配置的供应商服务。
- 网站上传与生成图片需要持久存储空间，按实际用量规划。

使用发布镜像不需要在宿主机安装 Go、Node.js、PostgreSQL、Redis 或 GPU 驱动。外部 AI 服务由管理员单独配置。

## clone 代码并部署

```sh
git clone https://github.com/mofung1/i-studio.git
cd i-studio
```

仅全新安装执行以下配置生成命令：

```sh
umask 077
docker run --rm mofugn1/istudio:latest setup > .env
```

`.env` 已包含随机数据库密码、随机后台管理员密码和默认端口。可在编辑器中按下表调整；不要把它提交到 Git。

```sh
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

打开 `http://localhost:8080`，后台为 `http://localhost:8080/admin/login`。管理员会在首次启动时自动创建，凭据取自根目录 `.env`，详见 [管理员说明](administrator.md)。

如果是服务器或局域网电脑，将 `localhost` 换成部署机器的 IP，并允许所选网站端口通过该机器的防火墙。

## 手工创建配置

也可复制根目录 `.env.example` 为 `.env`，用编辑器填写新的 `POSTGRES_PASSWORD` 和 `ADMIN_PASSWORD`，确认 `ADMIN_USERNAME` 后再启动。Windows PowerShell 用户可使用此方式；文件保存为 UTF-8。

| 字段                   | 作用                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `ISTUDIO_IMAGE`        | 应用镜像，默认 `mofugn1/istudio:latest`；也可固定已发布版本标签  |
| `WEB_PORT`             | 宿主机网站端口，默认 `8080`                                      |
| `BIND_ADDRESS`         | 默认 `0.0.0.0`；仅本机访问或由本机反向代理接入时可设 `127.0.0.1` |
| `POSTGRES_PASSWORD`    | 新数据库密码，首次初始化数据库时使用                             |
| `ADMIN_USERNAME`       | 后台管理员用户名，3–32 位小写字母、数字或下划线                  |
| `ADMIN_PASSWORD`       | 后台管理员密码；建议使用 12–128 位 ASCII 长密码，不含换行        |
| `INSTALL_INSPIRATION`  | 全新公共库是否导入内置内容，默认 `true`                          |
| `GENERATION_WORKERS`   | 生成 Worker 数量，默认 `2`                                       |
| `SITE_ENV`             | 默认 `preview` 阻止搜索收录，正式公开站点可设 `production`       |
| `NEXT_PUBLIC_SITE_URL` | 正式站点的 HTTPS 根地址，见 [域名与 SEO](seo.md)                 |

密码含 `$`、空格或 `#` 时，使用符合 Compose 规则的单引号值；自动生成的十六进制密码无需额外处理。

已有 PostgreSQL 数据卷初始化后，单独修改 `POSTGRES_PASSWORD` 不会修改数据库内的密码。日常管理员改密只调整 `ADMIN_PASSWORD`，不要顺带重设数据库密码。

## 不下载源码安装

也可以在新的空目录中从镜像导出 Compose：

```sh
umask 077
docker run --rm mofugn1/istudio:latest compose > compose.yml
docker run --rm mofugn1/istudio:latest setup > .env
docker compose up -d --wait --wait-timeout 180
```

管理员、数据和后续操作与 clone 安装一致。

## 从源码构建

根目录 Compose 使用 `image:`，不会因为增加 `--build` 就自动构建源码。先在仓库根目录构建应用镜像：

```sh
docker buildx build -f docker/image.Dockerfile -t istudio:local --load .
```

全新安装可继续执行：

```sh
umask 077
docker run --rm istudio:local setup istudio:local > .env
docker compose up -d --wait --wait-timeout 180
```

已有站点请保留原 `.env`，仅将 `ISTUDIO_IMAGE` 改为 `istudio:local`，再运行：

```sh
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 app
```

源码构建需要联网下载构建镜像和依赖；Docker 会在构建环境内编译前后端，无需宿主机安装语言工具链。

## 首次初始化

应用会自动执行数据库迁移，创建配置指定的管理员，并向全新公共库导入 798 条提示词和 798 张封面。账号、余额、个人作品和 AI 配置均属于当前安装，不从其他站点复制。

公共库只初始化一次。重启或更新镜像会保留管理员对条目的编辑、停用和删除；新版本增加的公共内容不会自动覆盖已有库。

## 下一步

- [登录并维护管理员](administrator.md)
- [配置 AI、模型、积分和网站](configuration.md)
- [备份、升级与常见问题](operations.md)
