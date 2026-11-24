import { describe, expect, it } from 'vitest'

import {
  assetIdFromContentPath,
  edgeAllowed,
  imageNodeData,
  imageNodeResult,
  newCanvasNode,
  resolveReferenceImages,
  textNodeData,
  type CanvasNode,
} from './canvas'

function nodeWithResult(result: CanvasNode['result']): CanvasNode {
  const node = newCanvasNode('image', 0, 0)
  node.result = result
  return node
}

describe('imageNodeResult', () => {
  it('把 null 与空对象统一当成无结果', () => {
    expect(imageNodeResult(nodeWithResult(null))).toBeNull()
    expect(imageNodeResult(nodeWithResult({}))).toBeNull()
  })

  it('缺少字符串 status 时按无结果处理', () => {
    expect(imageNodeResult(nodeWithResult({ images: ['/v1/assets/a/content'] }))).toBeNull()
  })

  it('解析完整结果并过滤非字符串图片路径', () => {
    const result = imageNodeResult(
      nodeWithResult({
        status: 'succeeded',
        taskId: 'task-1',
        images: ['/v1/assets/a/content', 42, '/v1/assets/b/content'],
        details: [
          {
            contentPath: '/v1/assets/a/content',
            width: 1024,
            height: 1024,
            sizeBytes: 1,
            elapsedMs: null,
          },
        ],
        error: undefined,
      }),
    )
    expect(result).toEqual({
      status: 'succeeded',
      taskId: 'task-1',
      images: ['/v1/assets/a/content', '/v1/assets/b/content'],
      details: [
        {
          contentPath: '/v1/assets/a/content',
          width: 1024,
          height: 1024,
          sizeBytes: 1,
          elapsedMs: null,
        },
      ],
      error: undefined,
    })
  })
})

describe('imageNodeData / textNodeData', () => {
  it('缺省字段回退默认值', () => {
    const node = newCanvasNode('image', 0, 0)
    node.data = {}
    expect(imageNodeData(node)).toEqual({
      prompt: '',
      endpointId: '',
      model: '',
      aspectRatio: '1:1',
      resolution: '2K',
      count: 1,
      style: 'unspecified',
      referenceStrength: 'medium',
      referenceAssetIds: [],
    })
  })

  it('文本节点缺省字段为空串', () => {
    const node = newCanvasNode('text', 0, 0)
    expect(textNodeData(node)).toEqual({ prompt: '', instruction: '' })
  })
})

describe('assetIdFromContentPath', () => {
  it('从 contentPath 提取资产 ID', () => {
    expect(assetIdFromContentPath('/v1/assets/abc-123/content')).toBe('abc-123')
  })

  it('非 contentPath 返回 null', () => {
    expect(assetIdFromContentPath('/v1/assets/abc-123')).toBeNull()
    expect(assetIdFromContentPath('data:image/png;base64,xxx')).toBeNull()
    expect(assetIdFromContentPath('')).toBeNull()
  })
})

describe('edgeAllowed', () => {
  it('允许文本/图像之间的合法连线（含图生文）', () => {
    expect(edgeAllowed('text', 'text')).toBe(true)
    expect(edgeAllowed('text', 'image')).toBe(true)
    expect(edgeAllowed('image', 'image')).toBe(true)
    expect(edgeAllowed('image', 'text')).toBe(true)
  })

  it('拒绝视频节点参与连线', () => {
    expect(edgeAllowed('video', 'image')).toBe(false)
    expect(edgeAllowed('video', 'text')).toBe(false)
    expect(edgeAllowed('image', 'video')).toBe(false)
    expect(edgeAllowed('text', 'video')).toBe(false)
  })
})

describe('resolveReferenceImages', () => {
  it('无上游图时原样返回', () => {
    expect(resolveReferenceImages('一只猫', [])).toEqual({
      referenceAssetIds: [],
      prompt: '一只猫',
    })
  })

  it('无 @图N 标记时回退为引用全部上游图（最多 6 张）', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(resolveReferenceImages('一只猫', ids)).toEqual({
      referenceAssetIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      prompt: '一只猫',
    })
  })

  it('按 @图N 精确引用并去掉标记', () => {
    const ids = ['a', 'b', 'c']
    expect(resolveReferenceImages('参考 @图1 和 @图3 的风格', ids)).toEqual({
      referenceAssetIds: ['a', 'c'],
      prompt: '参考 和 的风格',
    })
  })

  it('忽略越界序号与去重', () => {
    const ids = ['a', 'b']
    expect(resolveReferenceImages('@图1 @图1 @图9', ids)).toEqual({
      referenceAssetIds: ['a'],
      prompt: '',
    })
  })
})
