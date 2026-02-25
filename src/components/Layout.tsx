import React from 'react';
import { LayoutDashboard, Zap, Settings, Command } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
                <div className="p-6 flex items-center space-x-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                        G
                    </div>
                    <span className="text-xl font-bold tracking-tight">Genmix</span>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <NavItem icon={<LayoutDashboard size={20} />} label="All Tasks" active />
                    <NavItem icon={<Zap size={20} />} label="Automations" />
                    <NavItem icon={<Settings size={20} />} label="Settings" />
                </nav>

                <div className="p-4 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex items-center space-x-3 text-sm text-slate-500">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                            User
                        </div>
                        <span>Workspace</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Topbar */}
                <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6">
                    <h1 className="text-lg font-semibold flex items-center space-x-2">
                        <LayoutDashboard size={18} className="text-slate-400" />
                        <span>Tasks Overview</span>
                    </h1>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors">
                        <Command size={16} />
                        <span>New Task</span>
                    </button>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
    return (
        <button
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
        >
            {icon}
            <span>{label}</span>
            {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
        </button>
    );
}
