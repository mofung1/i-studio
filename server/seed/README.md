# 内置灵感内容

新站分发以 [inspiration-catalog.json](inspiration-catalog.json) 为准，包含 798 条提示词、13 个分类及对应图片的字节数和 SHA-256。封面在 `server/storage/uploads/inspiration/`，随 Git 和应用镜像分发；来源许可说明见 [公共内容与许可](../../docs/assets.md)。

- `awesome-gpt-image-2/`：早期 549 条案例集合的来源说明和 MIT 许可副本。
- `handraw/`、`evolink/`：后续两个批次的来源版本、许可、条目和审核记录，以及维护导入工具。
- `handdraw-gallery.md`、`handdraw-categories.md`、`empty.md`：较早的 8 条手绘补充导入材料。当前新站安装不读取这些文件。

旧 Markdown 中的 `../data/images/` 和 `gallery-part-1.md#case-*` 是 `seed-inspiration` 解析器使用的历史输入格式，不是本仓库的浏览链接；相应资源现由完整清单管理。保留这些文件用于追溯早期条目，不建议新批次继续使用这一格式。`empty.md` 可用作旧导入命令第二个画廊参数的空输入。

新增公共内容需保留作者、来源版本、许可和图片校验值，并更新完整清单。公共库导出工具只允许公开字段和已审核的平面图片文件名；社区投稿需要先审查来源与再分发许可，再通过工具导出，不把运行数据目录直接加入 Git。
