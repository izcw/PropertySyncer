import { watch, unref, onUnmounted } from 'vue'

/**
 * 深拷贝函数
 * @param {any} value - 要深拷贝的值
 * @returns {any} 深拷贝后的值
 */
function deepCopy(value, seen = new WeakMap()) {
  // 处理基本类型
  if (value === null || typeof value !== 'object') {
    return value
  }

  // 检查缓存（处理循环引用）
  if (seen.has(value)) {
    return seen.get(value)
  }

  // 处理日期
  if (value instanceof Date) {
    const copy = new Date(value.getTime())
    seen.set(value, copy)
    return copy
  }

  // 处理数组
  if (Array.isArray(value)) {
    const copy = []
    seen.set(value, copy) // 先设置缓存，避免循环引用
    for (let i = 0; i < value.length; i++) {
      copy[i] = deepCopy(value[i], seen)
    }
    return copy
  }

  // 处理普通对象
  const copy = {}
  seen.set(value, copy) // 先设置缓存，避免循环引用
  for (const key in value) {
    if (value.hasOwnProperty(key)) {
      copy[key] = deepCopy(value[key], seen)
    }
  }
  return copy
}

/**
 * 深度比较函数
 * @param {any} a - 第一个要比较的值
 * @param {any} b - 第二个要比较的值
 * @param {WeakMap} cache - 缓存比较结果
 * @returns {boolean} 如果值深度相等则返回true
 */
function isDeepEqual(a, b, cache = new WeakMap()) {
  // 快速路径：相同引用或值
  if (a === b) return true

  // 类型不同直接返回false
  if (typeof a !== typeof b) return false

  // 处理null/undefined
  if (a == null || b == null) return a === b

  // 处理非对象类型
  if (typeof a !== 'object') return a === b

  // 检查缓存
  if (cache.has(a)) {
    const cachedMap = cache.get(a)
    if (cachedMap.has(b)) {
      return cachedMap.get(b)
    }
  }

  let result

  // 处理数组
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      result = false
    } else {
      result = true
      for (let i = 0; i < a.length; i++) {
        if (!isDeepEqual(a[i], b[i], cache)) {
          result = false
          break
        }
      }
    }
  } else {
    // 处理对象
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) {
      result = false
    } else {
      result = true
      for (const key of keysA) {
        if (!(key in b) || !isDeepEqual(a[key], b[key], cache)) {
          result = false
          break
        }
      }
    }
  }

  // 缓存结果
  if (!cache.has(a)) {
    cache.set(a, new WeakMap())
  }
  cache.get(a).set(b, result)

  return result
}

/**
 * 编译路径为访问函数
 * @param {string} path - 要编译的路径字符串
 * @returns {Function} 返回路径访问函数
 */
const pathCache = new Map()

function compilePath(path) {
  if (pathCache.has(path)) {
    return pathCache.get(path)
  }

  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  const fn = (obj) => {
    let current = obj
    for (const segment of segments) {
      if (current == null || typeof current !== 'object') {
        return undefined
      }
      current = current[segment]
    }
    return current
  }

  pathCache.set(path, fn)
  return fn
}

/**
 * 检查路径是否存在
 * @param {Object} obj - 要检查的对象
 * @param {string} path - 路径字符串
 * @returns {boolean} 路径是否存在
 */
function checkPathExists(obj, path) {
  if (!obj || !path || typeof path !== 'string') return false

  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current = obj
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return false
    }
    if (!(segment in current)) {
      return false
    }
    current = current[segment]
  }

  return true
}

/**
 * 获取对象深层属性
 * @param {Object} obj - 源对象
 * @param {string} path - 路径字符串
 * @returns {any} 返回路径对应的值
 */
function getByPath(obj, path) {
  if (!obj || !path || typeof path !== 'string') return undefined
  return compilePath(path)(obj)
}

/**
 * 数组更新
 * @param {Array} targetArray - 目标数组
 * @param {Array} newArray - 新数组
 */
function updateArray(targetArray, newArray) {
  if (!Array.isArray(newArray) || !Array.isArray(targetArray)) return

  const oldLength = targetArray.length
  const newLength = newArray.length
  const minLength = Math.min(oldLength, newLength)

  // 更新已有元素
  for (let i = 0; i < minLength; i++) {
    const newItem = newArray[i]
    const targetItem = targetArray[i]

    // 基本类型直接赋值
    if (newItem === null || typeof newItem !== 'object' || Array.isArray(newItem)) {
      if (targetItem !== newItem) {
        targetArray[i] = newItem
      }
      continue
    }

    // 对象类型合并
    if (targetItem && typeof targetItem === 'object' && !Array.isArray(targetItem)) {
      // 合并新属性
      for (const key in newItem) {
        if (newItem.hasOwnProperty(key)) {
          targetItem[key] = newItem[key]
        }
      }
      // 删除不再存在的属性
      for (const key in targetItem) {
        if (targetItem.hasOwnProperty(key) && !(key in newItem)) {
          delete targetItem[key]
        }
      }
    } else {
      targetArray[i] = { ...newItem }
    }
  }

  // 处理长度变化
  if (newLength > oldLength) {
    for (let i = oldLength; i < newLength; i++) {
      const item = newArray[i]
      targetArray.push(item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : item)
    }
  } else if (newLength < oldLength) {
    targetArray.splice(newLength)
  }
}

/**
 * 验证配置项
 * @param {Object} item - 配置项
 * @param {number} index - 配置项索引
 * @returns {Object} 验证后的配置项
 */
function validateMapping(item, index) {
  if (!item || typeof item !== 'object') {
    throw new Error(`[PropertySyncer] 第 ${index} 项配置无效`)
  }

  if (!item.path || typeof item.path !== 'string') {
    throw new Error(`[PropertySyncer] 第 ${index} 项缺少有效的 path`)
  }

  if (!item.target || typeof item.target !== 'object' || !('value' in item.target)) {
    throw new Error(`[PropertySyncer] 第 ${index} 项 target 不是有效的 ref`)
  }

  return {
    path: item.path,
    target: item.target,
    transform: typeof item.transform === 'function' ? item.transform : (v) => v,
    comparator: typeof item.comparator === 'function' ? item.comparator : null,
    deep: item.deep !== undefined ? Boolean(item.deep) : undefined,
    copyData: item.copyData !== undefined ? Boolean(item.copyData) : true
  }
}

/**
 * 创建监听处理函数
 * @param {Object} validatedItem - 验证后的配置项
 * @param {boolean} globalDeep - 全局深度监听设置
 * @param {boolean} debug - 调试模式开关
 * @returns {Function} 返回监听处理函数
 */
function createWatcherHandler(validatedItem, globalDeep, debug) {
  const { 
    path, 
    target, 
    transform, 
    comparator, 
    deep: itemDeep,
    copyData
  } = validatedItem
  
  const useDeep = itemDeep !== undefined ? itemDeep : globalDeep

  return (sourceValue, oldSourceValue) => {
    // 第一步：比较值是否变化
    const isDifferent = useDeep
      ? !isDeepEqual(sourceValue, oldSourceValue)
      : sourceValue !== oldSourceValue
    
    if (!isDifferent) return

    // 第二步：执行comparator
    if (comparator) {
      try {
        // 准备comparator参数
        const comparatorNewVal = copyData && sourceValue !== null && typeof sourceValue === 'object'
          ? deepCopy(sourceValue)
          : sourceValue
        
        const comparatorOldVal = copyData && oldSourceValue !== null && typeof oldSourceValue === 'object'
          ? deepCopy(oldSourceValue)
          : oldSourceValue
        
        const comparatorResult = comparator(comparatorNewVal, comparatorOldVal)
        
        if (typeof comparatorResult === 'boolean' && !comparatorResult) {
          return // comparator返回false，跳过更新
        }
      } catch (error) {
        // comparator失败时继续执行
      }
    }

    // 第三步：执行transform
    let finalValue
    
    try {
      // 准备transform参数
      const transformInput = copyData && sourceValue !== null && typeof sourceValue === 'object'
        ? deepCopy(sourceValue)
        : sourceValue
      
      const transformedValue = transform(transformInput)

      if (typeof transformedValue === 'undefined') {
        finalValue = transformInput
      } else {
        finalValue = transformedValue
        
        // 确保返回的值是深拷贝的
        if (copyData && finalValue !== null && typeof finalValue === 'object') {
          finalValue = deepCopy(finalValue)
        }
      }
    } catch (error) {
      finalValue = sourceValue
    }

    // 第四步：更新目标
    try {
      const currentTargetValue = target.value
      
      // 检查是否需要更新
      const needsUpdate = useDeep
        ? !isDeepEqual(currentTargetValue, finalValue)
        : currentTargetValue !== finalValue
      
      if (!needsUpdate) return
      
      if (Array.isArray(finalValue) && Array.isArray(currentTargetValue)) {
        updateArray(currentTargetValue, finalValue)
      } else {
        target.value = finalValue
      }
    } catch (error) {
      // 静默失败
    }
  }
}

/**
 * PropertySyncer - 属性同步器
 * @param {Object|Ref} source - 源对象或响应式引用
 * @param {Array|Object} mappings - 映射配置数组或对象
 * @param {Object} options - 配置选项
 * @returns {Function} 返回清理函数
 */
export function PropertySyncer(source, mappings = {}, options = {}) {
  const {
    immediate = true,
    deep = false,
    debug = false
  } = options

  // 统一配置格式
  const mapsArray = Array.isArray(mappings)
    ? mappings
    : Object.entries(mappings).map(([path, target]) => ({ path, target }))

  if (mapsArray.length === 0) {
    return () => { }
  }

  const stops = []
  const warnedPaths = new Set()

  for (const [index, item] of mapsArray.entries()) {
    try {
      const validatedItem = validateMapping(item, index)
      const watcherHandler = createWatcherHandler(validatedItem, deep, debug)

      // 创建响应式监听
      const stop = watch(
        () => {
          const src = unref(source)
          const value = getByPath(src, validatedItem.path)

          // 路径检测
          if (debug && src != null && value === undefined && !warnedPaths.has(validatedItem.path)) {
            const pathExists = checkPathExists(src, validatedItem.path)
            if (!pathExists) {
              console.warn(`[PropertySyncer] 路径 "${validatedItem.path}" 在源对象中不存在`)
              warnedPaths.add(validatedItem.path)
            }
          }

          return value
        },
        watcherHandler,
        {
          immediate,
          deep: false
        }
      )

      stops.push(stop)
    } catch (error) {
      // 单个配置失败不影响其他
    }
  }

  // 返回清理函数
  return () => {
    for (const stop of stops) {
      try {
        stop()
      } catch {
        // 静默失败
      }
    }
    stops.length = 0
    warnedPaths.clear()
  }
}

/**
 * usePropertySyncBlock - 模块化同步块
 * @param {Object|Ref} source - 源对象或响应式引用
 * @param {Function} getMappings - 获取映射配置的函数
 * @param {Object} options - 配置选项
 * @returns {Function} 返回清理函数
 */
export function usePropertySyncBlock(source, getMappings, options = {}) {
  const {
    immediate = true,
    deep = false,
    debug = false
  } = options

  let stopSync = null

  try {
    const mappings = getMappings()
    stopSync = PropertySyncer(source, mappings, { immediate, deep, debug })
  } catch {
    return () => { }
  }

  onUnmounted(() => {
    if (stopSync) {
      stopSync()
    }
  })

  return stopSync || (() => {})
}

// 导出工具函数
export const utils = {
  isDeepEqual,
  getByPath,
  updateArray,
  compilePath,
  checkPathExists,
  deepCopy
}

export default {
  PropertySyncer,
  usePropertySyncBlock,
  utils
}