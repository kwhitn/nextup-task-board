import { useEffect, useRef, useState } from 'react'
import './App.css'

const EFFORT_LEVELS = [
  { value: 1, label: 'Quick', hint: '~15 min' },
  { value: 2, label: 'Light', hint: '~1 hr' },
  { value: 3, label: 'Medium', hint: '2–3 hrs' },
  { value: 4, label: 'Heavy', hint: '4–6 hrs' },
  { value: 5, label: 'Huge', hint: '6+ hrs' },
]

const SUBJECT_PALETTE = ['#a8d5aa', '#ceda8b', '#8bd2b9', '#e3c17d', '#d2a5d0', '#e1a28b']
const HOUSEHOLD_COLOR = '#91c69a'
const STORAGE_KEY = 'nextup-tasks'
const SETTINGS_KEY = 'nextup-settings'

function buildHouseholdPreset() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const makeTask = (name, offsetDays, effort) => {
    const due = new Date(today)
    due.setDate(due.getDate() + offsetDays)
    return {
      id: `hh-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      subject: 'Household',
      dueDate: due.toISOString().slice(0, 10),
      effort,
      household: true,
      completed: false,
      subtasks: [],
      actualEffort: null,
      createdAt: Date.now(),
    }
  }
  return [
    makeTask('Wash dishes', 0, 1),
    makeTask('Wipe kitchen counters', 1, 2),
    makeTask('Take out trash', 1, 1),
    makeTask('Clean bathroom', 2, 4),
    makeTask('Vacuum living areas', 3, 3),
    makeTask('Mop floors', 4, 3),
    makeTask('Laundry', 4, 2),
    makeTask('Dust surfaces', 5, 2),
    makeTask('Change bed sheets', 6, 2),
  ]
}

function effortMeta(value) {
  return EFFORT_LEVELS.find((item) => item.value === Number(value)) || EFFORT_LEVELS[2]
}

function daysUntil(dueDate) {
  const due = new Date(`${dueDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due - today) / 86400000)
}

function urgencyBucket(days) {
  if (days <= 0) return 5
  if (days <= 2) return 4
  if (days <= 4) return 3
  if (days <= 7) return 2
  return 1
}

function computeScore(task) {
  return urgencyBucket(daysUntil(task.dueDate)) * 5 + Number(task.effort)
}

function dueLabel(days) {
  if (days < 0) return `OVERDUE · ${Math.abs(days)}D`
  if (days === 0) return 'DUE TODAY'
  if (days === 1) return 'DUE TOMORROW'
  return `DUE IN ${days}D`
}

function sortTasks(tasks, mode) {
  return [...tasks].sort((a, b) => {
    if (mode === 'effort-desc') {
      if (b.effort !== a.effort) return b.effort - a.effort
      return computeScore(b) - computeScore(a)
    }
    if (mode === 'effort-asc') {
      if (a.effort !== b.effort) return a.effort - b.effort
      return computeScore(b) - computeScore(a)
    }
    const scoreDifference = computeScore(b) - computeScore(a)
    return scoreDifference || new Date(a.dueDate) - new Date(b.dueDate)
  })
}

function normalizeTask(task) {
  return {
    ...task,
    subject: task.subject || '',
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    actualEffort: task.actualEffort || null,
    household: !!task.household,
  }
}

function readTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw).map(normalizeTask) : []
  } catch {
    return []
  }
}

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return {
      householdEnabled: typeof parsed.householdEnabled === 'boolean' ? parsed.householdEnabled : false,
    }
  } catch {
    return { householdEnabled: false }
  }
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function subjectColor(subject) {
  const value = subject && subject.trim() ? subject.trim() : 'General'
  if (value.toLowerCase() === 'household') return HOUSEHOLD_COLOR
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash)
  }
  return SUBJECT_PALETTE[Math.abs(hash) % SUBJECT_PALETTE.length]
}

function Segments({ filled, tone }) {
  return (
    <div className="nu-segs" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((level) => (
        <span key={level} className={`nu-seg ${level <= filled ? `nu-seg-on nu-seg-${tone}` : ''}`} />
      ))}
    </div>
  )
}

function EffortSelect({ value, onChange, id }) {
  return (
    <select id={id} className="nu-input" value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {EFFORT_LEVELS.map((item) => (
        <option key={item.value} value={item.value}>{item.label} · {item.hint}</option>
      ))}
    </select>
  )
}

function SubjectTag({ subject }) {
  if (!subject || !subject.trim()) return null
  const color = subjectColor(subject)
  return <span className="nu-tag" style={{ color, borderColor: `${color}77`, background: `${color}22` }}>{subject.trim()}</span>
}

function NextUp() {
  const [initialSettings] = useState(readSettings)
  const [tasks, setTasks] = useState(readTasks)
  const [saveError, setSaveError] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [effort, setEffort] = useState(3)
  const [formError, setFormError] = useState('')
  const [sortMode, setSortMode] = useState('score')
  const [groupBySubject, setGroupBySubject] = useState(false)
  const [householdEnabled, setHouseholdEnabled] = useState(initialSettings.householdEnabled)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ name: '', subject: '', dueDate: '', effort: 3 })
  const [expanded, setExpanded] = useState({})
  const [subtaskDraft, setSubtaskDraft] = useState({})
  const [showCompleted, setShowCompleted] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [editingActualId, setEditingActualId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const confirmTimer = useRef(null)

  useEffect(() => () => clearTimeout(confirmTimer.current), [])

  function persistSettings(next) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch {
      // Settings are non-essential.
    }
  }

  function persist(next) {
    setTasks(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }

  function toggleHousehold() {
    const next = !householdEnabled
    setHouseholdEnabled(next)
    persistSettings({ householdEnabled: next })
    if (next && !tasks.some((task) => task.household)) {
      persist([...tasks, ...buildHouseholdPreset()])
    }
  }

  function resetHousehold() {
    persist([...tasks.filter((task) => !task.household), ...buildHouseholdPreset()])
  }

  function handleAdd() {
    if (!name.trim()) return setFormError('Give the assignment a name.')
    if (!dueDate) return setFormError('Pick a due date.')
    setFormError('')
    persist([...tasks, {
      id: makeId(), name: name.trim(), subject: subject.trim(), dueDate, effort: Number(effort),
      completed: false, subtasks: [], actualEffort: null, createdAt: Date.now(),
    }])
    setName('')
    setSubject('')
    setDueDate('')
    setEffort(3)
  }

  function toggleComplete(id) {
    persist(tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task))
  }

  function startEdit(task) {
    setEditingId(task.id)
    setEditDraft({ name: task.name, subject: task.subject || '', dueDate: task.dueDate, effort: task.effort })
  }

  function saveEdit() {
    if (!editDraft.name.trim() || !editDraft.dueDate) return
    persist(tasks.map((task) => task.id === editingId ? {
      ...task,
      name: editDraft.name.trim(),
      subject: editDraft.subject.trim(),
      dueDate: editDraft.dueDate,
      effort: Number(editDraft.effort),
    } : task))
    setEditingId(null)
  }

  function requestDelete(id) {
    if (confirmDeleteId === id) {
      clearTimeout(confirmTimer.current)
      setConfirmDeleteId(null)
      persist(tasks.filter((task) => task.id !== id))
      return
    }
    setConfirmDeleteId(id)
    clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000)
  }

  function addSubtask(taskId) {
    const text = (subtaskDraft[taskId] || '').trim()
    if (!text) return
    persist(tasks.map((task) => task.id === taskId ? {
      ...task,
      subtasks: [...task.subtasks, { id: makeId(), text, done: false }],
    } : task))
    setSubtaskDraft((previous) => ({ ...previous, [taskId]: '' }))
  }

  function toggleSubtask(taskId, subId) {
    persist(tasks.map((task) => task.id === taskId ? {
      ...task,
      subtasks: task.subtasks.map((subtask) => subtask.id === subId ? { ...subtask, done: !subtask.done } : subtask),
    } : task))
  }

  function deleteSubtask(taskId, subId) {
    persist(tasks.map((task) => task.id === taskId ? {
      ...task,
      subtasks: task.subtasks.filter((subtask) => subtask.id !== subId),
    } : task))
  }

  function setActualEffort(taskId, value) {
    persist(tasks.map((task) => task.id === taskId ? { ...task, actualEffort: Number(value) } : task))
    setEditingActualId(null)
  }

  const active = tasks.filter((task) => !task.completed && (householdEnabled || !task.household))
  const completed = tasks.filter((task) => task.completed && (householdEnabled || !task.household))
  const overdueCount = active.filter((task) => daysUntil(task.dueDate) < 0).length
  const dueThisWeekCount = active.filter((task) => {
    const days = daysUntil(task.dueDate)
    return days >= 0 && days <= 7
  }).length
  const sortedActive = sortTasks(active, sortMode)
  const rankMap = new Map(sortedActive.map((task, index) => [task.id, index + 1]))
  const subjectOptions = Array.from(new Set(tasks.map((task) => task.subject).filter((value) => value && value.trim()))).sort()
  const loggedTasks = completed.filter((task) => task.actualEffort)
  const averageDifference = loggedTasks.length
    ? loggedTasks.reduce((sum, task) => sum + task.actualEffort - task.effort, 0) / loggedTasks.length
    : 0
  const insightsSummary = !loggedTasks.length ? null
    : Math.abs(averageDifference) < 0.35 ? 'Your effort estimates track pretty closely, on average.'
      : averageDifference > 0
        ? `You tend to underestimate effort — actual runs about ${averageDifference.toFixed(1)} level(s) higher than your estimate, on average.`
        : `You tend to overestimate effort — actual runs about ${Math.abs(averageDifference).toFixed(1)} level(s) lower than your estimate, on average.`

  const groups = groupBySubject ? Array.from(sortedActive.reduce((map, task) => {
    const key = task.subject && task.subject.trim() ? task.subject.trim() : 'General'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(task)
    return map
  }, new Map())) : null

  function renderTaskRow(task, index) {
    const days = daysUntil(task.dueDate)
    const urgency = urgencyBucket(days)
    const effortInfo = effortMeta(task.effort)
    const score = computeScore(task)
    const isExpanded = !!expanded[task.id]
    const doneCount = task.subtasks.filter((subtask) => subtask.done).length
    const rank = rankMap.get(task.id)

    if (editingId === task.id) {
      return (
        <div className="nu-edit-row" key={task.id}>
          <div className="nu-rank">{rank}</div>
          <div>
            <div className="nu-edit-fields">
              <div className="nu-field nu-field-name"><label className="nu-label">Assignment</label><input className="nu-input" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} /></div>
              <div className="nu-field"><label className="nu-label">Subject</label><input className="nu-input" list="nu-subjects" value={editDraft.subject} onChange={(event) => setEditDraft({ ...editDraft, subject: event.target.value })} /></div>
              <div className="nu-field"><label className="nu-label">Due date</label><input className="nu-input" type="date" value={editDraft.dueDate} onChange={(event) => setEditDraft({ ...editDraft, dueDate: event.target.value })} /></div>
              <div className="nu-field"><label className="nu-label">Effort</label><EffortSelect value={editDraft.effort} onChange={(value) => setEditDraft({ ...editDraft, effort: value })} /></div>
            </div>
            <div className="nu-edit-actions"><button className="nu-btn nu-btn-primary" onClick={saveEdit}>Save</button><button className="nu-icon-btn" onClick={() => setEditingId(null)}>Cancel</button></div>
          </div>
        </div>
      )
    }

    return (
      <div className="nu-task-wrap" key={task.id}>
        <div className="nu-task-row" style={{ animationDelay: `${index * 35}ms` }}>
          <div className={`nu-rank ${rank <= 3 ? 'nu-rank-top' : ''}`}>{rank}</div>
          <div className="nu-main">
            <button className="nu-name-btn" onClick={() => setExpanded((previous) => ({ ...previous, [task.id]: !previous[task.id] }))} aria-expanded={isExpanded}>
              <span className="nu-caret">{isExpanded ? '▾' : '▸'}</span><span className="nu-task-name">{task.name}</span>
            </button>
            <div className="nu-meta-row">
              <span className={`nu-due ${days < 0 ? 'nu-due-overdue' : urgency >= 4 ? 'nu-due-urgent' : ''}`}>{dueLabel(days)}</span>
              <SubjectTag subject={task.subject} />
              {task.subtasks.length > 0 && <span className="nu-subtask-count">{doneCount}/{task.subtasks.length} done</span>}
            </div>
          </div>
          <div className="nu-bars">
            <div className="nu-bars-row"><span className="nu-bars-cap">URG</span><Segments filled={urgency} tone="amber" /></div>
            <div className="nu-bars-row"><span className="nu-bars-cap">EFF</span><Segments filled={effortInfo.value} tone="green" /></div>
          </div>
          <div className="nu-score"><div className="nu-score-num">{score}</div><div className="nu-score-label">score</div></div>
          <div className="nu-actions">
            <input type="checkbox" className="nu-checkbox" checked={false} onChange={() => toggleComplete(task.id)} aria-label={`Mark ${task.name} complete`} />
            <button className="nu-icon-btn" onClick={() => startEdit(task)}>Edit</button>
            <button className={`nu-icon-btn ${confirmDeleteId === task.id ? 'nu-icon-btn-danger' : ''}`} onClick={() => requestDelete(task.id)}>{confirmDeleteId === task.id ? 'Confirm?' : 'Delete'}</button>
          </div>
        </div>
        {isExpanded && (
          <div className="nu-subtask-panel">
            {task.subtasks.length > 0 && <div className="nu-subtask-list">
              {task.subtasks.map((subtask) => (
                <div className="nu-subtask-item" key={subtask.id}>
                  <input type="checkbox" className="nu-checkbox nu-checkbox-sm" checked={subtask.done} onChange={() => toggleSubtask(task.id, subtask.id)} aria-label={subtask.text} />
                  <span className={subtask.done ? 'nu-subtask-done' : ''}>{subtask.text}</span>
                  <button className="nu-subtask-del" onClick={() => deleteSubtask(task.id, subtask.id)} aria-label={`Delete ${subtask.text}`}>×</button>
                </div>
              ))}
            </div>}
            <div className="nu-subtask-add">
              <input className="nu-input nu-input-sm" placeholder="Add a step…" value={subtaskDraft[task.id] || ''} onChange={(event) => setSubtaskDraft((previous) => ({ ...previous, [task.id]: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && addSubtask(task.id)} />
              <button className="nu-icon-btn" onClick={() => addSubtask(task.id)}>Add step</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="nu-app">
      <datalist id="nu-subjects">{subjectOptions.map((value) => <option value={value} key={value} />)}</datalist>
      <header className="nu-header">
        <div><h1 className="nu-title">Next<span className="nu-title-accent">Up</span></h1><p className="nu-subtitle">Weekly departure board for your assignments</p></div>
        <div className="nu-stats">
          <div className="nu-stat"><span className="nu-stat-num">{active.length}</span><span className="nu-stat-label">On board</span></div>
          <div className="nu-stat nu-stat-danger"><span className="nu-stat-num">{overdueCount}</span><span className="nu-stat-label">Overdue</span></div>
          <div className="nu-stat"><span className="nu-stat-num">{dueThisWeekCount}</span><span className="nu-stat-label">This week</span></div>
        </div>
      </header>

      {saveError && <div className="nu-save-error">Couldn’t save your last change. Check available browser storage, then try editing again.</div>}

      <section className="nu-household-panel">
        <div><div className="nu-household-title">Household chores</div><div className="nu-household-sub">Fold a preset weekly cleaning schedule into the board, or leave it off to track school and work only.</div></div>
        <div className="nu-household-controls">
          {householdEnabled && <button className="nu-icon-btn" onClick={resetHousehold}>Reset chores</button>}
          <button className={`nu-switch ${householdEnabled ? 'on' : ''}`} onClick={toggleHousehold} role="switch" aria-checked={householdEnabled} aria-label="Toggle household chores"><span className="nu-switch-knob" /></button>
        </div>
      </section>

      <form className="nu-panel" onSubmit={(event) => { event.preventDefault(); handleAdd() }}>
        <div className="nu-field-row">
          <div className="nu-field nu-field-name"><label className="nu-label" htmlFor="nu-name">Assignment</label><input id="nu-name" className="nu-input" placeholder="e.g. Chem lab report" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="nu-field"><label className="nu-label" htmlFor="nu-subject">Subject</label><input id="nu-subject" className="nu-input" list="nu-subjects" placeholder="e.g. Chemistry" value={subject} onChange={(event) => setSubject(event.target.value)} /></div>
          <div className="nu-field"><label className="nu-label" htmlFor="nu-date">Due date</label><input id="nu-date" className="nu-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
          <div className="nu-field"><label className="nu-label" htmlFor="nu-effort">Effort</label><EffortSelect id="nu-effort" value={effort} onChange={setEffort} /></div>
          <button className="nu-btn nu-btn-primary" type="submit">Add to board</button>
        </div>
        {formError && <div className="nu-form-error" role="alert">{formError}</div>}
      </form>

      {active.length > 0 && <div className="nu-sort-row">
        {active.length > 1 && <>
          <span className="nu-sort-label">Sort</span>
          <div className="nu-sort-toggle">
            <button className={`nu-sort-btn ${sortMode === 'score' ? 'active' : ''}`} onClick={() => setSortMode('score')}>Priority score</button>
            <button className={`nu-sort-btn ${sortMode === 'effort-desc' ? 'active' : ''}`} onClick={() => setSortMode('effort-desc')}>Most effort first</button>
            <button className={`nu-sort-btn ${sortMode === 'effort-asc' ? 'active' : ''}`} onClick={() => setSortMode('effort-asc')}>Least effort first</button>
          </div>
          <button className={`nu-group-toggle ${groupBySubject ? 'active' : ''}`} onClick={() => setGroupBySubject(!groupBySubject)}>Group by subject</button>
        </>}
      </div>}

      <div className="nu-list">
        {sortedActive.length === 0 ? <div className="nu-empty"><div className="nu-empty-title">Board’s clear</div><div className="nu-empty-sub">Add an assignment above to start ranking your week.</div></div>
          : groups ? groups.map(([subjectName, groupTasks]) => <section key={subjectName}>
            <div className="nu-group-header"><span className="nu-group-dot" style={{ background: subjectColor(subjectName) }} /><span className="nu-group-name">{subjectName}</span><span className="nu-group-count">{groupTasks.length}</span></div>
            {groupTasks.map(renderTaskRow)}
          </section>) : sortedActive.map(renderTaskRow)}
          </div>

      {completed.length > 0 && <section>
        <button className="nu-section-toggle" onClick={() => setShowCompleted(!showCompleted)}>Completed ({completed.length}) {showCompleted ? '▲' : '▼'}</button>
        {showCompleted && <div className="nu-completed-list">{completed.map((task) => <div className="nu-completed-row" key={task.id}>
          <div className="nu-completed-main"><span className="nu-completed-name">{task.name}</span><SubjectTag subject={task.subject} /></div>
          <div className="nu-completed-actual">
            {task.actualEffort ? <button className="nu-actual-set" onClick={() => setEditingActualId(task.id)}>est {effortMeta(task.effort).label} → actual {effortMeta(task.actualEffort).label}</button>
              : editingActualId === task.id ? <select className="nu-input nu-input-sm" defaultValue="" onChange={(event) => setActualEffort(task.id, event.target.value)} onBlur={() => setEditingActualId(null)} autoFocus>
                <option value="" disabled>Actual effort…</option>{EFFORT_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.hint}</option>)}
              </select> : <button className="nu-actual-link" onClick={() => setEditingActualId(task.id)}>+ log actual</button>}
          </div>
          <div className="nu-completed-actions"><button className="nu-icon-btn" onClick={() => toggleComplete(task.id)}>Restore</button><button className={`nu-icon-btn ${confirmDeleteId === task.id ? 'nu-icon-btn-danger' : ''}`} onClick={() => requestDelete(task.id)}>{confirmDeleteId === task.id ? 'Confirm?' : 'Delete'}</button></div>
        </div>)}</div>}
      </section>}

      {completed.length > 0 && <section>
        <button className="nu-section-toggle" onClick={() => setShowInsights(!showInsights)}>Insights {showInsights ? '▲' : '▼'}</button>
        {showInsights && <div className="nu-insights-body">
          {!loggedTasks.length ? <div className="nu-insights-empty">Log actual effort on completed tasks to see estimate accuracy here.</div> : <>
            <div className="nu-insights-summary">{insightsSummary}</div>
            {loggedTasks.map((task) => {
              const difference = task.actualEffort - task.effort
              return <div className="nu-insights-row" key={task.id}>{task.name} — est {effortMeta(task.effort).label} → actual {effortMeta(task.actualEffort).label} ({difference >= 0 ? '+' : ''}{difference})</div>
            })}
          </>}
        </div>}
      </section>}
    </main>
  )
}

export default NextUp
