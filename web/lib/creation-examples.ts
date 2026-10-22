import type { CommerceTaskType } from './contracts'

export interface CreationExample {
  title: string
  prompt: string
}
const generalExamples: CreationExample[] = [
  {
    title: '自然光静物',
    prompt:
      '一只透明玻璃花瓶与几枝白色雏菊，放在浅色木桌上。午后自然光从左侧窗户照入，柔和阴影，背景简洁，写实静物摄影，不出现文字。',
  },
  {
    title: '手绘故事场景',
    prompt:
      '雨后的小镇书店，门口一只橘猫安静地看着水洼，窗内透出暖光。手绘插画风格，柔和色彩，细节丰富，营造安静温暖的氛围，不出现文字。',
  },
  {
    title: '海报留白背景',
    prompt:
      '以蓝色海面和白色浪花为主题的简洁海报背景，俯视构图，阳光明亮。主体集中在画面下半部，上方保留干净留白，方便后续自行排版，不生成任何文字或标志。',
  },
]
const commerceExamples: Record<CommerceTaskType, CreationExample[]> = {
  'product-main': [
    {
      title: '简洁商品主图',
      prompt:
        '保留上传商品的外形、颜色、包装与文字，使用干净浅色背景与柔和棚拍光，商品居中，突出轮廓和质感，不添加未提供的卖点或道具。',
    },
    {
      title: '自然光场景',
      prompt:
        '保留上传商品的细节，将商品放在简洁的窗边台面上，使用自然光与柔和叶影，背景虚化，不遮挡商品，不新增包装文字。',
    },
  ],
  'detail-page': [
    {
      title: '细节与使用场景',
      prompt:
        '围绕上传商品制作风格统一的详情素材，展示整体外观、已有细节与适用场景。保留商品原貌，只使用我提供的真实信息，不虚构材质、规格、认证或功效。',
    },
  ],
  'viral-recreate': [
    {
      title: '借鉴构图与光影',
      prompt:
        '参考构图图的主体位置、留白与光线方向，使用上传商品重新创作。保留商品的形状、颜色及包装文字，不复制参考图中的商标、文案或其他商品。',
    },
  ],
  'product-retouch': [
    {
      title: '干净通透',
      prompt:
        '清理商品表面的灰尘与背景杂物，校正曝光和白平衡，保持真实颜色、轮廓和包装文字，避免过度磨皮与变形。',
    },
    {
      title: '突出材质',
      prompt:
        '适度改善商品的光影层次与材质细节，减轻刺眼反光，保留真实纹理、颜色和结构，不改变品牌标记与文字。',
    },
  ],
  'clothing-set': [
    {
      title: '干净棚拍',
      prompt:
        '使用干净浅色背景与柔和棚拍光，保留服装的真实颜色、款式、印花和标记，突出领口、袖口与面料纹理，整组光线与色调一致。',
    },
    {
      title: '自然光展示',
      prompt:
        '以简洁的自然光场景展示上传服装，避免复杂背景和遮挡，保持服装的版型、颜色、印花与细节，各张图片的光线和氛围统一。',
    },
  ],
}

export function creationExamples(mode: 'general' | 'commerce', task: CommerceTaskType) {
  return mode === 'general' ? generalExamples : commerceExamples[task]
}
