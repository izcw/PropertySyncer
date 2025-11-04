import { watch, unref, onUnmounted, isRef } from 'vue'

/**
 * 高性能深度比较
 * 使用 WeakMap 缓存对象，避免重复比较引用
 */
function smartDeepEqual(a, b, cache = new WeakMap()) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return false

  if (typeof a === 'object') {
    if (cache.has(a)) return cache.get(a) === b
    cache.set(a, b)
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!smartDeepEqual(a[i], b[i], cache)) return false
    }
    return true
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (!smartDeepEqual(a[key], b[key], cache)) return false
    }
    return true
  }

  return a === b
}

/**
 * 安全获取对象深层属性
 * 支持 a.b[0].c 形式
 */
function getByPath(obj, path, cache = new Map()) {
  if (!obj || !path) return undefined
  if (cache.has(path)) return cache.get(path)(obj)

  // 编译 path 为访问函数以提高性能
  const fn = new Function(
    'obj',
    `try { return obj${path.replace(/\[(\d+)\]/g, '.$1').split('.').map(k => k ? `["${k}"]` : '').join('')} } catch(e){ return undefined }`
  )
  cache.set(path, fn)
  return fn(obj)
}

/**
 * 安全设置对象深层属性（用于双向同步）
 */
function setByPath(obj, path, value) {
  if (!obj || !path) return
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = isNaN(keys[i + 1]) ? {} : []
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

/**
 * 安全数组同步
 * ✅ 支持基本类型和对象数组
 * ✅ 支持嵌套更新
 */
function updateArray(targetArray, newArray) {
  if (!Array.isArray(newArray)) return

  newArray.forEach((item, index) => {
    if (item === null || typeof item !== 'object') {
      if (targetArray[index] !== item) {
        targetArray[index] = item
      }
      return
    }

    if (targetArray[index] && typeof targetArray[index] === 'object') {
      Object.keys(item).forEach(key => {
        if (!smartDeepEqual(targetArray[index][key], item[key])) {
          targetArray[index][key] = item[key]
        }
      })
    } else {
      targetArray[index] = Array.isArray(item) ? [...item] : { ...item }
    }
  })

  if (targetArray.length > newArray.length) {
    targetArray.splice(newArray.length)
  }
}

/**
 * PropertySyncer - 高性能属性同步器（增强版）
 * 支持 transform、comparator、deep、immediate、双向同步
 */
export function PropertySyncer(source, mappings = {}, options = {}) {
  const {
    immediate = true,
    deep = false,
    bidirectional = false, // 新增：是否启用双向同步
  } = options

  const stops = []
  const cache = new Map()

  const mapsArray = Array.isArray(mappings)
    ? mappings
    : Object.entries(mappings).map(([path, target]) => ({ path, target }))

  const defaultComparator = deep
    ? (a, b) => !smartDeepEqual(a, b, new WeakMap())
    : (a, b) => a !== b

  for (const [i, item] of mapsArray.entries()) {
    const { path, target } = item
    if (!path) throw new Error(`[PropertySyncer] 第 ${i} 项缺少 path`)
    if (!target || !('value' in target))
      throw new Error(`[PropertySyncer] 第 ${i} 项 target 不是有效的 ref`)

    const transform = typeof item.transform === 'function' ? item.transform : v => v
    const comparator = typeof item.comparator === 'function' ? item.comparator : defaultComparator

    const getter = () => transform(getByPath(unref(source), path, cache))

    // ---- 🔁 单向同步（source → target） ----
    const stopForward = watch(
      getter,
      (newVal, oldVal) => {
        if (!comparator(newVal, oldVal)) return

        if (Array.isArray(newVal) && Array.isArray(target.value)) {
          updateArray(target.value, newVal)
        } else {
          target.value = newVal
        }
      },
      { immediate, deep }
    )

    stops.push(stopForward)

    // ---- 🔁 双向同步（target → source，可选） ----
    if (bidirectional) {
      const stopReverse = watch(
        target,
        (newVal, oldVal) => {
          if (!comparator(newVal, oldVal)) return
          setByPath(unref(source), path, newVal)
        },
        { deep }
      )
      stops.push(stopReverse)
    }
  }

  return () => stops.forEach(s => s())
}

/**
 * usePropertySyncBlock - 模块化同步块
 * 支持自动解绑与增强功能
 */
export function usePropertySyncBlock(source, getMappings, options = { immediate: true, deep: false }) {
  const stopSync = PropertySyncer(source, getMappings(), options)
  onUnmounted(() => stopSync())
  return stopSync
}

export default {
  PropertySyncer,
  usePropertySyncBlock
}
