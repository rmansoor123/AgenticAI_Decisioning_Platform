import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Shield, Activity, Database, Brain, Cog, FlaskConical,
  Home, RefreshCw, Menu, X, ChevronDown, Server, Bot, Users, ShieldAlert, Eye, BookOpen, FolderOpen,
  Settings, Package, DollarSign, UserCog, Truck, RotateCcw
} from 'lucide-react'
import Chatbot from './Chatbot'

const API_BASE = 'http://localhost:3005/api'

export default function Layout({ children, wsConnected }) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/metrics`)
      .then(res => res.json())
      .then(data => data.success && setMetrics(data.data))
      .catch(() => {})
  }, [])

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    {
      name: 'Data Foundation',
      href: '/data',
      icon: Database,
      color: 'text-blue-400',
      children: [
        { name: 'Ingestion', href: '/data/ingestion' },
        { name: 'Data Catalog', href: '/data/catalog' },
        { name: 'Query Federation', href: '/data/query' }
      ]
    },
    {
      name: 'ML Models',
      href: '/ml',
      icon: Brain,
      color: 'text-purple-400',
      children: [
        { name: 'Model Registry', href: '/ml/models' },
        { name: 'Inference', href: '/ml/inference' },
        { name: 'Monitoring', href: '/ml/monitoring' }
      ]
    },
    {
      name: 'Decision Engine',
      href: '/decisions',
      icon: Cog,
      color: 'text-amber-400',
      children: [
        { name: 'Rules', href: '/decisions/rules' },
        { name: 'Rule Builder', href: '/decisions/builder' },
        { name: 'Execution', href: '/decisions/execution' }
      ]
    },
    {
      name: 'Experimentation',
      href: '/experiments',
      icon: FlaskConical,
      color: 'text-emerald-400',
      children: [
        { name: 'A/B Tests', href: '/experiments/ab' },
        { name: 'Simulation', href: '/experiments/simulation' }
      ]
    },
    { name: 'Transaction Flow', href: '/flow', icon: Activity, color: 'text-indigo-400' },
    { name: 'Agentic AI', href: '/agents', icon: Bot, color: 'text-violet-400' },
    { 
      name: 'Seller Onboarding', 
      href: '/onboarding', 
      icon: Users, 
      color: 'text-blue-400',
      children: [
        { name: 'Onboarding Dashboard', href: '/onboarding' },
        { name: 'Onboard New Seller', href: '/onboarding/form' },
        { name: 'Risk Lifecycle', href: '/seller-risk' },
        { name: 'Network Analysis', href: '/seller-network' }
      ]
    },
    {
      name: 'Business Services',
      href: '/account-setup',
      icon: Settings,
      color: 'text-cyan-400',
      children: [
        { name: 'Account Setup', href: '/account-setup' },
        { name: 'Item Setup', href: '/item-setup' },
        { name: 'Pricing', href: '/pricing' },
        { name: 'Profile Updates', href: '/profile-updates' },
        { name: 'Shipments', href: '/shipments' },
        { name: 'Returns', href: '/returns' }
      ]
    },
    { name: 'Risk Rules', href: '/risk-rules', icon: BookOpen, color: 'text-amber-400' },
    { name: 'Case Queue', href: '/case-queue', icon: FolderOpen, color: 'text-pink-400' },
    { name: 'Observability', href: '/observability', icon: Eye, color: 'text-cyan-400' },
    { name: 'Risk Profiles', href: '/risk-profiles', icon: ShieldAlert, color: 'text-red-400' },
    { name: 'Services', href: '/services', icon: Server, color: 'text-gray-400' }
  ]

  const NavItem = ({ item }) => {
    const childMatch = item.children?.some(c => location.pathname === c.href)
    const [expanded, setExpanded] = useState((location.pathname.startsWith(item.href) && item.href !== '/') || childMatch)
    const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href)) || childMatch

    return (
      <div>
        <div className="flex items-center">
          <Link
            to={item.href}
            className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? 'bg-indigo-500/20 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <item.icon className={`w-5 h-5 ${item.color || ''}`} />
            {sidebarOpen && <span className="text-sm font-medium">{item.name}</span>}
          </Link>
          {item.children && sidebarOpen && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 text-gray-400 hover:text-white"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {item.children && expanded && sidebarOpen && (
          <div className="ml-8 mt-1 space-y-1">
            {item.children.map(child => (
              <Link
                key={child.href}
                to={child.href}
                className={`block px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  location.pathname === child.href
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {child.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} border-r border-gray-800 bg-[#0d0d14] flex flex-col transition-all duration-300`}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Shield className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="text-lg font-bold text-white">Fraud Shield</h1>
                <p className="text-[10px] text-gray-500">Risk Platform</p>
              </div>
            )}
          </Link>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 text-gray-400 hover:text-white">
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navigation.map(item => (
            <NavItem key={item.href} item={item} />
          ))}
        </nav>

        {sidebarOpen && (
          <div className="p-4 border-t border-gray-800">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${wsConnected ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'} pulse-glow`} />
              <span className={`text-xs ${wsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                {wsConnected ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-gray-800 bg-[#0d0d14]/80 backdrop-blur-xl flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {navigation.find(n => location.pathname.startsWith(n.href) && n.href !== '/')?.name || 'Dashboard'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Activity className="w-4 h-4" />
              <span>{(metrics?.transactions?.total || 0).toLocaleString()} txns</span>
            </div>
            <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

      {/* Chatbot */}
      <Chatbot />
    </div>
  )
}
