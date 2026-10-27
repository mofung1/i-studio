# 公共内容与来源许可

## 公共灵感库

内置 798 条提示词、13 个分类和 798 张封面。Docker 新站首次启动自动导入；已有公共库保留管理员的编辑、停用和删除。

- 数据清单：`server/seed/inspiration-catalog.json`。
- 公共封面：`server/storage/uploads/inspiration/`，随 Git 跟踪。
- 来源元数据和许可证：`server/seed/awesome-gpt-image-2/`、`server/seed/handraw/`、`server/seed/evolink/`。

风格类提示词可能只提供可复用的风格段，需要用户补充主体、场景和具体要求。封面在条目中标明来源或本站生成示例，不保证所有模型得到同样的效果。

| 来源                                                                                | 内容与许可                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [yang0/handraw-style](https://github.com/yang0/handraw-style)                       | 风格提示词及示例；保留作者署名与 [MIT 许可证](../server/seed/handraw/LICENSE) |
| [EvoLink 图片提示词](https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts) | 来源项目声明 CC0-1.0，保留 [许可证](../server/seed/evolink/LICENSE)           |
| [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) | 早期 549 条案例集合；维护者确认来源，保留原作者信息及 [MIT 许可副本](../server/seed/awesome-gpt-image-2/LICENSE) |

来源说明分别见 [awesome-gpt-image-2](../server/seed/awesome-gpt-image-2/README.md)、[handraw-style](../server/seed/handraw/README.md) 和 [EvoLink](../server/seed/evolink/README.md)。这些来源许可不替代各自图片、商标或人物素材可能涉及的使用条件。

其中 handraw 新批次为 101 条、EvoLink 为 148 条；早期 549 条作为一批登记 awesome-gpt-image-2 来源，其中 8 条旧手绘补充仍保留条目自身的 handraw-style 来源标注。来源集合说明不覆盖单条作者与来源信息。早期批次的原始导入 commit 未记录，本次保存的是 2026-10-27 核对的上游许可副本。

项目原创代码采用根目录的 [MIT 许可证](../LICENSE)；第三方内容仍适用各自的来源许可与署名。

## 官网与文档图片

官网展示作品是 AI 概念示例或标明的产品截图，不作为用户案例和商品保真承诺。素材与来源清单保存在 [marketing-visuals](marketing-visuals/README.md)；文档页面截图位于 `docs/images/screenshots/`，架构图提供 SVG、PNG 和 Mermaid 源文件。

## 用户自己的数据

上传图片、生成作品、私人提示词、供应商密钥、数据库和站点配置不随仓库分发。部署者通过持久卷、数据库及所选对象存储自行保存，按 [备份说明](operations.md#备份) 维护。
