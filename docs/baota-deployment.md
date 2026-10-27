# 腾讯云宝塔部署记录

2026-10-26 已完成公网接入，地址为 **https://istudio.mcode.fun**。项目位于服务器 `/www/istudio`，Compose 项目名为 `i-studio-baota`，配置为 `docker/compose.baota.yml`，专用环境文件为 `docker/.env.baota`（权限 600，不提交）。宝塔 Nginx 对外提供 HTTPS，容器网关仍只发布 `127.0.0.1:33000`。管理员和 AI 服务尚未初始化，因此当前可以浏览灵感库，不能完成真实 AI 出图。

## 已验证的状态

- API、Web、PostgreSQL、Redis 的健康检查通过，Caddy 网关正常运行；首页、静态脚本和灵感 API 返回成功，账号与后台私有接口未登录返回 401。预览环境禁止搜索收录。
- 697 条灵感提示词和 13 个分类与导出包逐字段相等；690 张封面全部通过 HTTP 200、大小和 SHA-256 校验。原始包保留在服务器 `inspiration-bundle/` 和 `incoming/`。
- 前台账号、后台账号、AI 通道、作品和生成任务数量均为 0。没有复制本机账号、积分、AI 密钥或私有作品，没有调用付费 AI。
- 按用户授权停用 `www.mcode.fun`、`dj.mcode.fun`、`image.mcode.fun`、`fc.mcode.fun`、`oa.mcode.store`、`blog.mcode.store` 六个旧站；PHP-FPM 70/72/80/81 已停止并关闭开机启动。原文件和数据库保留。
- 原 Go 项目 `tools_server` 保持运行；MySQL、原 Redis、Nginx、宝塔和系统服务保留。`tools_server` 的依赖包含 MySQL 和 Redis，不能随 PHP 一起停止。`new-api` 在内部试运行时仍运行，后续检查发现已不存在，用户明确确认由其主动移除；没有重建。

## 服务器与兼容配置

实测为 CentOS 7、Linux 3.10、amd64、2 核、1837 MB 内存，Docker 24.0.7、Compose 2.21.0、Python 3.6.8。应用镜像在本机准备为 amd64，服务器不编译前端；Web 采用 Next.js standalone，API 使用原生 Go 交叉编译。迁移脚本已兼容服务器 Python 3.6。

初次 PostgreSQL Alpine 镜像初始化报 `postmaster.pid` / WAL 文件写入 `Operation not permitted`，且未发生 OOM。停止失败重试后，改用官方 `postgres:17-bookworm` 派生的 `istudio-postgres:17-bookworm-amd64`，沿用原专用卷和密码即成功。没有禁用 seccomp、添加特权或修改宿主机内核。服务器另保留 `docker/compose.baota.alpine-backup.yml` 供排查，日常操作使用当前配置。

新栈设置单个生成 worker 和各服务内存上限，适合当前共享小主机的低并发试运行。最终验收时内存可用约 841 MB；40 GB 系统盘可用约 4.4 GB（89% 已用）。持续生成图片前需安排存储容量和备份。

公网浏览器验收发现 Next.js 实时图片转换触发前端容器 OOM，首页主图返回 502。已增加可选构建参数 `NEXT_IMAGE_UNOPTIMIZED=1`，本服务器镜像为 `istudio-web:cloud-unoptimized-amd64`，直接提供已压缩的 WebP。其他环境默认保留实时优化行为。该参数在构建时生效；只修改容器环境后重启不能改变已构建的前端。

该前端的本机构建命令为：

```sh
docker buildx build --platform linux/amd64 --load \
  -t istudio-web:cloud-unoptimized-amd64 \
  --build-arg NEXT_PUBLIC_API_BASE_URL= \
  --build-arg NEXT_PUBLIC_SITE_URL=https://istudio.mcode.fun \
  --build-arg SITE_ENV=preview --build-arg NEXT_IMAGE_UNOPTIMIZED=1 \
  -f docker/web.Dockerfile .
```

修复镜像上传归档为 `incoming/istudio-web-low-memory-amd64.tar.gz`，SHA-256 为 `2d2b373f89f687716249b7688298d7da9b202dd19a2516175dbcbfaa4bcf922d`。部署后首页全部 13 张营销图片公网返回 200，浏览器主图恢复正常，Web 健康且重启次数为 0。

## 日常检查与重启

在宝塔终端执行，环境文件中的密码无需打印：

```sh
cd /www/istudio
docker compose --env-file docker/.env.baota -f docker/compose.baota.yml ps
docker compose --env-file docker/.env.baota -f docker/compose.baota.yml logs --tail 50 api web
curl -fsS http://127.0.0.1:33000/v1/health
```

普通重启使用 `restart`；修改环境变量或 Compose 后使用 `up -d --no-build --wait --wait-timeout 180` 重建相关容器。无需停止原 Go 服务。数据库使用独立命名卷，上传目录挂载在 `docker/data/uploads`；保留其中的 `.auth` 等应用密钥目录。

服务器 `verify-deployment.py` 是本次只读验收脚本，核对全部灵感记录、690 张封面和路由，结果保存在 `verification.log`。需要复核时在项目目录运行 `python3 verify-deployment.py`。

## 管理员、AI 服务与公网接入

管理员尚未创建。部署者可在服务器项目目录运行以下命令，并亲自按终端提示输入自己的强密码：

```sh
docker compose --env-file docker/.env.baota -f docker/compose.baota.yml \
  exec api istudio-server admin --username YOUR_ADMIN_NAME
```

指定域名为 `istudio.mcode.fun`，2026-10-26 实测解析到 `81.68.99.87`。用户明确确认申请证书并开放公网后，已在宝塔「反向代理」创建独立站点，申请并部署该域名的免费 Let's Encrypt 证书，有效期到 **2027-01-24**。HTTP 自动 301 跳转 HTTPS，外网 TLS 证书链校验通过。

实际站点配置是 `/www/server/panel/vhost/nginx/istudio.mcode.fun.conf`，保留宝塔生成的证书续签验证 include 和管理标记，仅调整上传大小 32 MB、长请求超时 650 秒、关闭代理缓存和响应缓冲以及转发头。完整 Nginx 配置校验成功后已平滑重载。`.env.baota` 中 `APP_ORIGIN=https://istudio.mcode.fun` 已生效，API 和网关更新等待退出码为 0。原 `image.mcode.fun` 保持停用。

服务器 `/www/istudio/deploy/istudio-subdomain-20261026/` 保留接入前备份和候选文件；含独立环境备份，继续限制访问。`syntax-only-*` 文件仅用于早期语法检查，不能作为实际站点启用。仓库 `docker/nginx.baota.conf.example` 是手动配置参考；不要直接覆盖宝塔现有配置而丢失续签 include。

Nginx 在公网边缘覆盖 Host、HTTPS 协议及客户端 IP 转发头，Caddy 仅信任宿主机桥接网关 `172.29.241.1/32`。对应变量为网关服务的 `BAOTA_PROXY_IP`，更改 Compose 代理网段时也应核对并更新此值。[Caddy 官方文档](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults) 说明，默认会忽略传入的转发头，需显式信任前置代理；候选配置同时启用严格地址解析。数据库、Redis 和容器管理端口不发布公网。

当前镜像按预览环境构建，robots 继续禁止收录。已验证 HTTPS 首页、静态脚本、登录页、后台登录页、灵感 API 和图片；私有接口未登录返回 401，新 HTTPS 来源的 CORS 检查通过。浏览器桌面视口中首页主图和灵感广场封面、697 条总数均显示正常。

通过 HTTPS 登录 `/admin/login` 后仍需配置新的 AI 通道和模型；不要导入本机密钥。管理员初始化后的完整登录、真实注册与付费出图尚未验收。正式开启 SEO 时，按 [云部署说明](cloud-deployment.md) 和 [SEO 说明](seo.md) 重建并复核 canonical、robots、sitemap 和分享图。

备份应包括 PostgreSQL 导出、`docker/data/uploads` 的全部内容以及专用环境文件，存放到部署者控制且限制访问的备份位置。现有上传归档和旧项目数据没有删除。

需要恢复旧 PHP 服务时，在宝塔重新启用对应网站，再仅启动其使用的 PHP-FPM 版本；恢复前可查看服务器 `/www/istudio/resource-before.txt` 中记录的原启动配置。
