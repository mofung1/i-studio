import { describe, expect, it } from 'vitest'

import {
  imageNodeData,
  imageNodeResult,
  newCanvasNode,
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
    })
  })

  it('文本节点缺省字段为空串', () => {
    const node = newCanvasNode('text', 0, 0)
    expect(textNodeData(node)).toEqual({ prompt: '', instruction: '' })
  })
})
