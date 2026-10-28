# EvoLink 内容来源

来源：[Evolink-AI/awesome-gpt-image-2-API-Prompts](https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts)，固定版本 `e2a269ad1a055a0b4f6c1e170341c6c1aba30faa`。来源项目声明 CC0-1.0，许可副本见 [LICENSE](LICENSE)，条目保留作者和来源。

本批提供 148 条提示词：140 条使用来源仓库示例图，另 8 条使用本站生成的原始 PNG。来源示例不代表本站模型实测结果；需要参考图的使用前提保留在提示词中。

## 文件

- `2026-10-25.json`：140 条来源示例图记录。
- `2026-10-25-generated.json`：8 条本站生成示例，含提示词及生成来源信息。
- `review-decisions-2026-10-25.json`：来源筛选及对应关系。
- `import.py`：条目与图片校验、导入 SQL 生成工具。
- 公共图片在 `server/storage/uploads/inspiration/library/`，随 Git 分发。

新站按根目录 Compose 部署后自动初始化完整公共库，无需手工导入本批。导入工具只插入缺失 ID，不覆盖已有条目；默认生成回滚预演 SQL。来源图片按固定版本和校验值处理，本站生成 PNG 缺失时需从 Git 或备份恢复，不会自动收费重生成。

部署和管理员设置见 [安装说明](../../../docs/docker-image.md)，完整公共库说明见 [公共内容与许可](../../../docs/assets.md)。
