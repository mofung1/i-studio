# 域名与 SEO

本指南配合根目录 `compose.yml` 使用。网站默认可通过 `http://服务器IP:8080` 访问；公开网站建议使用自己的域名和 HTTPS 反向代理。

## 接入域名

1. 将域名解析到部署服务器。
2. 在 Nginx、Caddy 或服务器面板中配置该域名的 HTTPS 站点。
3. 将请求转发到应用的宿主机端口，例如 `http://127.0.0.1:8080`。
4. 代理应允许图片上传，并设置能覆盖图片生成等待时间的超时；可按 32 MB 上传上限与 650 秒读取超时配置。
5. 如果仅由同机代理访问，在根 `.env` 设置 `BIND_ADDRESS=127.0.0.1`，重新创建应用容器。

不要将 PostgreSQL 或 Redis 的端口发布到公网。可信代理及转发头应按实际代理网络配置，不直接信任客户端提交的转发头。

## 开启搜索收录

默认 `SITE_ENV=preview`，允许正常使用站点，但阻止搜索引擎收录。公开上线并准备好真实 HTTPS 域名后，在根 `.env` 设置：

- `SITE_ENV=production`。
- `NEXT_PUBLIC_SITE_URL`：自己的 HTTPS 根地址，例如 `https://studio.yourdomain.com`，必须换成实际域名。

地址应不含路径、查询、账号密码或端口；本地、私网和保留示例域名不会用于正式收录地址。

```sh
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 app
```

然后核对：

- `/robots.txt` 与 `/sitemap.xml` 使用预期的收录策略和域名。
- 首页及工具页的 canonical、分享图地址使用真实 HTTPS 域名。
- 首页、登录、公共灵感和图片请求均可正常访问。

前台私人页面和运营后台保持禁止收录。网站名称、Logo 等品牌内容在后台“网站配置”维护。HTTPS 证书续期、DNS 和搜索引擎实际收录由部署环境和站点运营者维护。
