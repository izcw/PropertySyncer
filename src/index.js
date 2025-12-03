import { watch, unref, onUnmounted } from 'vue'

/**
 * 深度比较函数
 * 使用 WeakMap 缓存对象，避免重复比较引用和循环引用问题
 * @param {any} a - 第一个要比较的值
 * @param {any} b - 第二个要比较的值
 * @param {WeakMap} cache - 用于缓存比较结果的WeakMap
 * @returns {boolean} 如果值深度相等则返回true
 */
function smartDeepEqual(a, b, cache = new WeakMap()) {
  // 快速路径：相同引用或值
  if (a === b) return true

  // 类型不同直接返回false
  if (typeof a !== typeof b) return false

  // 处理null/undefined
  if (a == null || b == null) return a === b

  // 处理非对象类型
  if (typeof a !== 'object') return a === b

  // 检查缓存避免循环引用
  if (cache.has(a)) return cache.get(a) === b
  cache.set(a, b)

  // 处理数组
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false

    for (let i = 0; i < a.length; i++) {
      if (!smartDeepEqual(a[i], b[i], cache)) return false
    }
    return true
  }

  // 处理对象
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  // 使用Set提高查找性能
  const keysSet = new Set(keysB)

  for (const key of keysA) {
    if (!keysSet.has(key)) return false
    if (!smartDeepEqual(a[key], b[key], cache)) return false
  }

  return true
}

/**
 * 检查路径是否存在于对象中
 * @param {Object} obj - 要检查的对象
 * @param {string} path - 路径字符串
 * @param {boolean} debug - 是否启用调试模式
 * @returns {boolean} 路径是否存在
 */
function checkPathExists(obj, path, debug = false) {
  if (!obj || !path || typeof path !== 'string') return false

  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current = obj
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]

    if (current == null || typeof current !== 'object') {
      if (debug) {
        console.warn(`[PropertySyncer] 路径 "${path}" 访问失败: 在 "${segments.slice(0, i).join('.')}" 处无法访问 "${segment}"`)
      }
      return false
    }

    if (!(segment in current)) {
      if (debug) {
        console.warn(`[PropertySyncer] 路径 "${path}" 不存在: 属性 "${segment}" 在对象中未找到`)
      }
      return false
    }

    current = current[segment]
  }

  return true
}

/**
 * 编译路径为访问函数，带缓存优化
 * @param {string} path - 要编译的路径字符串
 * @returns {Function} 返回路径访问函数
 */
const pathCache = new Map()

function compilePath(path) {
  if (pathCache.has(path)) return pathCache.get(path)

  try {
    const segments = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean)

    const fn = (obj, debug = false) => {
      let current = obj

      // 路径检测和调试输出
      if (debug && current != null) {
        const exists = checkPathExists(current, path, debug)
        if (!exists && debug) {
          console.warn(`[PropertySyncer] 路径 "${path}" 在对象中不存在，返回 undefined`)
        }
      }

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
  } catch {
    const fn = () => undefined
    pathCache.set(path, fn)
    return fn
  }
}

/**
 * 安全获取对象深层属性
 * @param {Object} obj - 源对象
 * @param {string} path - 路径字符串，支持 a.b[0].c 形式
 * @param {boolean} debug - 是否启用调试模式
 * @returns {any} 返回路径对应的值，如果路径不存在返回undefined
 */
function getByPath(obj, path, debug = false) {
  if (!obj || !path || typeof path !== 'string') return undefined
  return compilePath(path)(obj, debug)
}

/**
 * 优化数组更新，减少不必要的操作
 * @param {Array} targetArray - 目标数组
 * @param {Array} newArray - 新数组
 */
function updateArray(targetArray, newArray) {
  if (!Array.isArray(newArray) || !Array.isArray(targetArray)) return

  const minLength = Math.min(targetArray.length, newArray.length)

  // 更新已有位置的元素
  for (let i = 0; i < minLength; i++) {
    const newItem = newArray[i]
    const targetItem = targetArray[i]

    if (newItem === null || typeof newItem !== 'object') {
      if (targetItem !== newItem) {
        targetArray[i] = newItem
      }
      continue
    }

    if (targetItem && typeof targetItem === 'object') {
      // 合并对象属性
      if (Array.isArray(newItem) && Array.isArray(targetItem)) {
        if (!smartDeepEqual(targetItem, newItem)) {
          targetArray[i] = [...newItem]
        }
      } else if (!Array.isArray(newItem) && !Array.isArray(targetItem)) {
        // 浅合并对象
        Object.assign(targetItem, newItem)
      } else {
        targetArray[i] = Array.isArray(newItem) ? [...newItem] : { ...newItem }
      }
    } else {
      targetArray[i] = Array.isArray(newItem) ? [...newItem] : { ...newItem }
    }
  }

  // 添加新元素
  if (newArray.length > targetArray.length) {
    for (let i = targetArray.length; i < newArray.length; i++) {
      const item = newArray[i]
      targetArray.push(Array.isArray(item) ? [...item] : { ...item })
    }
  }
  // 删除多余元素
  else if (newArray.length < targetArray.length) {
    targetArray.splice(newArray.length)
  }
}

/**
 * 验证配置项的有效性
 * @param {Object} item - 配置项
 * @param {number} index - 配置项索引
 * @returns {Object} 返回验证后的配置项
 * @throws {Error} 如果配置项无效则抛出错误
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
    deep: item.deep !== undefined ? Boolean(item.deep) : undefined
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
  const { path, target, transform, comparator, deep: itemDeep } = validatedItem
  const useDeep = itemDeep !== undefined ? itemDeep : globalDeep

  return (sourceValue, oldSourceValue) => {
    // 第一步：比较值是否变化
    const isDifferent = useDeep
      ? !smartDeepEqual(sourceValue, oldSourceValue, new WeakMap())
      : sourceValue !== oldSourceValue

    if (!isDifferent) return

    // 第二步：执行comparator（如果有）
    let shouldUpdate = true

    if (comparator) {
      try {
        const comparatorResult = comparator(sourceValue, oldSourceValue)

        if (typeof comparatorResult !== 'boolean') {
          if (debug) {
            console.warn(`[PropertySyncer] comparator 应返回布尔值，路径: ${path}`)
          }
        } else {
          shouldUpdate = comparatorResult === true
        }
      } catch (error) {
        if (debug) {
          console.error(`[PropertySyncer] comparator 执行失败，路径: ${path}`, error)
        }
      }
    }

    if (!shouldUpdate) return

    // 第三步：执行transform
    let finalValue
    try {
      const transformedValue = transform(sourceValue)

      if (typeof transformedValue === 'undefined') {
        if (debug) {
          console.warn(`[PropertySyncer] transform 未返回值，使用原始值，路径: ${path}`)
        }
        finalValue = sourceValue
      } else {
        finalValue = transformedValue
      }
    } catch (error) {
      if (debug) {
        console.error(`[PropertySyncer] transform 执行失败，路径: ${path}`, error)
      }
      finalValue = sourceValue
    }

    // 第四步：更新目标
    try {
      if (Array.isArray(finalValue) && Array.isArray(target.value)) {
        updateArray(target.value, finalValue)
      } else {
        target.value = finalValue
      }
    } catch (error) {
      if (debug) {
        console.error(`[PropertySyncer] 更新目标失败，路径: ${path}`, error)
      }
    }
  }
}

/**
 * PropertySyncer - 属性同步器
 * 支持 transform、comparator、deep、immediate 配置
 * @param {Object|Ref} source - 源对象或响应式引用
 * @param {Array|Object} mappings - 映射配置数组或对象
 * @param {Object} options - 配置选项
 * @param {boolean} options.immediate - 是否立即执行
 * @param {boolean} options.deep - 是否深度监听
 * @param {boolean} options.debug - 是否启用调试模式
 * @returns {Function} 返回清理函数，用于停止监听
 */
export function PropertySyncer(source, mappings = {}, options = {}) {
  const {
    immediate = true,
    deep = false,
    debug = true  // 默认开启调试模式
  } = options

  // 统一配置格式
  const mapsArray = Array.isArray(mappings)
    ? mappings
    : Object.entries(mappings).map(([path, target]) => ({ path, target }))

  if (mapsArray.length === 0) {
    if (debug) {
      console.warn('[PropertySyncer] 未提供有效的映射配置')
    }
    return () => { }
  }

  const stops = []
  const warnedPaths = new Set() // 记录已警告的路径，避免重复警告

  for (const [index, item] of mapsArray.entries()) {
    try {
      const validatedItem = validateMapping(item, index)
      const watcherHandler = createWatcherHandler(validatedItem, deep, debug)

      // 创建响应式监听
      const stop = watch(
        () => {
          const src = unref(source)
          const value = getByPath(src, validatedItem.path, debug)

          // 路径检测和调试输出
          if (debug && src != null && value === undefined && !warnedPaths.has(validatedItem.path)) {
            const pathExists = checkPathExists(src, validatedItem.path, false)
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
          deep: false // 我们自己处理深度比较
        }
      )

      stops.push(stop)

      if (debug) {
        // console.log(`[PropertySyncer] 已监听路径: ${validatedItem.path}`)
      }
    } catch (error) {
      if (debug) {
        console.error(`[PropertySyncer] 配置项 ${index} 初始化失败:`, error)
      }
    }
  }

  // 返回清理函数
  return () => {
    for (const stop of stops) {
      try {
        stop()
      } catch (error) {
        if (debug) {
          console.error('[PropertySyncer] 清理监听器失败:', error)
        }
      }
    }
    stops.length = 0
    warnedPaths.clear()
  }
}

/**
 * usePropertySyncBlock - 模块化同步块
 * 支持自动解绑与增强功能
 * @param {Object|Ref} source - 源对象或响应式引用
 * @param {Function} getMappings - 获取映射配置的函数
 * @param {Object} options - 配置选项
 * @param {boolean} options.immediate - 是否立即执行
 * @param {boolean} options.deep - 是否深度监听
 * @param {boolean} options.debug - 是否启用调试模式
 * @returns {Function} 返回清理函数，用于停止监听
 */
export function usePropertySyncBlock(source, getMappings, options = {}) {
  const {
    immediate = true,
    deep = false,
    debug = true  // 默认开启调试模式
  } = options

  let stopSync = null

  try {
    const mappings = getMappings()
    stopSync = PropertySyncer(source, mappings, { immediate, deep, debug })
  } catch (error) {
    if (debug) {
      console.error('[usePropertySyncBlock] 初始化失败:', error)
    }
    // 返回一个空清理函数
    return () => { }
  }

  onUnmounted(() => {
    if (stopSync) {
      stopSync()
      stopSync = null
    }
  })

  return stopSync
}

// 导出工具函数，方便测试和扩展
export const utils = {
  smartDeepEqual,
  getByPath,
  updateArray,
  compilePath,
  checkPathExists
}

export default {
  PropertySyncer,
  usePropertySyncBlock,
  utils
}
