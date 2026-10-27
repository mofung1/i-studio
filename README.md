# iStudio

面向个人创作者与电商团队的 AI 图片创作平台。支持文字生图、参考图创作、商品图制作、图片反推、资产管理和提示词灵感库，提供独立的运营后台。

[安装部署](docs/docker-image.md) · [设置管理员](docs/administrator.md) · [配置 AI 服务](docs/configuration.md) · [使用指南](docs/usage.md) · [文档目录](docs/README.md)

## 功能

| 模块        | 功能                                                               |
| ----------- | ------------------------------------------------------------------ |
| AI 图片创作 | 文字描述、参考图、模型选择、画幅与清晰度、生成进度和下载           |
| 电商工具    | 商品主图、详情素材、爆款复刻、产品精修、服装组图和模特上身         |
| 图片反推    | 提取画面或风格提示词，并带入下一次创作                             |
| 个人资源    | 私有素材、生成作品、图片对比、提示词收藏、变量和创作预设           |
| 公共灵感库  | 内置 798 条提示词、13 个分类、798 张封面，支持搜索、复制和投稿审核 |
| 运营后台    | 独立管理员、AI 渠道与模型、定价、积分、用户、网站品牌和任务监控    |
| 图片存储    | 本地持久卷，以及 OSS、Kodo、COS、S3 / MinIO 与 CDN                 |

## 快速部署

准备一台安装了 **Docker 和 Docker Compose v2 或更新版本**的电脑或服务器。支持 Linux amd64 / arm64，以及运行 Linux 容器的 Docker Desktop；使用已发布镜像时无需安装 Go、Node.js 或配置 GPU。

### 1. 获取代码

```sh
git clone https://github.com/mofung1/i-studio.git
cd i-studio
```

以下命令均在仓库根目录执行，使用根目录的 `compose.yml`。

### 2. 生成首次安装配置

仅首次安装执行，已有 `.env` 请保留：

```sh
umask 077
docker run --rm mofugn1/istudio:latest setup > .env
```

该命令生成独立的数据库密码和管理员密码。使用编辑器打开 `.env`：

- `ADMIN_USERNAME`：后台管理员用户名，默认 `admin`。
- `ADMIN_PASSWORD`：随机生成的后台密码，可在启动前修改。
- `WEB_PORT`：网站端口，默认 `8080`。

Windows PowerShell 或希望手工配置的用户，可复制 `.env.example` 为 `.env`，填写 `POSTGRES_PASSWORD`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`，保存为 UTF-8 后继续。详细字段见 [安装说明](docs/docker-image.md)。

### 3. 启动

```sh
docker compose up -d --wait --wait-timeout 180
```

首次拉取镜像和初始化可能需要几分钟。应用会自动迁移数据库、导入公共灵感库，并根据 `.env` 创建后台管理员。

| 入口                | 地址                                                        |
| ------------------- | ----------------------------------------------------------- |
| 网站                | <http://localhost:8080>                                     |
| 管理员登录          | <http://localhost:8080/admin/login>                         |
| 普通用户注册 / 登录 | <http://localhost:8080/login>，点击“没有账号？创建账号”注册 |

在其他设备访问时，将 `localhost` 换成部署机器的 IP；如修改端口，使用 `WEB_PORT` 对应的值。

### 4. 登录后台并配置 AI

用 `.env` 中的管理员用户名和密码登录后台。**没有通用默认密码；前台注册不会成为管理员。**

依次完成：

1. **AI 服务**：添加生图渠道，填写供应商地址、协议和 API Key。
2. **模型与定价**：添加模型，绑定渠道及上游模型 ID，设为主渠道，设置能力和价格后上架。
3. **运营设置**：按需开启注册、设置积分赠送、并发和存储限额。
4. 到前台注册普通用户，并为其提供可用积分，再开始创作。

服务商提供的有效 API Key 是生图必需条件，镜像不包含供应商账号或密钥。配置步骤见 [首次配置](docs/configuration.md)，管理员改名、改密和找回访问见 [管理员说明](docs/administrator.md)。

## 从源码构建部署

希望部署自己修改的代码时，在 clone 后使用同一份 Compose 配置。全新安装执行：

```sh
docker buildx build -f docker/image.Dockerfile -t istudio:local --load .
docker run --rm istudio:local setup istudio:local > .env
docker compose up -d --wait --wait-timeout 180
```

已有部署请保留 `.env` 和数据卷，只将 `ISTUDIO_IMAGE` 改为 `istudio:local`，重新构建后更新容器。具体步骤见 [源码构建](docs/docker-image.md#从源码构建)。

## 项目效果

**官网首页**

![iStudio 官网首页](docs/images/screenshots/home.png)

**创作工作台**

![创作设置与生成结果](web/public/images/marketing/workbench/workbench-creation-2026-10.webp)

**电商工具**

![商品图、精修、复刻与服装工具](docs/images/screenshots/commerce.png)

**公共灵感库**

![公共提示词与分类浏览](docs/images/screenshots/inspiration.png)

截图展示实际界面。官网中的展示作品为 AI 概念示例，灵感库封面保留各自来源说明。

## 架构与技术

![iStudio 系统架构](docs/images/architecture.svg)

前端使用 Next.js 15、React 19 和 TypeScript，后端使用 Go / Gin，数据保存到 PostgreSQL，任务由 Redis 调度。应用镜像包含同源访问网关、前端、API 与 Worker，数据库和 Redis 由 Compose 启动。详见 [系统架构](docs/architecture.md)。

## 更新与数据

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 180
```

更新前请 [备份配置、数据库和图片](docs/operations.md#备份)。`.env`、数据库卷和 uploads 卷共同组成站点数据；普通 `docker compose down` 保留数据，`down -v` 会删除数据卷。

## 文档

- [安装部署：镜像、源码与配置字段](docs/docker-image.md)
- [管理员：创建、改密、账号区别](docs/administrator.md)
- [首次配置：渠道、模型、积分与网站](docs/configuration.md)
- [用户使用指南](docs/usage.md)
- [更新、备份、恢复与常见问题](docs/operations.md)
- [对象存储与 CDN](docs/object-storage.md)
- [域名与 SEO](docs/seo.md)
- [公共内容与来源许可](docs/assets.md)
- [本地开发与测试](docs/development.md)
- [贡献指南](CONTRIBUTING.md)

## 许可证与致谢

项目原创代码采用 [MIT 许可证](LICENSE)，版权声明为 Copyright (c) 2026 mofung1。

公共提示词及图片保留各自来源的许可与署名，感谢以下项目：

- [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2)：早期 549 条案例集合，附 [MIT 许可副本](server/seed/awesome-gpt-image-2/LICENSE) 与 [来源说明](server/seed/awesome-gpt-image-2/README.md)。
- [yang0/handraw-style](https://github.com/yang0/handraw-style)：101 条风格提示词批次，附 [许可副本](server/seed/handraw/LICENSE)。
- [EvoLink 图片提示词](https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts)：148 条提示词批次，附 [CC0-1.0 许可副本](server/seed/evolink/LICENSE)。

详细适用范围见 [公共内容与来源许可](docs/assets.md)，项目整理进度见 [仓库检查记录](docs/open-source-audit.md)。
