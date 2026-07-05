export const codeDemo = `
/**
 * 监控 SDK 的核心 Monitor 类
 */
import DataReporter from '../transport/index.js'
import {
	isObject,
	isString,
	isNumber,
	isFunction,
	getBrowserInfo,
	getDeviceInfo,
	getCurrentPageUrl,
	getTimestamp,
	generateUniqueId,
} from '../utils/index.js'
import { initPlugins } from '../plugins/index.js'

/**
 * Monitor 的默认配置
 */
const DEFAULT_CONFIG = {
	appId: '',
	reportUrl: '',
	userId: null,
	sampling: 1, // 100% 采样
	plugins: [], // 启用的插件名称列表。如 ['jsError', 'resourceError', 'pv']
	maxQueueSize: 10, // 队列满时自动发送的最大项目数
	reportInterval: 0, // 报告间隔（毫秒） 0表示不定时发送
	pluginsConfig: {}, // 插件配置
}

/**
 * Monitor 类 - 监控 SDK 的核心
 */
class Monitor {
	/**
	 * 创建新的 Monitor 实例
	 * @param {Object} config - 配置对象
	 */
	constructor(config) {
		if (!isObject(config)) {
			throw new Error('Monitor 配置必须是一个对象')
		}

		if (!isString(config.appId) || !config.appId) {
			throw new Error('appId 是必需的，并且必须是非空字符串')
		}

		if (!isString(config.reportUrl) || !config.reportUrl) {
			throw new Error('reportUrl 是必需的，并且必须是非空字符串')
		}

		// 将默认配置与用户配置合并
		this.config = { ...DEFAULT_CONFIG, ...config }

		// 验证采样率
		if (!isNumber(this.config.sampling) || this.config.sampling < 0 || this.config.sampling > 1) {
			this.config.sampling = 1 // 如果无效，默认为 100%
			console.warn('无效的采样率。使用默认值 (1)。')
		}

		// 初始化状态
		this.plugins = {} // 已加载的插件
		this.queue = [] // 数据批处理队列
		this.initialized = false // SDK 是否已初始化
		this.sessionId = generateUniqueId() // 生成唯一会话 ID
		this.eventListeners = {} // 事件监听器
	}

	/**
	 * 初始化 Monitor
	 * @returns {Monitor} - 用于链式调用的 Monitor 实例
	 */
	init() {
		if (this.initialized) {
			console.warn('Monitor 已经初始化')
			return this
		}

		console.log('正在初始化 Monitor SDK:', this.config)

		// 加载插件
		this.loadPlugins()

		// 启动报告周期
		if (isNumber(this.config.reportInterval) && this.config.reportInterval > 0) {
			this.startReportingCycle()
		}

		// 设置页面卸载处理程序
		if (typeof window !== 'undefined') {
			// 确保在用户离开页面之前，将队列中所有待发送的监控数据都发送出去，防止数据丢失
			window.addEventListener('beforeunload', this.flushQueue.bind(this))
		}

		this.initialized = true
		return this
	}

	/**
	 * 加载配置中指定的插件
	 * @private
	 */
	loadPlugins() {
		// 初始化插件
		this.plugins = initPlugins(this)

		console.log('已加载插件:', Object.keys(this.plugins))
	}

	/**
	 * 启动报告周期
	 * @private
	 */
	startReportingCycle() {
		if (typeof window !== 'undefined') {
			this.reportingInterval = setInterval(() => {
				this.flushQueue()
			}, this.config.reportInterval)
		}
	}

	/**
	 * 将数据发送到服务器
	 * @param {Object} data - 要发送的数据
	 * @returns {boolean} - 数据是否被接受发送
	 */
	send(data) {
		// 应用采样
		if (Math.random() >= this.config.sampling) {
			return false // 由于采样而丢弃
		}

		// 添加公共字段
		const reportData = {
			id: generateUniqueId(), // 添加唯一ID
			appId: this.config.appId,
			userId: this.config.userId,
			sessionId: this.sessionId,
			timestamp: getTimestamp(),
			pageUrl: getCurrentPageUrl(),
			userAgent: navigator.userAgent,
			...getBrowserInfo(),
			...getDeviceInfo(),
			...data,
		}

		// 添加到队列
		this.queue.push(reportData)

		console.log('捕获数据已入队:', this.queue.length, reportData.type, reportData.subType, reportData)

		// 触发相应类型的事件
		if (reportData.type) {
			this.emit(reportData.type, reportData)

			// 如果有子类型，也触发子类型事件
			if (reportData.subType) {
			}
		}

		// 如果队列已满，自动刷新
		if (this.queue.length >= this.config.maxQueueSize) {
			this.flushQueue()
		}

		return true
	}

	/**
	 * 获取当前队列中的数据
	 */
	getQueue() {
		return this.queue
	}

	/**
	 * 刷新队列并将数据发送到服务器
	 * @returns {boolean} - 是否尝试了刷新
	 */
	flushQueue() {
		if (this.queue.length === 0) {
			return false
		}

		const dataToSend = this.queue.slice()
		this.queue = []

		// 将数据发送到服务器
		DataReporter.report(this.config.reportUrl, dataToSend)
		return true
	}

	/**
	 * 手动报告错误
	 * @param {Error|string} error - 要报告的错误
	 * @param {Object} extraInfo - 要包含在错误中的额外信息
	 * @returns {boolean} - 是否报告了错误
	 */
	reportError(error, extraInfo = {}) {
		let errorData = {
			type: 'error',
			subType: 'manual',
			level: 'error',
			...extraInfo,
		}

		if (error instanceof Error) {
			errorData = {
				...errorData,
				message: error.message,
				stack: error.stack,
				name: error.name,
			}
		} else {
			errorData.message = String(error)
		}

		// 先触发错误事件，让录屏等插件有机会处理
		this.emit('error', errorData)

		// 然后发送错误数据
		const result = this.send(errorData)

		// 错误立即刷新
		if (result) {
			this.flushQueue()
		}

		return result
	}

	/**
	 * 报告自定义事件
	 * @param {string} eventName - 事件名称
	 * @param {Object} eventData - 事件数据
	 * @returns {boolean} - 是否报告了事件
	 */
	reportEvent(eventName, eventData = {}) {
		return this.send({
			type: 'custom_event',
			name: eventName,
			data: eventData,
		})
	}

	/**
	 * 设置用户信息
	 * @param {string} userId - 用户 ID
	 * @param {Object} userInfo - 额外的用户信息
	 */
	setUser(userId, userInfo = {}) {
		this.config.userId = userId

		// 报告用户更新事件
		this.reportEvent('user_update', { userId, ...userInfo })
	}

	/**
	 * 销毁监控实例并清理资源
	 */
	destroy() {
		// 刷新任何剩余数据
		this.flushQueue()

		// 清除报告间隔
		if (this.reportingInterval) {
			clearInterval(this.reportingInterval)
		}

		// 移除事件监听器
		if (typeof window !== 'undefined') {
			window.removeEventListener('beforeunload', this.flushQueue.bind(this))
		}

		// 清空所有事件监听器
		this.eventListeners = {}

		// 标记为未初始化
		this.initialized = false

		console.log('Monitor SDK 已销毁')
	}
}

export default Monitor

`
