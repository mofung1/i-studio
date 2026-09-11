# 005 账号密码登录

> 日期：2026-09-09  
> 状态：已完成

## 产品决策

- MVP 不支持游客模式。
- 首发仅支持账号密码登录。
- 手机号、邮箱验证码、微信及其他第三方登录放到 MVP 之后。

## 实现内容

- 新增 `POST /v1/auth/register` 注册接口。
- 新增 `POST /v1/auth/login` 登录接口。
- 新增 `GET /v1/auth/me` 会话检查接口。
- 使用 Node `scrypt` 哈希密码，使用 HMAC 签名短期 JWT 会话。
- 新增 `/login` 登录/注册页面。
- 工作台检测本地会话，无登录状态自动跳转登录页。
- 顶部账户入口跳转登录页。
- Prisma `User` 模型新增 `username` 与 `passwordHash` 字段。

## 验证结果

- `pnpm build` 通过，新增 `/login` 路由。
- `pnpm test` 通过。
- 未调用 AI 接口，不需要 API Key。

## 限制与下一步

- 当前 AuthService 使用内存 Map，服务重启会丢失账号；待 Prisma 环境可用后切换为 PostgreSQL Repository。
- 当前 JWT 使用开发默认密钥，部署前必须通过 `AUTH_JWT_SECRET` 配置高强度密钥，并增加 refresh/revocation 策略。
