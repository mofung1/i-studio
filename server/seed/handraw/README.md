# handraw-style 内容来源

来源：[yang0/handraw-style](https://github.com/yang0/handraw-style)，作者为 **yang0**，来源版本固定为 `f7c39649fe70a667069fdbe5eb60df0a1bca4f24`。按上游 MIT 许可证保留署名，完整许可见 [LICENSE](LICENSE)，每条公开记录保留作者与来源仓库。

本批提供 101 条风格提示词，使用现有分类：插画艺术 84 条、摄影写实 16 条、人物角色 1 条。正文为风格段，使用时补充自己的主体、场景和文字要求。

配图共 101 张：100 张为上游风格示例，FC-030 使用本站生成的 2048×2048 原始 PNG。上游示例不是本站模型的实测结果；具体封面来源、原始提示词和校验值保存在数据清单。

## 文件

- `2026-10-27.json`：可导入条目、正文、来源、封面与校验值。
- `review-decisions-2026-10-27.json`：来源筛选及对应关系。
- `import.py`：条目和图片校验、导入 SQL 生成工具。
- 公共图片在 `server/storage/uploads/inspiration/library/`，随 Git 分发。

新站按根目录 Compose 部署后自动初始化完整公共库，无需手工导入本批。导入工具仅插入缺失 ID，不覆盖已有条目；默认生成回滚预演 SQL。缺少本站生成 PNG 时需从 Git 或备份恢复，不会自动调用生图。

部署和管理员设置见 [安装说明](../../../docs/docker-image.md)，完整公共库说明见 [公共内容与许可](../../../docs/assets.md)。
