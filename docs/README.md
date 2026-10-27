# 文档目录

初次使用从 [项目 README](../README.md) 开始。部署、功能使用和维护说明按下表查找。

## 部署与开发

| 文档                                | 内容                                 |
| ----------------------------------- | ------------------------------------ |
| [Docker 镜像安装](docker-image.md)  | 无源码安装、更新、备份与双架构构建   |
| [系统架构](architecture.md)         | 部署图、模块职责、生图时序与数据边界 |
| [开发指南](development.md)          | 启动、代码约定、目录和检查命令       |
| [测试说明](../test/README.md)       | 自动测试、隔离数据库与镜像验收       |
| [云服务器部署](cloud-deployment.md) | 源码生产部署及公共灵感迁移           |
| [宝塔部署](baota-deployment.md)     | 现有 Nginx / 宝塔环境的部署与维护    |
| [项目文件维护](maintenance.md)      | 清理范围、归档恢复与文件保留规则     |

## 运营与配置

| 文档                                           | 内容                             |
| ---------------------------------------------- | -------------------------------- |
| [运营模式](hosted-platform.md)                 | 管理员、账号隔离、积分和上线配置 |
| [后台界面](admin-interface.md)                 | 后台导航、列表、表单与审核       |
| [AI 渠道配置](ai-channel-configuration.md)     | 服务、公开模型、能力与价格       |
| [多渠道架构](ai-multi-channel-architecture.md) | 模型与通道的分工及路由           |
| [系统提示词](prompt-configuration.md)          | 内置模板、用途和维护             |
| [成本与限额](platform-cost-controls.md)        | 并发、注册预算、存储与输出核验   |
| [任务监控](operational-monitoring.md)          | 积压、异常预留与存储失败         |
| [积分奖励](credit-rewards.md)                  | 注册赠送、签到和公告             |
| [存储与 CDN](object-storage.md)                | 多云配置、私有访问和下载         |
| [官网与 SEO](seo.md)                           | 页面、域名、收录开关与分享图     |

## 创作与界面

| 文档                                     | 内容                           |
| ---------------------------------------- | ------------------------------ |
| [创作工作区](creation-workspace.md)      | 素材、画布、预览与历史         |
| [首次创作引导](creation-onboarding.md)   | 模型建议和创作入口             |
| [逐张交付](generation-delivery.md)       | 参数约束、部分成功、结算与恢复 |
| [电商工具主页](commerce-bento.md)        | 主图、精修、复刻和服装工具入口 |
| [图片反推](image-to-prompt.md)           | 分析画面或风格并继续创作       |
| [资产管理](asset-management.md)          | 作品、素材、下载与文件目录     |
| [个人提示词](personal-prompts.md)        | 收藏、变量、版本和预设         |
| [图片对比](image-comparison.md)          | 并排、滑杆、缩放与原图对照     |
| [提示词投稿](inspiration-submissions.md) | 分享、审核、封面与奖励         |
| [意见反馈](feedback.md)                  | 提交和处理                     |
| [展示素材](marketing-visuals/README.md)  | 当前官网图片清单与来源         |
| [布局验收](ui-verification.md)           | 真实页面、多屏宽与弹窗验收     |
| [下拉控件](select-controls.md)           | 共享组件、主题和键盘操作       |

公共灵感来源、许可和导入分别见 [handraw-style](../server/seed/handraw/README.md) 与 [EvoLink](../server/seed/evolink/README.md)。当前行为以部署和功能文档为准；历史开发报告可从 Git 历史恢复。
