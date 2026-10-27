# 云服务器部署：新站与灵感库

本方案使用独立的 `docker/compose.production.yml`，与本地开发 Compose 分开运行。云端账号、积分、作品、AI 服务、模型定价和密钥全新初始化，仅迁移当前灵感库的分类、提示词和引用的封面图片。

当前腾讯云服务器已有宝塔 Nginx 和 Go 项目，实际采用 [宝塔共存部署](baota-deployment.md)，仅绑定服务器回环端口。下面的独立 HTTPS 栈用于能够独占入口端口的服务器。

## 部署前准备

服务器需要 Docker Engine、Docker Compose v2 或更新版，以及 Python 3.9+。域名解析到服务器，入口开放 TCP 80/443（可选 UDP 443 用于 HTTP/3），SSH 按部署者自己的访问策略配置。服务器还需能访问配置的 AI 供应商与镜像/依赖下载地址。

Caddy 对外提供 HTTPS，`/v1/` 保留路径转发给 Go API，其余请求交给 Next.js。API、Web、PostgreSQL 和 Redis 不发布宿主机端口。Caddy 覆盖传入的 `X-Forwarded-For`，API 只信任配置的专用代理网段；若前面再加 CDN，应单独调整可信代理配置。

本地图片和新生成的签名、配置加密密钥位于云服务器的 `docker/data/uploads/`。数据库、Redis 和 Caddy 证书使用 `i-studio-production` 项目下的命名卷。不读取本地的 `server/.env` 或 `server/storage/uploads`。

## 1. 在本机导出灵感库

从项目根目录执行，源 PostgreSQL 服务需要已启动。命令只读查询灵感库，不调用 AI、不修改原数据库或图片：

```sh
python3 scripts/inspiration-bundle.py export \
  --output test/artifacts/cloud-deployment-2026-10-26/inspiration-bundle

python3 scripts/inspiration-bundle.py verify \
  --bundle test/artifacts/cloud-deployment-2026-10-26/inspiration-bundle

tar -czf test/artifacts/cloud-deployment-2026-10-26/inspiration-bundle.tar.gz \
  -C test/artifacts/cloud-deployment-2026-10-26 inspiration-bundle
```

导出目录必须是新目录。数据包包含 `manifest.json` 及它引用的封面，记录 SHA-256、文件大小、原文、来源、排序、启用状态、图片尺寸、使用说明和是否需要参考图。不复制用户、作品、积分、AI 配置、投稿审核或奖励记录。

已发布投稿会作为独立灵感条目保留，封面改用新的公开灵感路径，解除原账号和投稿外键依赖；未进入灵感库的私人提示词和待审投稿不在导出范围。多条提示词共用相同封面时按内容去重。当前工具支持源本地封面；遇到云存储引用或缺图会停止，不跳过记录。

将**已提交的项目源码**与这个压缩包传到云服务器。数据包在 Git 忽略目录内，不会随 `git clone` 下载；不要打包整个本机运行存储或环境文件。

## 2. 在云服务器生成独立配置

进入服务器上的项目根目录。以下命令从示例创建配置，并将两个新随机密码直接写入文件，不覆盖已有配置：

```sh
python3 - <<'PY'
from pathlib import Path
import os
import secrets

template = Path('docker/.env.production.example').read_text()
template = template.replace('POSTGRES_PASSWORD=\n', 'POSTGRES_PASSWORD=' + secrets.token_hex(32) + '\n')
template = template.replace('ADMIN_PASSWORD=\n', 'ADMIN_PASSWORD=' + secrets.token_hex(24) + '\n')
with open('docker/.env.production', 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
    output.write(template)
PY
```

用服务器编辑器打开 `docker/.env.production`，填写 `APP_DOMAIN` 和 `ADMIN_USERNAME`。域名只写主机名，例如 `studio.你的域名`，不要写协议、端口或路径。后台密码已生成，可在此文件中查看并妥善保存。数据库密码使用随机十六进制，避免 URI 转义和 Compose 插值问题。

先保留 `SITE_ENV=preview`，验收期间不开放搜索收录。若默认 `PROXY_SUBNET=172.29.240.0/24` 与服务器已有网络冲突，改成一个未使用的私有网段；同一变量同时控制代理网络和 API 的信任范围。

## 3. 构建与启动

```sh
docker compose --env-file docker/.env.production \
  -f docker/compose.production.yml config --quiet

docker compose --env-file docker/.env.production \
  -f docker/compose.production.yml up -d --build --wait --wait-timeout 180

docker compose --env-file docker/.env.production \
  -f docker/compose.production.yml ps

docker compose --env-file docker/.env.production \
  -f docker/compose.production.yml logs --tail 100 api web caddy
```

新数据库由 API 自动执行迁移，后台管理员由生产配置创建。数据库健康检查不等于公网验收；域名正确解析且 80/443 可达后，Caddy 才能提供公开 HTTPS。访问 `https://你的域名/admin/login`，用新管理员账号登录。

浏览器 API 地址与正式站点 URL 同为 `https://APP_DOMAIN`，内部服务端 API 地址为 `http://api:4000`。域名或收录环境改变后，重新构建 Web；单纯 `restart` 不会更新已构建的浏览器配置或容器环境。

## 4. 导入灵感库

在服务器解压自己导出的数据包，先进行离线校验和事务预检：

```sh
tar -xzf inspiration-bundle.tar.gz

python3 scripts/inspiration-bundle.py verify --bundle inspiration-bundle

python3 scripts/inspiration-bundle.py import \
  --bundle inspiration-bundle \
  --storage-root docker/data/uploads \
  --compose-file docker/compose.production.yml \
  --env-file docker/.env.production
```

预检的数据库操作会回滚，不复制图片。确认数量正确后导入：

```sh
python3 scripts/inspiration-bundle.py import \
  --bundle inspiration-bundle \
  --storage-root docker/data/uploads \
  --compose-file docker/compose.production.yml \
  --env-file docker/.env.production \
  --apply
```

若图片目录由容器的 root 用户创建，上述导入命令需使用有权写入该目录的系统账号，例如 `sudo python3 ...`。导入仅写入 `inspiration_categories`、`inspiration_prompts` 和公开灵感封面目录。相同数据包可重复执行；遇到同编号不同内容、分类名称冲突或不同内容的同名文件时停止，不覆盖。所有数据库写入在一个事务中完成；若提交失败，已复制的封面可在重试时复用。

## 5. 配置并验收

先在后台配置注册、积分赠送和平台额度，再重新添加 AI 服务、上架模型与设置价格；图片识别需要 Prompt AI 本身支持 Vision 并启用相应能力。云端使用最新版默认系统提示词，包含带图 AI 优化策略；本机自定义系统提示词不在迁移范围。

确认灵感列表数量、分类、正文、启用状态和多张封面可访问，再检查前后台独立登录、模型加载、素材上传、下载与积分流程。真实生图或优化验证会产生供应商用量，按选定模型的小额预算执行。

准备开放搜索收录时，将 `SITE_ENV` 改为 `production` 并重建 Web，再用真实域名验证 `robots.txt`、`sitemap.xml`、canonical 和分享图。具体检查见 [SEO 文档](seo.md)。

## 更新与备份

更新源码后，沿用同一份生产环境文件和 Compose 项目：

```sh
docker compose --env-file docker/.env.production \
  -f docker/compose.production.yml up -d --build --wait --wait-timeout 180
```

正常停止保留卷；不要使用 `down -v` 删除生产数据。稳定运行后，需要备份生产 PostgreSQL、整个 `docker/data/uploads/`（包括隐藏密钥文件）、生产环境文件和已使用的云桶，并保留 Caddy 证书卷。灵感导出包不替代完整生产备份。首次更改 PostgreSQL 密码需同步数据库角色密码，不能只修改环境文件。

本地配置准备与导入测试不能替代真实服务器、域名、TLS、公网浏览器和备份恢复验收。

参考：[Docker 单机生产部署](https://docs.docker.com/compose/how-tos/production/)、[Compose 环境变量](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)、[Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https)、[Caddy 反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。
