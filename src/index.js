import { watch, unref, onUnmounted } from 'vue'

/**
 * 将路径字符串转为数组并安全读取对象值（支持数组下标）
 * 例如 "Master[0].volume" -> ['Master','0','volume'] -> 访问 obj.Master[0].volume
 * @param {object} obj - 源对象（可能是 reactive 或普通对象）
 * @param {string} path - 属性路径，如 "Master[0].volume"
 * @returns {any} 对应的属性值或 undefined
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined
  try {
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
    return keys.reduce((acc, key) => (acc !== undefined && acc !== null ? acc[key] : undefined), obj)
  } catch (e) {
    console.error(`[PropertySyncer] getByPath error for path="${path}":`, e)
    return undefined
  }
}

/**
 * PropertySyncer - 精准属性同步器
 * 
 * @param {object|Ref} source - 源响应式对象
 * @param {Array|Object} mappings - 映射配置
 * @param {object} options - { immediate: true, deep: false }
 * @returns {Function} stopSync() 停止所有监听
 */
export function PropertySyncer(source, mappings = {}, options = {}) {
  const { immediate = true, deep = false } = options
  const stops = []

  const mapsArray = Array.isArray(mappings)
    ? mappings
    : Object.entries(mappings).map(([path, target]) => ({ path, target }))

  const defaultComparator = (a, b) => (a !== a && b !== b ? false : a !== b)

  for (const [i, item] of mapsArray.entries()) {
    const { path, target } = item
    if (!path) throw new Error(`[PropertySyncer] mappings 第 ${i} 项缺少 path`)
    if (!target || !('value' in target)) throw new Error(`[PropertySyncer] mappings 第 ${i} 项 target 不是有效的 ref`)

    const transform = typeof item.transform === 'function' ? item.transform : (v) => v
    const comparator = typeof item.comparator === 'function' ? item.comparator : defaultComparator

    const getter = () => transform(getByPath(unref(source), path))

    const stop = watch(getter, (newVal, oldVal) => {
      if (comparator(newVal, oldVal)) {
        target.value = newVal
      }
    }, { immediate, deep })

    stops.push(stop)
  }

  return () => stops.forEach((s) => s())
}

/**
 * usePropertySyncBlock - 组合式函数，管理一组属性同步
 *
 * @param {object|Ref} source - 源响应式对象
 * @param {Function} getMappings - 返回该 block 的 mappings 数组
 * @param {object} options - watch 配置，可选 { immediate: true, deep: false }
 * @returns {Function} stopSyncBlock() 停止同步
 */
export function usePropertySyncBlock(source, getMappings, options = { immediate: true, deep: false }) {
  const stopSync = PropertySyncer(source, getMappings(), options)

  onUnmounted(() => stopSync())

  return stopSync
}

// 默认导出
export default {
  PropertySyncer,
  usePropertySyncBlock
}