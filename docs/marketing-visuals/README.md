# 官网展示素材

当前页面使用的图片通过两份清单维护，保留尺寸、字节数、来源散列与参考关系：

- [manifest.json](manifest.json)：官网及工具落地页的 14 项资源。
- [tool-showcase/manifest.json](tool-showcase/manifest.json)：五项工具展厅的 5 张预览图。
- [prompts.json](prompts.json)、[sources.json](sources.json)：提示词和来源台账。
- [comparison-2026-10-22.json](comparison-2026-10-22.json)：当前商品对比图的提示词与原图关系。
- [工具展厅说明](tool-showcase/README.md)：五项预览的用途。

正式资源保存在 `web/public/images/marketing/`。它们是 AI 概念作品或标明的产品截图，不代表用户案例或商品保真承诺。当前素材同时使用手作风 3D 与写实商品/时装图片；文件名中的 sunny、chromatic 是保留的素材批次名称。

首页主视觉为 `hero/coastal-creator-2x.webp`，商品对比使用同一护肤罐的基础摄影与场景编辑图。图片源数据和原始提示词可用于追溯，但历史原图目录不随 Git 分发。旧的方案图、归档清单及会覆盖当前资源的早期编码脚本已从项目移出，恢复方式见 [文件维护](../maintenance.md)。

调整素材时同时更新对应前端声明和清单，核对实际宽高、字节数及来源。运行 `pnpm -C web test` 检查清单与发布文件一致；通过实际浏览器核对首页、工具页和移动端显示。README 的页面截图独立保存在 `docs/images/screenshots/`。
