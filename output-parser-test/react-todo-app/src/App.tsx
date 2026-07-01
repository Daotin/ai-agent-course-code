import { useState, useEffect } from 'react'
import './App.css'

interface Todo {
  id: number
  text: string
  completed: boolean
}

type FilterType = 'all' | 'active' | 'completed'

function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('todos')
    return saved ? JSON.parse(saved) : []
  })
  const [inputValue, setInputValue] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  // 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos])

  // 添加待办事项
  const handleAddTodo = () => {
    if (inputValue.trim()) {
      const newTodo: Todo = {
        id: Date.now(),
        text: inputValue.trim(),
        completed: false
      }
      setTodos([...todos, newTodo])
      setInputValue('')
    }
  }

  // 删除待办事项
  const handleDeleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  // 切换完成状态
  const handleToggleComplete = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ))
  }

  // 开始编辑
  const handleEditStart = (todo: Todo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
  }

  // 保存编辑
  const handleEditSave = (id: number) => {
    if (editText.trim()) {
      setTodos(todos.map(todo =>
        todo.id === id ? { ...todo, text: editText.trim() } : todo
      ))
    }
    setEditingId(null)
    setEditText('')
  }

  // 取消编辑
  const handleEditCancel = () => {
    setEditingId(null)
    setEditText('')
  }

  // 过滤待办事项
  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  })

  // 统计信息
  const totalTodos = todos.length
  const completedTodos = todos.filter(todo => todo.completed).length
  const activeTodos = totalTodos - completedTodos

  // 处理回车键
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTodo()
    }
  }

  return (
    <div className="app-container">
      <div className="todo-card">
        <h1 className="app-title">📝 Todo List</h1>
        
        {/* 输入区域 */}
        <div className="input-section">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="添加新的待办事项..."
            className="todo-input"
          />
          <button onClick={handleAddTodo} className="add-button">
            添加
          </button>
        </div>

        {/* 筛选按钮 */}
        <div className="filter-section">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 ({totalTodos})
          </button>
          <button
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            进行中 ({activeTodos})
          </button>
          <button
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            已完成 ({completedTodos})
          </button>
        </div>

        {/* 待办列表 */}
        <div className="todo-list">
          {filteredTodos.length === 0 ? (
            <div className="empty-state">
              <p>暂无待办事项</p>
            </div>
          ) : (
            filteredTodos.map(todo => (
              <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                {editingId === todo.id ? (
                  <div className="edit-mode">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEditSave(todo.id)}
                      className="edit-input"
                    />
                    <div className="edit-buttons">
                      <button onClick={() => handleEditSave(todo.id)} className="save-btn">✓</button>
                      <button onClick={handleEditCancel} className="cancel-btn">✗</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="todo-label">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggleComplete(todo.id)}
                        className="todo-checkbox"
                      />
                      <span className={`todo-text ${todo.completed ? 'line-through' : ''}`}>
                        {todo.text}
                      </span>
                    </label>
                    <div className="todo-actions">
                      <button onClick={() => handleEditStart(todo)} className="action-btn edit">
                        编辑
                      </button>
                      <button onClick={() => handleDeleteTodo(todo.id)} className="action-btn delete">
                        删除
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* 统计信息 */}
        <div className="stats-section">
          <div className="stat-item">
            <span className="stat-number">{totalTodos}</span>
            <span className="stat-label">总数量</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{activeTodos}</span>
            <span className="stat-label">进行中</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{completedTodos}</span>
            <span className="stat-label">已完成</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
