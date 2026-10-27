# 更新、备份与恢复

以下命令在部署目录执行，使用根目录 `compose.yml`。示例备份命令适用于 Linux / macOS shell。

## 数据保存位置

| 内容                                           | 位置              |
| ---------------------------------------------- | ----------------- |
| 镜像名、端口、数据库密码、环境管理的管理员凭据 | 根目录 `.env`     |
| 账号、积分、AI 配置、提示词、任务和资产索引    | PostgreSQL 命名卷 |
| 上传、生成图片、公共封面、签名和配置加密密钥   | uploads 命名卷    |
| 任务调度与处理中队列                           | Redis 命名卷      |

Docker 命名卷独立于容器。普通 `docker compose down` 保留卷；`down -v` 会删除数据卷。使用云存储时还需要独立保护和备份云桶。

Compose 项目名决定命名卷归属。不要随意更改 `compose.yml` 的项目名或启动时的 `-p` 参数，否则可能连接到一组空卷。

## 更新

使用已发布镜像：

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 180
```

需要固定版本时，在 `.env` 的 `ISTUDIO_IMAGE` 中使用 Docker Hub 已发布的版本标签。更新前备份；旧应用不保证兼容新迁移后的数据库。

源码构建部署时，先保存自己的代码修改并更新源码，再执行：

```sh
docker buildx build -f docker/image.Dockerfile -t istudio:local --load .
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 app
```

保留原 `.env`，其中 `ISTUDIO_IMAGE` 应为 `istudio:local`。更新时不重新执行 `setup > .env`。

## 备份

至少备份配置、数据库和 uploads。先等待进行中的任务结束，暂停应用写入，再执行：

```sh
umask 077
ISTUDIO_BACKUP_DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ISTUDIO_BACKUP_DIR"

docker compose stop app
docker compose exec -T postgres pg_dump -U istudio -d istudio -Fc > "$ISTUDIO_BACKUP_DIR/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar app -czf - -C /data/uploads . > "$ISTUDIO_BACKUP_DIR/uploads.tar.gz"
cp .env compose.yml "$ISTUDIO_BACKUP_DIR/"
docker compose start app
```

逐条确认命令成功。若中途失败，先启动 `app` 恢复服务，再处理备份错误。备份含管理员凭据、私人数据和应用密钥，应保存到自己控制且限制访问的位置，不提交 Git。

仅备份数据库不足以恢复图片，也不足以解密已有 AI / 云存储密钥。uploads 中的隐藏密钥目录必须一起保存。使用云存储时，以上归档不包含云桶内的图片，需要使用云平台的备份方式。

## 恢复到新电脑

恢复流程适用于新的安装目录和空数据卷，先保留目标机器上已有数据的独立备份。

1. 安装 Docker，准备备份目录中的 `.env`、`compose.yml`、`database.dump` 和 `uploads.tar.gz`。
2. 将原 `.env` 和 `compose.yml` 复制到新的部署目录，保留数据库密码与管理员配置。
3. 将下方变量替换为实际备份目录，然后恢复：

```sh
ISTUDIO_BACKUP_DIR=/path/to/your-backup

docker compose up -d --wait --wait-timeout 180 postgres redis
docker compose exec -T postgres pg_restore -U istudio -d istudio --clean --if-exists --no-owner < "$ISTUDIO_BACKUP_DIR/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar app -xzf - -C /data/uploads < "$ISTUDIO_BACKUP_DIR/uploads.tar.gz"
docker compose up -d --wait --wait-timeout 180
```

首次在新电脑运行时，应能拉取 `.env` 指定的镜像；如果使用本地自建的 `istudio:local`，需先在新电脑构建或导入同一版本的镜像。

恢复后核对管理员登录、公共封面及个人作品。换域名或端口时，只修改相应的地址字段；不要重新生成数据库密码或删除密钥。

## 常见问题

### 提示缺少 ADMIN_PASSWORD 或 POSTGRES_PASSWORD

确认根目录存在 `.env`，并填写两个密码。不要把 `.env.example` 原样留空启动。首次安装可用镜像的 `setup` 命令生成。

### 管理员登录失败

确认使用 `/admin/login` 和根 `.env` 的凭据。修改密码后重新创建 `app`；仅 `restart` 不加载新环境变量。详见 [管理员设置](administrator.md)。

### 登录后台后前台仍需要登录

前后台账号和会话独立。到前台注册普通用户，并通过注册赠送或后台调账提供积分。

### 已添加 AI 服务但没有可选模型

还需创建公开模型，绑定有效渠道和上游模型 ID、设置主渠道与能力，并上架。见 [首次配置](configuration.md)。

### 容器启动后没有旧数据

核对 Compose 项目名、数据卷和部署目录，检查是否误用了其他 Compose 文件。保留旧卷，确认实际使用的数据库和 uploads；不要反复初始化或执行 `down -v`。

### 修改数据库密码后无法启动

已有 PostgreSQL 卷不会因修改环境变量而自动改密。恢复原 `POSTGRES_PASSWORD` 后重建应用；需要轮换数据库密码时，同时更新数据库角色和安装配置。

### 端口被占用

在 `.env` 修改 `WEB_PORT`，再执行 `docker compose up -d`，并使用新端口访问。

### 启动或生成失败如何查看信息

```sh
docker compose ps
docker compose logs --tail 100 app
```

分享排障信息时遮盖密钥、令牌和私人内容。镜像下载、供应商网络和实际模型权限由部署环境决定。
