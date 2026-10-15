# 失败任务占位插画

通过内置 imagegen 生成，原始输出复制到 `web/public/images/generation-failed.png`，用于「我的资产 → 按任务查看」中没有结果图片的失败任务。Next.js Image 按卡片尺寸提供优化后的图片，插画不写入用户生成资产或任务结果。

画面采用黑白立体纸质画框、未完成的山形图块和重试箭头。点击卡片继续打开已有失败原因弹窗，底部文字标明“生成失败”和“查看原因”。

最终提示词：

> Create one polished UI illustration for the failed image-generation task card in iStudio, a minimalist black-and-white AI image creation workspace. Use case: stylized-concept. Square image, neutral light gray studio background with soft shadows. A single slightly tilted matte white picture frame holds an unfinished sculpted landscape: smooth graphite-black hill shapes, one small ivory sun, and an interrupted corner where a few neat image tiles are missing and floating just outside the frame. A subtle small graphite circular retry arrow rests beside the frame, communicating a recoverable generation failure. Calm, refined, tactile paper-and-ceramic 3D art, carefully balanced negative space, clear silhouette readable as a small thumbnail, soft diffused lighting, restrained grayscale contrast. Center the composition within the middle 70 percent so it survives landscape and portrait card cropping. No words, letters, numbers, logos, interface panels, red warning symbols, or decorative extra objects. This is a production website illustration, not a UI mockup.
