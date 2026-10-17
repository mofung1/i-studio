# 电商工具 Bento 主页

主页保留共享导航栏，内容从工具卡片直接开始，不展示“电商创意工作台”标题及其描述。商品主图为核心大卡，右侧为产品精修、爆款复刻和服装组图，商品详情横向展示原图到多张素材的过程。原有五个工具路由保持一致。

主图提供叠加式前后对比，精修提供可调整两侧宽度的并排对比。鼠标、触摸和键盘都使用原生范围控件；左右方向键细调，Home/End 查看完整一侧。卡片链接和对比控件独立，拖动不会进入工具。界面使用现有主题变量，减少动态效果偏好下关闭悬停过渡。

宽桌面使用四列网格，核心卡跨两列两行。1180px 以下采用宽卡与双列小卡，600px 以下全部单列；短窗口允许内容滚动。新增工具可以继续扩展卡片数据和示例素材。

## 展示素材

下面的图片使用内置 `image_gen` 生成，属于能力说明示例，不是线上用户任务或效果保证。源图保留在 Codex 的 generated_images 中；发布素材已保存到项目并保留完整构图，仅通过 Sharp 缩放、压缩为 WebP。五张图片共约 288 KiB，不依赖第三方图库。页面通过 CSS 裁切同一张素材中的独立画面，复用浏览器图片缓存。

| 素材（相对项目根目录） | 内容 | 文件大小 |
| --- | --- | --- |
| `web/public/images/commerce/main.webp` | 同款面霜：普通拍摄与暖光石材场景 | 64,392 B |
| `web/public/images/commerce/retouch.webp` | 同款金属杯：表面瑕疵与精修质感 | 18,022 B |
| `web/public/images/commerce/recreate.webp` | 蓝瓶参考版式应用到橙色商品 | 45,262 B |
| `web/public/images/commerce/clothing.webp` | 同款米白衬衫：平铺、正面上身、侧面上身 | 76,244 B |
| `web/public/images/commerce/detail.webp` | 绿色精华液：原图、主视觉、材质特写、场景 | 90,784 B |

### 最终生成提示词记录

方式：内置 `image_gen`，五张独立图片，非 CLI/API 工作流。共用约束：`Use case: product-mockup. Production website demonstration photo strip for a premium ecommerce AI app. ONLY photographic contact sheet, no interface, text, labels, logos, borders, arrows or watermarks. Equal-width frames, edge to edge. Realistic ecommerce photography, natural materials, neutral lighting. Each frame contains a centered complete subject. Before/after capability demonstration.`

- **main**：`Exactly TWO equal-width landscape photographic frames side by side, wide 3:1 panorama. EXACT SAME off-white low cylindrical skincare cream jar, flat matching lid, tiny dark rectangular blank label. Identical centered placement, scale and camera. LEFT ordinary underexposed phone photo on pale gray tabletop against gray wall. RIGHT professional warm editorial ecommerce photo on pale travertine, gentle sunlight, natural warm stone backdrop and soft shadows. Jar occupies central 30 percent of frame height with generous space above/below for cropping. Precisely align the same product for a before/after slider.`
- **retouch**：`Exactly TWO equal-width photos side by side, wide 3:1 panorama. EXACT SAME black-lid stainless-steel travel tumbler, identical frontal camera, dimensions and centered placement, gray backdrop, no markings. LEFT dull metal, slight scratches/dust, flat reflections. RIGHT spotless brushed metal, controlled studio highlights, realistic texture, SAME object design and backdrop. Metal body detail is focus, ample gray negative space; align product for before/after comparison.`
- **recreate**：`Exactly TWO equal-width portrait product campaign photographs side by side, full aspect 4:3. LEFT blue translucent cosmetic pump bottle with silver cap on pale blue angular steps, white diagonal light stripe. RIGHT orange translucent pump bottle on precisely SAME steps, composition, camera, framing, stripe and shadows. Demonstrate reference composition transferring to another product. Blank labels, no words, complete centered bottles, realistic minimalist commercial photography.`
- **clothing**：`Exactly THREE equal-width portrait photographic frames side by side, full strip 2:1, no gutters. LEFT flat-lay cream short-sleeved relaxed camp collar button-up shirt on neutral background. MIDDLE adult wearing EXACT SAME shirt, front view, neck-to-hips. RIGHT same person and shirt, side view, neck-to-hips. Preserve collar, buttons, sleeves, fabric and color. Realistic folds, premium ecommerce styling, no accessories or typography.`
- **detail**：`Exactly FOUR equal-width photographic frames side by side in a horizontal panorama, no gutters. SAME muted sage-green serum bottle, white dropper cap and blank label. Frame1 simple original packshot, gray backdrop, complete bottle. Frame2 professional hero, bottle with leaves on warm stone. Frame3 detailed dropper/serum texture and droplet close-up. Frame4 same bottle in stone bathroom shelf lifestyle scene with blurred foliage and sunlight. First is input and remaining three are generated detail content examples. No certifications or claims.`
