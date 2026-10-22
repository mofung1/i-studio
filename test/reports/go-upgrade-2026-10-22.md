# Go 1.27.3 项目与全局环境升级

日期：2026-10-22。用户要求将当前项目与本机全局 Go 环境升级到最新稳定版。已核对 [Go 官方下载列表](https://go.dev/dl/?mode=json)及[发布记录](https://go.dev/doc/devel/release)，本次目标为 2026-10-19 发布的 Go 1.27.3。

## 项目变更

- `server/go.mod`：语言版本由 `1.26.0` 升为 `1.27.0`，首选工具链由 `go1.26.9` 升为 `go1.27.3`。
- `docker/api.Dockerfile`：构建镜像改为 `golang:1.27.3-alpine`，运行阶段保持原配置。该标签及 amd64/arm64 支持已在 [Docker 官方镜像清单](https://raw.githubusercontent.com/docker-library/official-images/master/library/golang)核实。
- README 与开发指南同步更新。没有更改业务逻辑、依赖版本或 `go.sum`；历史检查报告继续保留当时的版本记录。

`go` 指令声明语言与最低版本要求，`toolchain` 选择首选编译器；两者含义见 [Go 工具链文档](https://go.dev/doc/toolchain)。项目实际测试及三种构建均使用 1.27.3。

## 本机全局环境

| 项目 | 原版本 | 升级结果 |
| --- | --- | --- |
| 默认 Go SDK | 1.25.0，`/usr/local/go` | Homebrew Go 1.27.3 |
| gofmt | 原 SDK 配套版本 | Go 1.27.3 配套版本 |
| gopls | v0.20.0 | v0.24.0，由 Go 1.27.3 构建 |
| Delve | v1.25.2 | v1.27.2，由 Go 1.27.3 构建 |
| staticcheck | v0.6.1 | 2026.2.2 / v0.8.2，由 Go 1.27.3 构建 |

通过现有 Homebrew 安装最新版 SDK。zsh 已有 Homebrew 环境接入；另修正 Bash 登录配置，让 Go 专用目录优先于旧系统安装。使用最小初始 PATH 启动新的 zsh 和 bash 登录终端，二者执行 `GOTOOLCHAIN=local go version` 均返回 `go1.27.3 darwin/arm64`，不是依靠项目自动下载工具链来显示新版。

现有 `GOPATH=/Users/mofung/Documents/project/golang`、`GOBIN`、模块代理及 `GOTOOLCHAIN=auto` 保持原设置。全局开发工具通过模块版本查询确认稳定版本后更新；官方模块代理连接超时时使用本机原配置的 goproxy.cn，安装保留模块校验。

按用户后续要求，已通过 macOS 原生管理员授权删除原系统 Go 1.25.0 SDK `/usr/local/go` 及旧系统 PATH 条目 `/etc/paths.d/go`。删除后已复查两处路径不存在，新的 zsh、bash 登录终端与当前项目均正常使用 Homebrew Go 1.27.3。其他项目与 Go 工具链缓存未清理；IDE 重启后可重新加载新版 Go 与工具。

恢复材料保留在本机：

- Bash 原配置：`/Users/mofung/.bash_profile.before-go127-1792654243.bak`，仅当前用户可读写。
- 原全局工具：`/Users/mofung/Documents/project/golang/bin/.before-go127-1792654425/`，目录仅当前用户可访问。

## 验证

| 检查 | 结果 |
| --- | --- |
| 新 zsh / bash 登录环境 | SDK 与 gofmt 均解析到新版；GOPATH、GOBIN 保留 |
| `go mod tidy -diff` | 通过，无依赖或校验文件变更 |
| `go mod verify` | 全部模块校验通过 |
| `GOTOOLCHAIN=local go test -race ./...` | 全部通过，studio 包约 89 秒；使用本轮新建独立 PostgreSQL，普通测试跳过真实付费 AI |
| `GOTOOLCHAIN=local go vet ./...` | 通过 |
| macOS arm64 构建 | 通过 |
| Linux amd64、arm64 的 `CGO_ENABLED=0` 构建 | 均通过，使用与 Dockerfile 一致的构建参数 |
| 二进制编译器版本 | `go version -m` 确认三种产物均由 Go 1.27.3 编译 |
| 新版 gopls 分析项目入口 | `gopls check cmd/server/main.go` 通过 |
| Go 格式及差异检查 | `gofmt -l cmd internal` 无输出，`git diff --check` 通过 |

机器可读版本验证见 [verification.json](../artifacts/go-upgrade-2026-10-22/verification.json)，保存在本机忽略目录。

Docker Hub 清单请求因网络连接超时未能完成，因此没有将本次 Linux 交叉编译视为完整的 Docker 多阶段构建验收，也没有替换运行中的业务容器。未迁移业务数据库，未发起付费 AI 请求；本轮专用测试数据库已清理。前端未修改，不重复执行无关前端回归。
