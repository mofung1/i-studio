# 官网展示素材

官网使用 AI 概念作品和标明的产品截图，不作为用户案例或商品保真承诺。正式图片位于 `web/public/images/marketing/`。

素材与来源信息：

- [官网图片清单](manifest.json)：尺寸、字节数、来源及引用关系。
- [来源信息](sources.json)。
- [工具展厅清单](tool-showcase/manifest.json) 与 [说明](tool-showcase/README.md)。

仓库保留正式图片、当前素材清单与来源台账。开发阶段的生成提示词、商品对比图制作记录已移入项目同级 `i-studio-develop/2026-10-28/project-cleanup/`，不参与构建和部署。清单中的 `original`、`source`、`archive` 及 `styleReference` 若指向 `test/artifacts/`，表示未随仓库发布的本地工作记录；全新 clone 后这些文件不存在。当前上线素材以两个 `manifest.json` 中的 `src` 为准，对应 `web/public/` 下的文件；原图校验值用于来源核对，不是可下载地址。

文档效果截图位于 `docs/images/screenshots/`，架构图位于 `docs/images/`。有关公共灵感与来源许可，见 [公共内容说明](../assets.md)。
