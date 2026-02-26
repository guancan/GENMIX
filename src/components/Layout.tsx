import React from 'react';
import { Settings } from 'lucide-react';

const TOOL_TABS: { key: string; label: string; icon: string }[] = [
    { key: 'all', label: 'All Tasks', icon: '📋' },
    { key: 'gemini', label: 'Gemini', icon: '✨' },
    { key: 'jimeng', label: '即梦', icon: '🎨' },
    { key: 'chatgpt', label: 'ChatGPT', icon: '💬' },
];

interface LayoutProps {
    children: React.ReactNode;
    activeTab: string;
    onTabChange: (tab: string) => void;
    taskCounts?: Record<string, number>;
    headerActions?: React.ReactNode;
}

export function Layout({ children, activeTab, onTabChange, taskCounts, headerActions }: LayoutProps) {
    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
            {/* Sidebar */}
            <aside className="w-56 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col flex-shrink-0">
                <div className="p-5 flex items-center space-x-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        G
                    </div>
                    <span className="text-lg font-bold tracking-tight">Genmix</span>
                </div>

                <div className="px-3 pt-4 pb-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Tools</p>
                </div>

                <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
                    {TOOL_TABS.map(tab => {
                        const count = taskCounts?.[tab.key] ?? 0;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <span className="text-base flex-shrink-0">{tab.icon}</span>
                                <span className="flex-1 text-left truncate">{tab.label}</span>
                                {count > 0 && (
                                    <span className={`text-[10px] min-w-[20px] text-center px-1.5 py-0.5 rounded-full font-semibold ${isActive
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-800/40 dark:text-blue-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                        }`}>
                                        {count}
                                    </span>
                                )}
                                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                            </button>
                        );
                    })}
                </nav>

                <div className="px-3 pb-3 mt-auto border-t border-slate-100 dark:border-slate-700 pt-3">
                    <button className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <Settings size={18} />
                        <span>Settings</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Topbar */}
                <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
                    <h1 className="text-base font-semibold flex items-center space-x-2 text-slate-800 dark:text-white">
                        <span>Tasks Overview</span>
                    </h1>
                    {headerActions && (
                        <div className="flex items-center space-x-2">
                            {headerActions}
                        </div>
                    )}
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
