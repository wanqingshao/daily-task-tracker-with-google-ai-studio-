import React, { useState, useEffect, useMemo } from 'react';
import { 
  format, 
  addDays, 
  startOfToday, 
  isSameDay, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  addMonths, 
  subMonths,
  isSameMonth,
  isToday,
  getDay,
  getDate
} from 'date-fns';
import { 
  Plus, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Play, 
  Pause, 
  CheckCircle2, 
  Circle, 
  Timer,
  GripVertical,
  Trash2,
  Edit2,
  ArrowRight,
  X,
  Archive,
  Maximize2,
  Minimize2,
  StickyNote,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'motion/react';
import { Task, TaskStatus, RecurrenceType } from './types';
import { cn, formatDuration, parseDuration, getDurationParts } from './utils';

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('tasks');
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed.map((t: any) => ({
      ...t,
      status: t.status === 'pending' ? 'not-started' : t.status
    }));
  });
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<RecurrenceType>('none');
  const [newTaskDaysOfWeek, setNewTaskDaysOfWeek] = useState<number[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  // Edit form states
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubtasks, setEditSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceType>('none');
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<number[]>([]);
  const [editDate, setEditDate] = useState('');
  const [editHrs, setEditHrs] = useState(0);
  const [editMins, setEditMins] = useState(0);
  const [editSecs, setEditSecs] = useState(0);

  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [view, setView] = useState<'daily' | 'on-hold' | 'summary'>('daily');
  const [summaryRange, setSummaryRange] = useState<'week' | 'month' | 'custom'>('week');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date }>({
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date())
  });

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(tasks, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `daily-flow-tasks-${format(new Date(), 'yyyy-MM-dd')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedTasks = JSON.parse(content);
        
        if (Array.isArray(importedTasks)) {
          // Basic validation: check if items have required fields
          const isValid = importedTasks.every(t => t.id && t.title);
          if (isValid) {
            if (window.confirm('This will merge the imported tasks with your current tasks. Continue?')) {
              // Merge tasks, avoiding duplicates by ID
              setTasks(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                const newTasks = importedTasks
                  .filter((t: any) => !existingIds.has(t.id))
                  .map((t: any) => ({
                    ...t,
                    status: t.status === 'pending' ? 'not-started' : t.status
                  }));
                return [...prev, ...newTasks];
              });
            }
          } else {
            alert('Invalid file format. Please use a file previously exported from this app.');
          }
        }
      } catch (err) {
        console.error('Import error:', err);
        alert('Failed to parse the file. Please ensure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Timer logic
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prevTasks => 
        prevTasks.map(task => {
          if (task.isTimerRunning && task.lastTimerStart) {
            const now = Date.now();
            const elapsed = Math.floor((now - task.lastTimerStart) / 1000);
            return {
              ...task,
              timeSpent: task.timeSpent + elapsed,
              lastTimerStart: now
            };
          }
          return task;
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Recurrence logic: Spawn instances
  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayOfWeek = getDay(selectedDate);
    const dayOfMonth = getDate(selectedDate);

    const parents = tasks.filter(t => t.isRecurrenceParent);
    const newInstances: Task[] = [];

    parents.forEach(parent => {
      if (!parent.recurrence || parent.recurrence.type === 'none') return;

      let matches = false;
      if (parent.recurrence.type === 'daily') matches = true;
      else if (parent.recurrence.type === 'weekly') {
        matches = parent.recurrence.daysOfWeek?.includes(dayOfWeek) || false;
      } else if (parent.recurrence.type === 'monthly') {
        matches = parent.recurrence.dayOfMonth === dayOfMonth;
      }

      if (matches) {
        const instanceExists = tasks.find(t => t.parentId === parent.id && t.date === dateStr);
        if (!instanceExists) {
          newInstances.push({
            ...parent,
            id: crypto.randomUUID(),
            date: dateStr,
            isRecurrenceParent: false,
            parentId: parent.id,
            status: 'not-started',
            timeSpent: 0,
            isTimerRunning: false,
            lastTimerStart: undefined,
            subtasks: parent.subtasks?.map(s => ({ ...s, id: crypto.randomUUID(), completed: false }))
          });
        }
      }
    });

    if (newInstances.length > 0) {
      setTasks(prev => [...prev, ...newInstances]);
    }
  }, [selectedDate, tasks]);

  const filteredTasks = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return tasks
      .filter(t => t.date === dateStr && !t.isOnHold)
      .sort((a, b) => a.order - b.order);
  }, [tasks, selectedDate]);

  const [newTaskDate, setNewTaskDate] = useState(format(selectedDate, 'yyyy-MM-dd'));

  useEffect(() => {
    setNewTaskDate(format(selectedDate, 'yyyy-MM-dd'));
  }, [selectedDate]);

  const addTask = (e: React.FormEvent, forceHold: boolean = false) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle,
      notes: newTaskNotes,
      subtasks: newTaskSubtasks.filter(s => s.trim()).map(s => ({ id: crypto.randomUUID(), title: s, completed: false })),
      status: 'not-started',
      date: newTaskDate,
      timeSpent: 0,
      order: tasks.filter(t => t.date === newTaskDate).length,
      isOnHold: forceHold,
      recurrence: newTaskRecurrence !== 'none' ? {
        type: newTaskRecurrence,
        daysOfWeek: newTaskRecurrence === 'weekly' ? newTaskDaysOfWeek : undefined,
        dayOfMonth: newTaskRecurrence === 'monthly' ? getDate(parseISO(newTaskDate)) : undefined
      } : undefined,
      isRecurrenceParent: newTaskRecurrence !== 'none'
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setNewTaskNotes('');
    setNewTaskSubtasks([]);
    setNewTaskRecurrence('none');
    setNewTaskDaysOfWeek([]);
    setIsAddingTask(false);
  };

  const startEditing = (task: Task) => {
    const parts = getDurationParts(task.timeSpent);
    setEditingTask(task);
    setEditTitle(task.title);
    setEditNotes(task.notes || '');
    setEditSubtasks(task.subtasks || []);
    setEditRecurrence(task.recurrence?.type || 'none');
    setEditDaysOfWeek(task.recurrence?.daysOfWeek || []);
    setEditDate(task.date);
    setEditHrs(parts.hrs);
    setEditMins(parts.mins);
    setEditSecs(parts.secs);
  };

  const updateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    const newTimeSpent = parseDuration(editHrs, editMins, editSecs);

    setTasks(tasks.map(t => {
      if (t.id === editingTask.id) {
        const updatedTask = { 
          ...t, 
          title: editTitle, 
          notes: editNotes,
          subtasks: editSubtasks,
          date: editDate, 
          timeSpent: newTimeSpent,
          recurrence: editRecurrence !== 'none' ? {
            type: editRecurrence,
            daysOfWeek: editRecurrence === 'weekly' ? editDaysOfWeek : undefined,
            dayOfMonth: editRecurrence === 'monthly' ? (t.recurrence?.dayOfMonth || getDate(parseISO(editDate))) : undefined
          } : undefined,
          isRecurrenceParent: editRecurrence !== 'none',
          // If timer was running, we might want to reset the start time to now to avoid double counting
          lastTimerStart: t.isTimerRunning ? Date.now() : undefined
        };
        return updatedTask;
      }
      return t;
    }));
    setEditingTask(null);
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: t.subtasks?.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s)
        };
      }
      return t;
    }));
  };

  const toggleStatus = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const nextStatus: Record<TaskStatus, TaskStatus> = {
          'not-started': 'finished',
          'finished': 'not-started',
        };
        return { ...t, status: nextStatus[t.status] };
      }
      return t;
    }));
  };

  const toggleHold = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        return { ...t, isOnHold: !t.isOnHold };
      }
      return t;
    }));
  };

  const toggleTimer = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const isRunning = !t.isTimerRunning;
        return {
          ...t,
          isTimerRunning: isRunning,
          lastTimerStart: isRunning ? Date.now() : undefined
        };
      }
      return t;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const moveToTomorrow = (id: string) => {
    const tomorrow = format(addDays(parseISO(format(selectedDate, 'yyyy-MM-dd')), 1), 'yyyy-MM-dd');
    setTasks(tasks.map(t => {
      if (t.id === id) {
        return { ...t, date: tomorrow, order: tasks.filter(task => task.date === tomorrow).length };
      }
      return t;
    }));
  };

  const handleReorder = (newOrder: Task[]) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const otherTasks = tasks.filter(t => t.date !== dateStr || t.isOnHold);
    const updatedFiltered = newOrder.map((t, index) => ({ ...t, order: index }));
    setTasks([...otherTasks, ...updatedFiltered]);
  };

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const finished = filteredTasks.filter(t => t.status === 'finished').length;
    const notStarted = filteredTasks.filter(t => t.status === 'not-started').length;
    const totalTime = filteredTasks
      .filter(t => t.status === 'finished')
      .reduce((acc, t) => acc + t.timeSpent, 0);
    return { total, finished, notStarted, totalTime };
  }, [filteredTasks]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getDayStats = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const finished = dayTasks.filter(t => t.status === 'finished').length;
    const timeSpent = dayTasks
      .filter(t => t.status === 'finished')
      .reduce((acc, t) => acc + t.timeSpent, 0);
    return { total: dayTasks.length, finished, timeSpent };
  };

  const summaryData = useMemo(() => {
    let start: Date;
    let end: Date;

    if (summaryRange === 'week') {
      start = startOfWeek(selectedDate);
      end = endOfWeek(selectedDate);
    } else if (summaryRange === 'month') {
      start = startOfMonth(selectedDate);
      end = endOfMonth(selectedDate);
    } else {
      start = customRange.start;
      end = customRange.end;
    }

    const days = eachDayOfInterval({ start, end });
    
    return days.map(day => {
      const { finished, timeSpent } = getDayStats(day);
      return {
        name: format(day, summaryRange === 'month' ? 'd' : 'EEE'),
        fullDate: format(day, 'MMM d'),
        completed: finished,
        hours: Number((timeSpent / 3600).toFixed(1)),
        rawTime: timeSpent
      };
    });
  }, [tasks, selectedDate, summaryRange, customRange]);

  const activeTasks = filteredTasks;
  const onHoldTasks = useMemo(() => tasks.filter(t => t.isOnHold), [tasks]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1B] font-sans selection:bg-black/5">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6 py-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-black/5 shadow-sm mb-8 w-fit mx-auto">
          <button 
            onClick={() => setView('daily')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
              view === 'daily' ? "bg-black text-white" : "text-gray-400 hover:bg-gray-50"
            )}
          >
            Daily Flow
          </button>
          <button 
            onClick={() => setView('on-hold')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
              view === 'on-hold' ? "bg-black text-white" : "text-gray-400 hover:bg-gray-50"
            )}
          >
            On Hold
          </button>
          <button 
            onClick={() => setView('summary')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
              view === 'summary' ? "bg-black text-white" : "text-gray-400 hover:bg-gray-50"
            )}
          >
            Summary
          </button>
        </div>

        {view === 'daily' ? (
          <>
            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                  <motion.h1 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-bold tracking-tighter mb-1 text-black"
                  >
                    {format(selectedDate, 'EEEE')}
                  </motion.h1>
                  <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-base text-gray-400 font-medium"
                  >
                    {format(selectedDate, 'MMMM d, yyyy')}
                  </motion.p>
                </div>
                
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-black/5 shadow-sm">
                  <button 
                    onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-all active:scale-90"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button 
                    onClick={() => setSelectedDate(startOfToday())}
                    className="px-4 py-1.5 text-xs font-semibold hover:bg-gray-50 rounded-lg transition-all"
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-all active:scale-90"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="w-px h-5 bg-black/5 mx-0.5" />
                  <button 
                    onClick={() => setShowFullCalendar(!showFullCalendar)}
                    className={cn(
                      "p-2 rounded-lg transition-all active:scale-90",
                      showFullCalendar ? "bg-black text-white" : "hover:bg-gray-50"
                    )}
                  >
                    <CalendarIcon size={18} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showFullCalendar && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-8 overflow-hidden"
                  >
                    <div className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold tracking-tight">
                          {format(currentMonth, 'MMMM yyyy')}
                        </h3>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            className="p-1.5 hover:bg-gray-50 rounded-lg transition-all"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button 
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            className="p-1.5 hover:bg-gray-50 rounded-lg transition-all"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-7 gap-0.5">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="text-center text-[9px] uppercase tracking-widest text-gray-400 font-bold py-1">
                            {day}
                          </div>
                        ))}
                        {monthDays.map((day, i) => {
                          const { total, finished } = getDayStats(day);
                          const isSelected = isSameDay(day, selectedDate);
                          const isCurrentMonth = isSameMonth(day, currentMonth);
                          const isTodayDate = isToday(day);

                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedDate(day)}
                              className={cn(
                                "relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all group",
                                isSelected ? "bg-black text-white scale-105 z-10 shadow-lg shadow-black/10" : "hover:bg-gray-50",
                                !isCurrentMonth && "opacity-20"
                              )}
                            >
                              <span className={cn(
                                "text-xs font-medium",
                                isTodayDate && !isSelected && "text-emerald-600"
                              )}>
                                {format(day, 'd')}
                              </span>
                              {total > 0 && (
                                <div className="absolute bottom-1 flex gap-0.5">
                                  {Array.from({ length: Math.min(total, 3) }).map((_, idx) => (
                                    <div 
                                      key={idx} 
                                      className={cn(
                                        "w-0.5 h-0.5 rounded-full",
                                        idx < finished ? (isSelected ? "bg-emerald-400" : "bg-emerald-500") : (isSelected ? "bg-white/20" : "bg-gray-200")
                                      )} 
                                    />
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stats Bento */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: 'Finished', value: stats.finished, color: 'text-emerald-600' },
                  { label: 'Total Time', value: formatDuration(stats.totalTime), color: 'text-blue-600' },
                  { label: 'Tasks', value: stats.total, color: 'text-black' },
                ].map((stat, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.05 }}
                    className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm"
                  >
                    <span className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-bold mb-1 block">
                      {stat.label}
                    </span>
                    <span className={cn("text-xl font-bold tracking-tight", stat.color)}>
                      {stat.value}
                    </span>
                  </motion.div>
                ))}
              </div>
            </header>

            {/* Task List */}
            <main>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold tracking-tight">Focus</h2>
                <button 
                  onClick={() => setIsAddingTask(true)}
                  className="group flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl hover:scale-105 transition-all active:scale-95 text-xs font-bold shadow-lg shadow-black/5"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" />
                  New Task
                </button>
              </div>

              <AnimatePresence mode="wait">
                {isAddingTask && (
                  <motion.form 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onSubmit={addTask}
                    className="mb-6 bg-white p-6 rounded-2xl shadow-xl border border-black/5"
                  >
                    <input 
                      autoFocus
                      type="text"
                      placeholder="What's the mission?"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full text-2xl bg-transparent outline-none mb-2 placeholder:text-gray-200 font-bold tracking-tight"
                    />
                    
                    <textarea
                      placeholder="Add notes..."
                      value={newTaskNotes}
                      onChange={(e) => setNewTaskNotes(e.target.value)}
                      className="w-full bg-gray-50/50 p-3 rounded-xl border border-black/5 outline-none text-sm mb-4 resize-none min-h-[80px] placeholder:text-gray-300"
                    />

                    <div className="mb-6">
                      <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 block">Subtasks</label>
                      <div className="space-y-2">
                        {newTaskSubtasks.map((sub, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={sub}
                              onChange={(e) => {
                                const next = [...newTaskSubtasks];
                                next[idx] = e.target.value;
                                setNewTaskSubtasks(next);
                              }}
                              placeholder="Subtask title"
                              className="flex-1 bg-gray-50/50 px-3 py-2 rounded-lg border border-black/5 outline-none text-xs"
                            />
                            <button 
                              type="button"
                              onClick={() => setNewTaskSubtasks(newTaskSubtasks.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setNewTaskSubtasks([...newTaskSubtasks, ''])}
                          className="text-[10px] font-bold text-gray-400 hover:text-black flex items-center gap-1"
                        >
                          <Plus size={12} /> Add Subtask
                        </button>
                      </div>
                    </div>
                    
                    <div className="mb-6">
                      <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 block">Recurrence</label>
                      <div className="flex flex-wrap gap-2">
                        {(['none', 'daily', 'weekly', 'monthly'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setNewTaskRecurrence(type)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                              newTaskRecurrence === type 
                                ? "bg-black text-white border-black" 
                                : "bg-white text-gray-400 border-black/5 hover:border-black/20"
                            )}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      {newTaskRecurrence === 'weekly' && (
                        <div className="mt-3 flex gap-1">
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setNewTaskDaysOfWeek(prev => 
                                  prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                                );
                              }}
                              className={cn(
                                "w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all border",
                                newTaskDaysOfWeek.includes(i)
                                  ? "bg-emerald-500 text-white border-emerald-500"
                                  : "bg-gray-50 text-gray-400 border-black/5"
                              )}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-gray-400 bg-gray-50 px-3 py-2 rounded-xl border border-black/5">
                        <CalendarIcon size={16} />
                        <input 
                          type="date"
                          value={newTaskDate}
                          onChange={(e) => setNewTaskDate(e.target.value)}
                          className="bg-transparent outline-none text-xs font-bold text-black"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setIsAddingTask(false)}
                          className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-black transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          className="px-6 py-2 text-xs bg-black text-white rounded-xl hover:bg-gray-800 transition-all font-bold"
                        >
                          Schedule
                        </button>
                      </div>
                    </div>
                  </motion.form>
                )}

                {editingTask && (
                  <motion.form 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onSubmit={updateTask}
                    className="mb-6 bg-white p-6 rounded-2xl shadow-xl border border-emerald-500/20"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-[9px] uppercase tracking-[0.2em] text-emerald-600 font-bold">Edit Mission</h3>
                      <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-black">
                        <X size={18} />
                      </button>
                    </div>
                    
                    <input 
                      autoFocus
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full text-2xl bg-transparent outline-none mb-2 placeholder:text-gray-200 font-bold tracking-tight"
                    />
                    
                    <textarea
                      placeholder="Add notes..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full bg-gray-50/50 p-3 rounded-xl border border-black/5 outline-none text-sm mb-4 resize-none min-h-[80px] placeholder:text-gray-300"
                    />

                    <div className="mb-6">
                      <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 block">Subtasks</label>
                      <div className="space-y-2">
                        {editSubtasks.map((sub, idx) => (
                          <div key={sub.id} className="flex items-center gap-2">
                            <button 
                              type="button"
                              onClick={() => {
                                const next = [...editSubtasks];
                                next[idx] = { ...next[idx], completed: !next[idx].completed };
                                setEditSubtasks(next);
                              }}
                              className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                sub.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-200"
                              )}
                            >
                              {sub.completed && <CheckCircle2 size={10} />}
                            </button>
                            <input
                              type="text"
                              value={sub.title}
                              onChange={(e) => {
                                const next = [...editSubtasks];
                                next[idx] = { ...next[idx], title: e.target.value };
                                setEditSubtasks(next);
                              }}
                              className={cn(
                                "flex-1 bg-gray-50/50 px-3 py-2 rounded-lg border border-black/5 outline-none text-xs",
                                sub.completed && "line-through text-gray-400"
                              )}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditSubtasks(editSubtasks.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditSubtasks([...editSubtasks, { id: crypto.randomUUID(), title: '', completed: false }])}
                          className="text-[10px] font-bold text-gray-400 hover:text-black flex items-center gap-1"
                        >
                          <Plus size={12} /> Add Subtask
                        </button>
                      </div>
                    </div>
                    
                    <div className="mb-6">
                      <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 block">Recurrence</label>
                      <div className="flex flex-wrap gap-2">
                        {(['none', 'daily', 'weekly', 'monthly'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setEditRecurrence(type)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                              editRecurrence === type 
                                ? "bg-emerald-600 text-white border-emerald-600" 
                                : "bg-white text-gray-400 border-black/5 hover:border-black/20"
                            )}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      {editRecurrence === 'weekly' && (
                        <div className="mt-3 flex gap-1">
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setEditDaysOfWeek(prev => 
                                  prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                                );
                              }}
                              className={cn(
                                "w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all border",
                                editDaysOfWeek.includes(i)
                                  ? "bg-emerald-500 text-white border-emerald-500"
                                  : "bg-gray-50 text-gray-400 border-black/5"
                              )}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="space-y-2">
                        <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Date</label>
                        <div className="flex items-center gap-2 text-gray-400 bg-gray-50 px-3 py-2 rounded-xl border border-black/5">
                          <CalendarIcon size={16} />
                          <input 
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="bg-transparent outline-none text-xs font-bold text-black w-full"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Time Spent</label>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-gray-50 p-2 rounded-xl border border-black/5 flex flex-col items-center">
                            <input 
                              type="number" 
                              min="0"
                              value={editHrs}
                              onChange={(e) => setEditHrs(parseInt(e.target.value) || 0)}
                              className="bg-transparent outline-none text-lg font-bold text-black text-center w-full"
                            />
                            <span className="text-[7px] uppercase font-bold text-gray-400">Hrs</span>
                          </div>
                          <div className="flex-1 bg-gray-50 p-2 rounded-xl border border-black/5 flex flex-col items-center">
                            <input 
                              type="number" 
                              min="0"
                              max="59"
                              value={editMins}
                              onChange={(e) => setEditMins(parseInt(e.target.value) || 0)}
                              className="bg-transparent outline-none text-lg font-bold text-black text-center w-full"
                            />
                            <span className="text-[7px] uppercase font-bold text-gray-400">Min</span>
                          </div>
                          <div className="flex-1 bg-gray-50 p-2 rounded-xl border border-black/5 flex flex-col items-center">
                            <input 
                              type="number" 
                              min="0"
                              max="59"
                              value={editSecs}
                              onChange={(e) => setEditSecs(parseInt(e.target.value) || 0)}
                              className="bg-transparent outline-none text-lg font-bold text-black text-center w-full"
                            />
                            <span className="text-[7px] uppercase font-bold text-gray-400">Sec</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button 
                        type="submit"
                        className="w-full sm:w-auto px-8 py-3 text-xs bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all font-bold shadow-lg shadow-emerald-500/20"
                      >
                        Update Mission
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {filteredTasks.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200"
                >
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-black/5">
                    <CalendarIcon className="text-gray-300" size={24} />
                  </div>
                  <p className="text-gray-400 font-medium text-base">Clear schedule. Ready for new input.</p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  <Reorder.Group 
                    axis="y" 
                    values={activeTasks} 
                    onReorder={handleReorder}
                    className="space-y-3"
                  >
                    {activeTasks.map((task) => (
                      <Reorder.Item 
                        key={task.id} 
                        value={task}
                        className={cn(
                          "group relative bg-white p-2 rounded-xl border border-black/5 flex items-center gap-3 transition-all hover:shadow-md hover:border-black/10",
                          task.status === 'finished' && "opacity-40 grayscale"
                        )}
                      >
                        <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors">
                          <GripVertical size={16} />
                        </div>

                        <button 
                          onClick={() => toggleStatus(task.id)}
                          className={cn(
                            "relative w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center",
                            task.status === 'finished' ? "bg-emerald-500 border-emerald-500" : 
                            "border-gray-200 hover:border-gray-400"
                          )}
                        >
                          {task.status === 'finished' && <CheckCircle2 size={8} className="text-white" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className={cn(
                              "text-sm font-medium tracking-tight truncate transition-all",
                              task.status === 'finished' && "line-through text-gray-400"
                            )}>
                              {task.title}
                            </h3>
                            {(task.recurrence?.type && task.recurrence.type !== 'none') && (
                              <RefreshCw size={10} className="text-emerald-500" />
                            )}
                            {(task.notes || (task.subtasks && task.subtasks.length > 0)) && (
                              <button 
                                onClick={() => toggleNotes(task.id)}
                                className="text-gray-300 hover:text-amber-500 transition-colors"
                              >
                                <StickyNote size={12} />
                              </button>
                            )}
                          </div>
                          {task.notes && expandedNotes[task.id] && (
                            <motion.p 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              className="text-[11px] text-gray-500 mt-1 bg-gray-50 p-2 rounded-lg border border-black/5 whitespace-pre-wrap"
                            >
                              {task.notes}
                            </motion.p>
                          )}
                          {task.subtasks && task.subtasks.length > 0 && expandedNotes[task.id] && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              className="mt-2 space-y-1"
                            >
                              {task.subtasks.map(sub => (
                                <div key={sub.id} className="flex items-center gap-2 group/sub">
                                  <button 
                                    onClick={() => toggleSubtask(task.id, sub.id)}
                                    className={cn(
                                      "w-3 h-3 rounded border flex items-center justify-center transition-all",
                                      sub.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-200"
                                    )}
                                  >
                                    {sub.completed && <CheckCircle2 size={8} />}
                                  </button>
                                  <span className={cn(
                                    "text-[10px] font-medium",
                                    sub.completed ? "line-through text-gray-400" : "text-gray-600"
                                  )}>
                                    {sub.title}
                                  </span>
                                </div>
                              ))}
                            </motion.div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                              <Clock size={10} className="text-gray-300" />
                              {formatDuration(task.timeSpent)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-black/5 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => startEditing(task)}
                              className="p-1.5 text-gray-400 hover:text-black hover:bg-white rounded-md transition-all"
                              title="Edit Mission"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => toggleHold(task.id)}
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-white rounded-md transition-all"
                              title="Move to Hold"
                            >
                              <Archive size={14} />
                            </button>
                            <button 
                              onClick={() => moveToTomorrow(task.id)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-md transition-all"
                              title="Reschedule"
                            >
                              <ArrowRight size={14} />
                            </button>
                            <button 
                              onClick={() => deleteTask(task.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded-md transition-all"
                              title="Abort"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <button 
                            onClick={() => toggleTimer(task.id)}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 shadow-sm",
                              task.isTimerRunning 
                                ? "bg-amber-500 text-white shadow-amber-500/20" 
                                : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-black"
                            )}
                          >
                            {task.isTimerRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                          </button>
                        </div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                </div>
              )}
            </main>
          </>
        ) : view === 'on-hold' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold tracking-tight">On Hold</h2>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsAddingTask(true)}
                  className="group flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl hover:scale-105 transition-all active:scale-95 text-xs font-bold shadow-lg shadow-black/5"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" />
                  New Task
                </button>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                  {onHoldTasks.length} Tasks
                </span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isAddingTask && (
                <motion.form 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onSubmit={(e) => addTask(e, true)}
                  className="mb-6 bg-white p-6 rounded-2xl shadow-xl border border-black/5"
                >
                  <input 
                    autoFocus
                    type="text"
                    placeholder="What's the mission?"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full text-2xl bg-transparent outline-none mb-2 placeholder:text-gray-200 font-bold tracking-tight"
                  />
                  
                  <textarea
                    placeholder="Add notes..."
                    value={newTaskNotes}
                    onChange={(e) => setNewTaskNotes(e.target.value)}
                    className="w-full bg-gray-50/50 p-3 rounded-xl border border-black/5 outline-none text-sm mb-4 resize-none min-h-[80px] placeholder:text-gray-300"
                  />

                  <div className="mb-6">
                    <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 block">Subtasks</label>
                    <div className="space-y-2">
                      {newTaskSubtasks.map((sub, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sub}
                            onChange={(e) => {
                              const next = [...newTaskSubtasks];
                              next[idx] = e.target.value;
                              setNewTaskSubtasks(next);
                            }}
                            placeholder="Subtask title"
                            className="flex-1 bg-gray-50/50 px-3 py-2 rounded-lg border border-black/5 outline-none text-xs"
                          />
                          <button 
                            type="button"
                            onClick={() => setNewTaskSubtasks(newTaskSubtasks.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setNewTaskSubtasks([...newTaskSubtasks, ''])}
                        className="text-[10px] font-bold text-gray-400 hover:text-black flex items-center gap-1"
                      >
                        <Plus size={12} /> Add Subtask
                      </button>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2 block">Recurrence</label>
                    <div className="flex flex-wrap gap-2">
                      {(['none', 'daily', 'weekly', 'monthly'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewTaskRecurrence(type)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                            newTaskRecurrence === type 
                              ? "bg-black text-white border-black" 
                              : "bg-white text-gray-400 border-black/5 hover:border-black/20"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    {newTaskRecurrence === 'weekly' && (
                      <div className="mt-3 flex gap-1">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setNewTaskDaysOfWeek(prev => 
                                prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                              );
                            }}
                            className={cn(
                              "w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all border",
                              newTaskDaysOfWeek.includes(i)
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "bg-gray-50 text-gray-400 border-black/5"
                            )}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-gray-400 bg-gray-50 px-3 py-2 rounded-xl border border-black/5">
                      <CalendarIcon size={16} />
                      <input 
                        type="date"
                        value={newTaskDate}
                        onChange={(e) => setNewTaskDate(e.target.value)}
                        className="bg-transparent outline-none text-xs font-bold text-black"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setIsAddingTask(false)}
                        className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-black transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        className="px-6 py-2 text-xs bg-black text-white rounded-xl hover:bg-gray-800 transition-all font-bold"
                      >
                        Schedule on Hold
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {onHoldTasks.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                <Pause className="text-gray-300 mx-auto mb-4" size={24} />
                <p className="text-gray-400 font-medium text-base">No tasks on hold.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {onHoldTasks.map((task) => (
                  <div 
                    key={task.id}
                    className="bg-white p-2 rounded-2xl border border-black/5 flex flex-col gap-2 shadow-sm group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                        <Pause size={16} fill="currentColor" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium tracking-tight truncate text-black">
                            {task.title}
                          </h3>
                          {(task.recurrence?.type && task.recurrence.type !== 'none') && (
                            <RefreshCw size={10} className="text-emerald-500" />
                          )}
                          {(task.notes || (task.subtasks && task.subtasks.length > 0)) && (
                            <button 
                              onClick={() => toggleNotes(task.id)}
                              className="text-gray-300 hover:text-amber-500 transition-colors"
                            >
                              <StickyNote size={12} />
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                          Last scheduled: {format(parseISO(task.date), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setTasks(tasks.map(t => t.id === task.id ? { ...t, isOnHold: false, date: format(selectedDate, 'yyyy-MM-dd') } : t));
                          }}
                          className="flex items-center gap-2 bg-black text-white px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:scale-105 transition-all active:scale-95"
                        >
                          <CalendarIcon size={12} />
                          Schedule
                        </button>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {(task.notes || (task.subtasks && task.subtasks.length > 0)) && expandedNotes[task.id] && (
                      <div className="px-12 pb-2">
                        {task.notes && (
                          <motion.p 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="text-[11px] text-gray-500 bg-gray-50 p-2 rounded-lg border border-black/5 whitespace-pre-wrap mb-2"
                          >
                            {task.notes}
                          </motion.p>
                        )}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="space-y-1"
                          >
                            {task.subtasks.map(sub => (
                              <div key={sub.id} className="flex items-center gap-2 group/sub">
                                <button 
                                  onClick={() => toggleSubtask(task.id, sub.id)}
                                  className={cn(
                                    "w-3 h-3 rounded border flex items-center justify-center transition-all",
                                    sub.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-200"
                                  )}
                                >
                                  {sub.completed && <CheckCircle2 size={8} />}
                                </button>
                                <span className={cn(
                                  "text-[10px] font-medium",
                                  sub.completed ? "line-through text-gray-400" : "text-gray-600"
                                )}>
                                  {sub.title}
                                </span>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Performance Summary</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-400 font-medium">
                      {summaryData.length > 0 ? `${summaryData[0].fullDate} - ${summaryData[summaryData.length-1].fullDate}, ${format(selectedDate, 'yyyy')}` : 'No data'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-black/5">
                    {(['week', 'month', 'custom'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setSummaryRange(r)}
                        className={cn(
                          "px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all",
                          summaryRange === r ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={handleExport}
                    className="p-2 bg-white text-gray-400 hover:text-black rounded-xl border border-black/5 shadow-sm transition-all"
                    title="Export Data"
                  >
                    <Download size={14} />
                  </button>
                  <label className="p-2 bg-white text-gray-400 hover:text-black rounded-xl border border-black/5 shadow-sm transition-all cursor-pointer">
                    <Upload size={14} />
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={handleImport} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              {summaryRange === 'custom' && (
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-8 p-4 bg-gray-50 rounded-2xl border border-black/5">
                  <div className="flex flex-col gap-1 w-full">
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Start Date</label>
                    <input 
                      type="date" 
                      value={format(customRange.start, 'yyyy-MM-dd')}
                      onChange={(e) => setCustomRange(prev => ({ ...prev, start: parseISO(e.target.value) }))}
                      className="bg-white border border-black/5 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">End Date</label>
                    <input 
                      type="date" 
                      value={format(customRange.end, 'yyyy-MM-dd')}
                      onChange={(e) => setCustomRange(prev => ({ ...prev, end: parseISO(e.target.value) }))}
                      className="bg-white border border-black/5 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (summaryRange === 'week') setSelectedDate(addDays(selectedDate, -7));
                      if (summaryRange === 'month') setSelectedDate(subMonths(selectedDate, 1));
                    }}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button 
                    onClick={() => {
                      if (summaryRange === 'week') setSelectedDate(addDays(selectedDate, 7));
                      if (summaryRange === 'month') setSelectedDate(addMonths(selectedDate, 1));
                    }}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8f9fa' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 rounded-xl border border-black/5 shadow-xl">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{data.fullDate}</p>
                              <p className="text-sm font-bold text-black">{data.completed} Tasks Done</p>
                              <p className="text-xs font-medium text-blue-600">{formatDuration(data.rawTime)} Spent</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {summaryData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.completed > 0 ? '#10b981' : '#e5e7eb'} 
                          className="hover:fill-emerald-500 transition-colors duration-300"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Totals</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Completed Tasks</span>
                    <span className="text-lg font-bold text-emerald-600">{summaryData.reduce((acc, d) => acc + d.completed, 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Total Time Invested</span>
                    <span className="text-lg font-bold text-blue-600">
                      {formatDuration(summaryData.reduce((acc, d) => acc + d.rawTime, 0))}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Averages</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Tasks per Day</span>
                    <span className="text-lg font-bold text-black">
                      {(summaryData.reduce((acc, d) => acc + d.completed, 0) / summaryData.length).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Time per Day</span>
                    <span className="text-lg font-bold text-black">
                      {formatDuration(Math.floor(summaryData.reduce((acc, d) => acc + d.rawTime, 0) / summaryData.length))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-black/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {[
                { label: 'Idle', color: 'bg-gray-200' },
                { label: 'Hold', color: 'bg-gray-400' },
                { label: 'Done', color: 'bg-emerald-500' },
              ].map((status, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-bold text-gray-400">
                  <div className={cn("w-1.5 h-1.5 rounded-full", status.color)} />
                  {status.label}
                </div>
              ))}
            </div>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-gray-300">
              Daily Task Flow &copy; 2026
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
