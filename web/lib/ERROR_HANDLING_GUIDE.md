# 统一错误处理指南

本项目提供了统一的错误处理机制，用于替换分散在各组件中的错误处理逻辑。

## 核心工具

### `useErrorNotification` Hook

统一的错误处理和通知管理 Hook。

#### 基础用法

```tsx
import { useErrorNotification } from '@/lib/error-handling'

function MyComponent() {
  const { notice, handleError, clearNotice, showSuccess } = useErrorNotification('[MyComponent]')

  async function saveData() {
    try {
      await api.save(data)
      showSuccess('保存成功')
    } catch (error) {
      handleError(error, '保存失败，请稍后重试')
    }
  }

  return (
    <>
      {notice && (
        <div className={`notice notice-${notice.kind}`}>
          {notice.message}
        </div>
      )}
      <button onClick={saveData}>保存</button>
    </>
  )
}
```

#### API 说明

**返回值：**

- `notice: Notice | null` - 当前通知对象
- `setNotice(notice: Notice | null)` - 直接设置通知
- `clearNotice()` - 清除当前通知
- `handleError(error, fallbackMessage, options?)` - 处理错误并显示通知
- `showSuccess(message)` - 显示成功通知
- `showWarning(message)` - 显示警告通知
- `showInfo(message)` - 显示信息通知

**handleError 选项：**

```ts
{
  log?: boolean     // 是否记录到控制台，默认 true
  kind?: NoticeKind // 自定义通知类型，默认 'error'
}
```

#### 高级用法

**1. 自定义日志前缀**

```tsx
const { handleError } = useErrorNotification('[Workbench]')
// 日志输出: [Workbench] Error...
```

**2. 禁用日志（用于已知的用户错误）**

```tsx
handleError(error, '文件格式不支持', { log: false })
```

**3. 警告级别错误**

```tsx
handleError(error, '部分数据加载失败', { kind: 'warning' })
```

### 安全执行工具函数

用于替换空 `catch` 块，确保错误始终被记录。

#### `safeAsync` - 异步操作

```tsx
import { safeAsync } from '@/lib/error-handling'

// ❌ 错误示例 - 静默吞掉错误
try {
  await draft.flush()
} catch {
  // 什么都不做，错误被静默
}

// ✅ 正确做法 - 安全执行并记录
await safeAsync(
  () => draft.flush(),
  '[Draft] 自动保存失败'
)
```

**返回值：** 成功返回结果，失败返回 `null` 并记录日志。

#### `safeSync` - 同步操作

```tsx
import { safeSync } from '@/lib/error-handling'

const config = safeSync(
  () => JSON.parse(localStorage.getItem('config') || '{}'),
  '[Config] 解析失败'
)

if (config) {
  // 使用配置
}
```

## 迁移指南

### 替换现有错误处理

**场景 1: 重复的错误处理模式**

```tsx
// 之前 (重复代码)
const [notice, setNotice] = useState<{ kind: 'error', message: string } | null>(null)

try {
  await operation()
} catch (error) {
  setNotice({
    kind: 'error',
    message: error instanceof Error ? error.message : '操作失败'
  })
}

// 之后 (使用 hook)
const { notice, handleError } = useErrorNotification()

try {
  await operation()
} catch (error) {
  handleError(error, '操作失败')
}
```

**场景 2: 空 catch 块**

```tsx
// 之前 (静默错误，危险！)
try {
  await draft.flush()
} catch {
  // 草稿保存失败被静默吞掉
}

// 之后 (记录日志)
await safeAsync(
  () => draft.flush(),
  '[Draft] 保存失败'
)

// 或者需要显示通知时
try {
  await draft.flush()
} catch (error) {
  handleError(error, '草稿保存失败，请重试')
}
```

**场景 3: 多处相同的错误提示**

```tsx
// 之前 (散落各处)
.catch(() => setNotice({ kind: 'error', message: '操作失败，请稍后重试' }))

// 之后 (统一管理)
.catch(error => handleError(error, '操作失败，请稍后重试'))
```

### 兼容现有类型

新的 `Notice` 类型与 `GenerationNotice` 兼容：

```tsx
// GenerationNotice 只有 'success' | 'error'
export type GenerationNotice = { kind: 'success' | 'error'; message: string }

// Notice 类型更完整
export type Notice = { kind: 'info' | 'success' | 'warning' | 'error'; message: string }
```

如果组件已经使用 `GenerationNotice`，可以直接升级到 `Notice` 以获得更多通知类型支持。

## 最佳实践

### 1. 始终提供有意义的降级消息

```tsx
// ❌ 不好 - 消息太泛化
handleError(error, '出错了')

// ✅ 好 - 具体且可操作
handleError(error, '图片上传失败，请检查文件格式或网络连接')
```

### 2. 为不同组件使用日志前缀

```tsx
// 便于在控制台中定位问题来源
useErrorNotification('[Workbench]')
useErrorNotification('[AssetPicker]')
useErrorNotification('[HistoryDrawer]')
```

### 3. 区分用户错误和系统错误

```tsx
// 用户错误 - 不需要详细日志
if (!file.type.startsWith('image/')) {
  showWarning('请选择图片文件')
  return
}

// 系统错误 - 需要完整日志
try {
  await processImage(file)
} catch (error) {
  handleError(error, '图片处理失败')
}
```

### 4. 在操作完成后及时清除通知

```tsx
useEffect(() => {
  // 切换页面时清除旧通知
  clearNotice()
}, [pathname])
```

## 未来计划

- [ ] 集成错误监控服务 (Sentry)
- [ ] 添加用户反馈收集
- [ ] 支持通知队列和自动消失
- [ ] 提供全局错误边界

## 相关文件

- 实现：`web/lib/error-handling.ts`
- 测试：`web/lib/error-handling.test.tsx`
- 类型定义：`web/lib/error-handling.ts` (Notice, NoticeKind)
