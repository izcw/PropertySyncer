# Property Syncer

高性能 **Vue 3 响应式属性同步工具**，用于在响应式对象与多个 `ref` 之间进行精准、可控的属性映射与更新。

支持 **深层路径访问、transform 转换函数、comparator 比较函数、immediate 初始化同步、deep 深度监听**，  
并提供模块化的 `usePropertySyncBlock` 方案，轻松管理多组同步关系。

---

## 功能特性

- 🎯 **精确路径同步**：支持精确深层路径（如 `Master[0].volume`），安全访问数组与对象属性  
- ⚡ **性能优化**：仅监听指定路径，不会深度监听整个对象  
- 🧩 **映射形式灵活**：支持对象形式 `{ 'path': ref }` 或数组形式 `[{ path, target, transform?, comparator? }]`  
- 🔁 **自定义转换**：每个映射项可选 `transform` 回调，对源值进行预处理  
- 🧮 **灵活比较逻辑**：支持自定义 `comparator` 函数，仅在满足条件时触发更新，减少无效同步  
- 🚀 **自动同步**：支持 `{ immediate: true }`，初始化时立即同步（默认启用）  
- 🧠 **可选深度监听**：可配置 `{ deep: true }`，监听嵌套对象变化  
- 🧱 **模块化管理**：`usePropertySyncBlock` 支持多组独立同步，逻辑更清晰  
- 🧹 **自动解绑**：`usePropertySyncBlock` 组件卸载时自动移除监听，避免内存泄漏  

---

## 性能对比表

| 项目         | 旧方法             | PropertySyncer          |
| ---------- | -------------------------- | --------------------------- |
| **监听粒度**   | 整个对象                       | 指定路径/属性                     |
| **触发次数**   | 对象任何子属性变化都会触发              | 仅目标属性变化触发                   |
| **CPU 开销** | 高（JSON.stringify 深度比较）     | 低（局部比较）                     |
| **内存开销**   | 中等（需要保存旧值副本）               | 低（仅监听目标 ref）                |
| **自动解绑**   | ❌ 需手动                      | ✅ usePropertySyncBlock 自动解绑 |
| **可扩展性**   | 差，新增属性需手动添加逻辑              | 高，新增映射只需配置 path             |
| **复杂对象支持** | 差，对嵌套对象需额外处理               | 优，支持深层路径访问和深度监听             |


---

## API

### 1. `PropertySyncer` 手动清理版
### 2. `usePropertySyncBlock` 模块化自动解绑版（推荐使用）

### PropertySyncer(source, mappings, options?)

| 参数                  | 类型                | 说明                 |
| ------------------- | ----------------- | ------------------ |
| `source`            | `object \| Ref`   | 源响应式对象             |
| `mappings`          | `Array \| Object` | 同步映射配置             |
| `options.immediate` | `boolean`         | 是否立即同步（默认 `true`）  |
| `options.deep`      | `boolean`         | 是否深度监听（默认 `false`） |

#### mappings 数组项属性

| 属性            | 类型                                      | 说明                           |
| ------------- | --------------------------------------- | ---------------------------- |
| `path`        | `string`                                | 源属性路径，如 `"Master[0].volume"` |
| `target`      | `Ref`                                   | 目标 ref                       |
| `transform?`  | `(value: any) => any`                   | 可选，转换源值后再写入目标                |
| `comparator?` | `(newVal: any, oldVal: any) => boolean` | 可选，自定义比较逻辑，返回 `true` 时触发更新   |

#### PropertySyncer返回：Function → 调用可停止所有监听

---

### usePropertySyncBlock(source, getMappings, options?)

组合式封装，基于 PropertySyncer 实现，适用于模块化使用场景。
支持所有 transform、comparator、immediate、deep 等配置。
组件卸载时自动清理监听，推荐优先使用。

---

## 使用示例

#### 安装

```bash
pnpm i property-syncer
```

#### 导入

```bash
import { PropertySyncer, usePropertySyncBlock } from 'property-syncer'
```

#### 基础用法：PropertySyncer（需手动清理）

```javascript
import { ref, onUnmounted } from 'vue'
import { PropertySyncer } from 'property-syncer'

const OutputSwitch = ref('0')

// 创建同步器
const stopSync = PropertySyncer(store.data, [
  { path: 'OutputSwitch', target: OutputSwitch }
], { immediate: true })

// 页面卸载手动停止监听
onUnmounted(() => stopSync())
```

#### 推荐用法：usePropertySyncBlock（自动解绑）

```javascript
import { ref } from 'vue'
import { usePropertySyncBlock } from 'property-syncer'

// 逻辑块 1：基本同步
const OutputSwitch1 = ref('0')
const OutputSwitch2 = ref('0')
usePropertySyncBlock(store.data, () => [
  { path: 'OutputSwitch1', target: OutputSwitch1 },
  { path: 'OutputSwitch2', target: OutputSwitch2 }
], { immediate: true })

// 逻辑块 2：带 transform 与 comparator 的高级同步
const temperature = ref(0)
usePropertySyncBlock(store.data, () => [
  {
    path: 'weather.Temperature',
    target: temperature,
    transform: v => Number(v).toFixed(1),
    comparator: (newVal, oldVal) => Math.abs(newVal - oldVal) > 0.01 // 仅当变化超过 0.01 时更新
  }
])

// 逻辑块 3：可手动停止同步（默认组件卸载时自动清理）
const stopSync = usePropertySyncBlock(source, getMappings)
stopSync() // 适合在组件卸载前还需要手动清理同步逻辑
```

## 开发与发布

安装依赖

```bash
pnpm install
```

打包发布

```bash
pnpm run build
```

发布到 npm

```bash
pnpm publish --access public
```
