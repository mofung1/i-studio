# 图片存储与 CDN

后台入口：`/admin/storage`。默认使用本地存储，不填云密钥也能正常启动。支持添加多套配置，并切换新图片的默认存储。

| 平台 | 接入方式 | 配置示例 |
| --- | --- | --- |
| 阿里云 OSS | 官方 OSS Go SDK V2 | 区域 `cn-hangzhou`，Endpoint `https://oss-cn-hangzhou.aliyuncs.com` |
| 七牛云 Kodo | 官方支持的 S3 兼容 API，AWS Go SDK V2 | 区域 `cn-east-1`，Endpoint `https://s3.cn-east-1.qiniucs.com`；填写控制台显示的 **S3 空间名** |
| 腾讯云 COS | 官方支持的 S3 兼容 API，AWS Go SDK V2 | 区域 `ap-guangzhou`，Endpoint `https://cos.ap-guangzhou.myqcloud.com`；桶名含 APPID |
| S3 / MinIO 等 | AWS Go SDK V2 | 使用平台提供的 HTTPS Endpoint、区域和桶名；MinIO 通常使用路径风格 |

## 使用步骤

1. 在云平台创建私有存储桶，准备仅有目标桶所需读、写、删除权限的访问密钥。使用对象前缀时，将权限范围限制到该前缀。
2. 在后台添加配置，填写平台、区域、桶名、Endpoint 和密钥。密钥使用现有 AES-256-GCM 加密机制保存到数据库；读取接口只返回是否已配置，不返回明文。
3. 如果 API 使用内网 Endpoint 读写，另填同一个桶的外网下载 Endpoint，供浏览器使用临时签名链接。
4. 在存储桶或 CDN 配置 CORS，允许网站的精确域名执行 `GET`、`HEAD`。预览、下载和图片对比都需要浏览器能读取跨域图片响应。
5. 设为默认后，新上传素材、生成作品、反推临时图与从反推保存的灵感封面写入此存储。配置保存和默认切换本身不发送云端请求；实际上传、浏览、删除会按云平台规则计费。

没有填写 CDN 时，图片 API 校验用户归属，再返回有效期 5 分钟的对象存储签名链接。网页中保留稳定的应用内图片路径，数据库不保存会过期的下载 URL。

## CDN

可为每套存储填写 CDN 域名，并选择匹配的下载鉴权：

- 阿里云 CDN：鉴权 A，默认参数 `auth_key`。
- 腾讯云 CDN：鉴权 A，默认参数 `sign`。
- 七牛：私有空间下载凭证，`e` 与 `token`，复用该空间 AK/SK。

A 类鉴权须在 CDN 控制台设置有效期 **300 秒**，密钥与后台填写一致；签名时间使用服务器当前时间，请保持服务器时钟同步。七牛凭证有效期为 300 秒。

云控制台还必须配置私有回源、CORS，以及所有图片请求均需 URL 鉴权的规则。缓存命中也应验证签名，不要允许无签名访问。程序不会自动修改云平台权限；仅将 CDN 指向私有桶，不能替代 CDN 的下载鉴权。不要把对象存储的签名地址替换域名当作 CDN 地址。

缩略图首次生成后与原图存入同一存储，后续直接下载缓存缩略图。ZIP 打包及 AI 读取原图仍由 API 执行；上传也经过 API 校验，首版不包含浏览器直传。

新上传素材使用 `user/YYYYMMDD/<文件名>`，新生成作品使用 `image/YYYYMMDD/<文件名>`，日期统一按北京时间计算；云端相对目录位于所选配置的对象前缀之下。缩略图跟随原图目录。已保存的旧 key 继续按数据库记录读取，不因调整新文件目录而自动搬迁云对象；本地目录见 [资产管理](asset-management.md#文件目录)。

## 切换、历史与备份

- 切换默认存储只影响新文件，不会自动搬迁旧图。每个云对象的内部 key 带存储配置 ID；原有无前缀 key 始终从本地读取。
- 已保存配置的厂商、Endpoint、桶、区域、目录与路径风格固定。更换位置请新增配置，保留旧配置及旧桶。访问密钥、下载 Endpoint 与 CDN 可更新。
- 云写入失败会报告错误，不会静默回退到本地。修改默认后，旧图仍依赖旧存储可用。
- 已有本地素材、生成结果，以及预置灵感图库不会自动上传；网站 Logo、鉴权签名密钥和配置加密密钥仍使用本地挂载卷。
- 备份 PostgreSQL、本地 `STORAGE_ROOT`、环境变量及各云桶；丢失 `STORAGE_ROOT/.ai/encryption.key` 或显式加密密钥后，将无法解密 AI 与对象存储的访问密钥。
- 迁移历史图片时需要复制并校验对象，再更新数据库中的存储归属。首版没有自动迁移或删除旧桶的功能。

用户删除素材时，生成中的引用会阻止删除；历史任务使用过的素材从列表隐藏，保留原文件用于恢复配置。只有已经隐藏至少 7 天、且没有任何任务引用的素材才会被清理。可见的未使用素材不会自动过期。物理删除失败会留在数据库重试队列中，后台每 10 分钟处理一次。

## 选型与验证

检索过 [Dify Cloud Kit](https://github.com/langgenius/dify-cloud-kit) 和 [Apache OpenDAL Go](https://github.com/apache/opendal/tree/main/bindings/go)。前者列出的驱动未包含七牛；后者 Go 绑定需要 libffi 等部署依赖。本项目沿用小型统一存储接口，使用官方 SDK 实现适配，保持现有 Go 静态构建流程。

参考：[阿里云 OSS SDK V2](https://github.com/aliyun/alibabacloud-oss-go-sdk-v2)、[七牛 S3 服务域名](https://developer.qiniu.com/kodo/4088/s3-access-domainname)、[腾讯云 S3 SDK 接入](https://cloud.tencent.com/document/practice/436/37421)、[阿里云 CDN 鉴权 A](https://www.alibabacloud.com/help/zh/cdn/user-guide/type-a-signing)、[七牛私有下载](https://developer.qiniu.com/kodo/1656/download-private)。

自动测试使用模拟 HTTP 传输验证四种适配器的读、写、删除、私有签名与下载域名；使用独立数据库 schema 验证管理员权限、密钥加密、位置不可修改、切换后旧图仍可访问。尚未使用真实云账号联调；上线选择厂商后，应使用该账号验证私有桶、CORS、CDN 鉴权与缓存命中。
