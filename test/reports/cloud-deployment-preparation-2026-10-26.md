# 云部署准备与灵感库迁移包

日期：2026-10-26。用户确认云端全新初始化，保留本机灵感提示词及相关图片。

## 产物

- 独立生产栈：`docker/compose.production.yml`、`docker/Caddyfile`、`docker/.env.production.example`。
- 操作说明：`docs/cloud-deployment.md`；包含新密码生成、HTTPS、初始化、灵感包导入及后续更新步骤。
- 导出/校验/导入工具：`scripts/inspiration-bundle.py`。
- 本机迁移包：`test/artifacts/cloud-deployment-2026-10-26/inspiration-bundle.tar.gz`，252,024,385 字节（约 252 MB）。同目录提供 `.sha256` 校验文件、原始目录及 `bundle-summary.json`。

压缩包 SHA-256：`fadb63a15b75bfcdce812baeeee1a8dc38f50463905afae3252945d6faea1f8e`。

本机数据库只读快照为 697 条提示词、13 个分类，全部启用且都有封面；无云存储封面、无投稿外键条目。按图片内容去重后保留 690 张封面，总图片大小 252,490,604 字节。数据包只包含灵感库字段和实际引用的公开封面，未导出账号、密码哈希、积分、AI Key、个人提示词、作品或运行密钥。

## 验证

- 6 项 Python 测试通过，含真实隔离 PostgreSQL 导入测试。覆盖字段与特殊字符保留、重复图片、投稿封面独立化、缺图、越界/云路径与符号链接拒绝、哈希损坏及目标文件冲突。
- 实际 697 条记录在临时 PostgreSQL 17 的独立 schema 中连续导入两次，提示词全部字段逐项相等，13 个分类数量一致；预检回滚、冲突回滚及无关用户记录保留通过。测试 schema 和临时容器随后清理。
- 690 张封面均通过大小与 SHA-256 校验；压缩包另做 SHA-256，迁移时仍需在服务器重新执行离线校验。
- 生产及原有开发 Compose 的配置校验通过。生产栈缺少必填变量时会停止；仅 Caddy 发布入口端口，数据目录和数据库卷与开发栈分开。
- 官方 Caddy 镜像执行 `caddy validate` 通过。保留显式覆盖转发头的配置，校验器会提示该头与默认行为重复，不影响有效性。
- Web Docker 镜像 `istudio-web:cloud-preparation-test` 构建成功，包括 Next.js 编译、类型检查与页面构建。镜像仅用于验证，没有替换运行中的 Web。
- 20 项 SEO 回归通过；正式环境变量同时进入 Web 构建与运行配置，本地默认构建继续保持不收录。

## 部署边界

本地准备阶段未连接云服务器；后续在用户授权下完成了下方腾讯云内部部署。真实域名、TLS、公网登录、供应商连通性及完整备份恢复仍待验收，没有修改本机业务数据库或调用付费 AI。

迁移包位于 Git 忽略目录，不会随仓库克隆下载，需要单独传到云服务器。未来新增或修改灵感内容后，应重新只读导出新的迁移包。

## 腾讯云上传准备

用户补充服务器位于腾讯云后，曾生成源码快照 `test/artifacts/cloud-deployment-2026-10-26/i-studio-source.tar.gz`，共 703 个文件、11,507,864 字节，不包含运行环境文件、业务存储、依赖目录或 Git 元数据。SHA-256 为 `758595c0fc60d4d43f41bc8d75db595c02feaf941b0f450960938da79577422c`。此快照早于后续宝塔兼容与 standalone 修改，保留作历史产物，不作为最新部署源码。

源码包已解压到临时目录，并从该目录成功构建 API 镜像 `istudio-api:source-package-test`，验证后端源码与数据库迁移完整。

## 腾讯云实际部署与验收

用户授权通过已登录的宝塔面板操作服务器，并停用除 Go 项目外的旧项目。2026-10-26 已在 `/www/istudio` 部署独立 `i-studio-baota` 栈，使用 `docker/compose.baota.yml`，仅绑定 `127.0.0.1:33000`。当前域名未确定，没有新增公网入口。详细维护信息见 [宝塔部署记录](../../docs/baota-deployment.md)。

- 原有 `tools_server` 与 `new-api` 均确认是 Go 服务并保留运行。确认 tools_server 依赖 MySQL、Redis，均保留；原 Nginx、宝塔及系统服务保留。
- 六个旧 PHP/静态站点批量停用成功，PHP-FPM 70/72/80/81 全部停止并关闭开机启动，旧文件和数据库未删除。停止后可用内存约 903 MB，启动新栈验收时约 779 MB。
- amd64 API 和 standalone Web 本机构建成功后上传；首次 Alpine PostgreSQL 17 在旧 Linux 3.10 内核上初始化失败。换为官方 PostgreSQL 17 Bookworm 后成功，保持默认容器安全限制。前端 Node 文件工作线程检查也通过。
- Compose 启动等待退出码为 0；API、Web、PostgreSQL、Redis 四项健康检查通过，网关运行，入口仅回环端口。
- 服务器 Python 3.6 验证原始迁移包成功，导入预检回滚后实际提交成功。再次读取数据库与导出包比较，697 条提示词与 13 个分类全部字段相等。
- 从服务器回环网关访问全部 690 张封面，HTTP、文件大小与 SHA-256 全量一致。首页、静态 JavaScript、灵感分类和总数正确；robots 禁止收录，账号及后台私有接口返回 401。
- 前台用户、后台用户、AI 通道、作品、生成任务均为 0，确认全新业务初始化。管理员及 AI 服务尚未配置，没有真实出图验收。
- 验收时系统盘 40 GB，可用约 3.5 GB（91% 已用）。未删除旧项目、镜像或上传归档。

上传文件均在服务器重新核对 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| inspiration-bundle.tar.gz | fadb63a15b75bfcdce812baeeee1a8dc38f50463905afae3252945d6faea1f8e |
| istudio-baota-bootstrap.tar.gz（初始 Alpine 配置，服务器 Compose 后续已更新） | 0529e11f6c163e8c51417a50a09904402037147177925032ba98cfe56cf74105 |
| istudio-runtime-amd64.tar.gz（初始五镜像） | f24ec246715556ae0f48533111e00b7c64ef4eedb9655febe095a54f77838966 |
| istudio-postgres-bookworm-amd64.tar.gz（替换数据库镜像） | ed121e2dcbf57f9614a4d0ac96cab02e18f0b240fead033f0a5d6b1c4430534d |

当前仓库的宝塔 Compose 已同步使用 Bookworm 镜像；独立 `.env.baota` 加入 Git 忽略。Python 单元测试 5 项通过、1 项隔离数据库测试因未设置测试连接跳过；本次实际云数据库的逐字段、权限和 HTTP 全量验收另行通过。截图保留在 `test/artifacts/cloud-deployment-2026-10-26/`，服务器只读验收脚本和结果为 `verify-deployment.py`、`verification.log`。

## 子域名接入准备

用户后续选定 `istudio.mcode.fun`，服务器 DNS 查询返回 `81.68.99.87`，没有同名既有站点。现有六张 mcode.fun 子域名证书均只覆盖原域名，新子域名仍需申请证书。新 Nginx 配置和 Caddy 转发信任配置已暂存在 `/www/istudio/deploy/istudio-subdomain-20261026/`，没有启用。Nginx 采用现有证书文件占位进行单独语法检查，通过但未启动；Caddy 候选配置在本机和云服务器均通过 `validate`。实际专属证书、完整生产配置检查、HTTPS 浏览器验收和公网开放继续待办。

## 公网接入完成与现场修复

用户确认公网开放后，已在宝塔创建 `istudio.mcode.fun` 独立反向代理站点，免费 Let's Encrypt 证书签发并部署成功，有效期到 2027-01-24。HTTP 301 跳转 HTTPS，外网证书链校验通过。实际 Nginx 配置保留宝塔续签验证 include，完成完整语法检查与平滑重载；API 来源和 Caddy 宿主机代理信任配置已生效。

浏览器现场验收发现首页主图缺失，Next 图片处理请求为 502、原始 WebP 为 200；Docker events 确认 Web 容器触发 OOM。新增仅构建参数启用的 `NEXT_IMAGE_UNOPTIMIZED=1`，构建并部署 `istudio-web:cloud-unoptimized-amd64`。独立镜像内的 standalone 配置确认 unoptimized=true，其他环境默认不变。上传包 SHA-256 为 `2d2b373f89f687716249b7688298d7da9b202dd19a2516175dbcbfaa4bcf922d`，云端复核一致；镜像加载及更新等待退出码为 0。

最终公网验收：首页全部 13 张营销图片、静态脚本、前后台登录页返回 200；697 条提示词和 13 个分类正确，8 张灵感封面样本哈希一致（此前服务器内部已全量核对 690 张）。账号及后台私有接口返回 401，新 HTTPS Origin 允许，预览 robots 禁止收录。浏览器桌面视口确认首页主图、灵感广场封面与 697 条总数正常。Web 健康且 RestartCount=0；tools_server 仍运行。new-api 容器后续已由用户主动移除并获其明确确认，没有恢复。

最终资源快照：可用内存约 841 MB、系统盘可用约 4.4 GB。24 项 SEO / 营销素材回归、Next 镜像构建和配置格式检查通过。公网验证摘要为 `public-https-verification.json`，截图为 `public-https-homepage.png`、`public-https-inspiration.png`。管理员和 AI 通道未配置，未执行真实注册登录或付费出图，不等同于运营配置全部完成。
