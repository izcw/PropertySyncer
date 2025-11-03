import { watch, unref, onUnmounted } from 'vue'

/**
 * 高性能深度比较
 * 使用 WeakMap 缓存对象，避免重复比较引用
 * @param {any} a
 * @param {any} b
 * @param {WeakMap} cache
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
 * @param {object} obj
 * @param {string} path
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined
  try {
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
    return keys.reduce((acc, key) => (acc != null ? acc[key] : undefined), obj)
  } catch (e) {
    console.error(`[PropertySyncer] getByPath error for path="${path}":`, e)
    return undefined
  }
}

/**
 * 数组逐项更新，保持对象引用，避免 v-for 重建 DOM
 * @param {Array} targetArray
 * @param {Array} newArray
 */
function updateArray(targetArray, newArray) {
  if (!Array.isArray(newArray)) return

  newArray.forEach((item, index) => {
    if (targetArray[index]) {
      Object.keys(item).forEach(key => {
        if (!smartDeepEqual(targetArray[index][key], item[key])) {
          targetArray[index][key] = item[key]
        }
      })
    } else {
      targetArray.push({ ...item })
    }
  })

  if (targetArray.length > newArray.length) {
    targetArray.splice(newArray.length)
  }
}

/**
 * PropertySyncer - 精准属性同步器（防闪烁版）
 * 支持 transform, comparator, deep, immediate
 * @param {object|Ref} source
 * @param {Array|Object} mappings
 * @param {object} options
 */
export function PropertySyncer(source, mappings = {}, options = {}) {
  const { immediate = true, deep = false } = options
  const stops = []

  const mapsArray = Array.isArray(mappings)
    ? mappings
    : Object.entries(mappings).map(([path, target]) => ({ path, target }))

  const defaultComparator = deep
    ? (a, b) => !smartDeepEqual(a, b, new WeakMap())
    : (a, b) => a !== b

  for (const [i, item] of mapsArray.entries()) {
    const { path, target } = item
    if (!path) throw new Error(`[PropertySyncer] mappings 第 ${i} 项缺少 path`)
    if (!target || !('value' in target)) throw new Error(`[PropertySyncer] mappings 第 ${i} 项 target 不是有效的 ref`)

    const transform = typeof item.transform === 'function' ? item.transform : (v) => v
    const comparator = typeof item.comparator === 'function' ? item.comparator : defaultComparator

    const getter = () => transform(getByPath(unref(source), path))

    const stop = watch(
      getter,
      (newVal, oldVal) => {
        if (!comparator(newVal, oldVal)) return

        // 如果目标是数组，按属性更新
        if (Array.isArray(newVal) && Array.isArray(target.value)) {
          updateArray(target.value, newVal)
        } else {
          target.value = newVal
        }
      },
      { immediate, deep }
    )

    stops.push(stop)
  }

  return () => stops.forEach(s => s())
}

/**
 * usePropertySyncBlock - 模块化同步块（推荐）
 * 自动解绑，支持 transform, comparator, immediate, deep
 * @param {object|Ref} source
 * @param {Function} getMappings
 * @param {object} options
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
