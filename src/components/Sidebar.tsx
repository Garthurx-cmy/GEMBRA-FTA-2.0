/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  FileBarChart,
  Trophy,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  LogOut
} from "lucide-react";
import { SystemConfig, UserProfile } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  config: SystemConfig;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, config, currentUser, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true);

  const menuPrincipal = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(currentUser?.perfil !== "visitante"
      ? [{ id: "lancar", label: "Lançar Inspeção", icon: PlusCircle }]
      : []),
    { id: "historico", label: "Histórico", icon: ClipboardList },
  ];

  const menuAnalise = [
    { id: "relatorios", label: "Relatórios", icon: FileBarChart },
    { id: "ranking", label: "Ranking", icon: Trophy },
    ...(currentUser?.perfil !== "visitante"
      ? [{ id: "exportacoes", label: "Exportações", icon: Download }]
      : []),
    ...(currentUser?.perfil === "Desenvolvedor/Admin" || currentUser?.perfil === "Administrador"
      ? [{ id: "configuracoes", label: "Configurações", icon: Settings }]
      : []),
  ];

  const renderMenuItem = (item: { id: string; label: string; icon: any }) => {
    const IconComponent = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        id={`sidebar-item-${item.id}`}
        onClick={() => setActiveTab(item.id)}
        className={`flex items-center gap-3 px-3 py-2 text-xs font-semibold transition-all duration-150 cursor-pointer ${
          isActive
            ? "border-l-4 border-[#F58220] bg-[#133e72] text-white font-bold rounded-r-md -ml-3 pl-2.5 shadow-sm"
            : "text-gray-300 hover:bg-[#133e72]/50 hover:text-white border-l-4 border-transparent -ml-3 pl-2.5"
        }`}
        title={collapsed ? item.label : undefined}
      >
        <IconComponent
          size={16}
          className={`shrink-0 transition-transform ${
            isActive ? "scale-105 text-[#F58220]" : "text-gray-400 group-hover:text-white"
          }`}
        />
        {!collapsed && (
          <span className="truncate tracking-wide">{item.label}</span>
        )}
      </button>
    );
  };

  return (
    <aside
      id="sidebar-container"
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`bg-[#0B2E59] text-white flex flex-col justify-between transition-all duration-300 ease-in-out border-r border-[#082142] h-screen sticky top-0 z-20 select-none ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Top Brand Block */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-3 py-3.5 border-b border-[#133e72] h-[52px]">
          {!collapsed ? (
            <div className="flex items-center gap-2 overflow-hidden transition-all duration-300 animate-fade-in">
              {/* Fallback Mini-Logo if no logoUrl */}
              <div className="bg-[#F58220] text-white font-black text-sm rounded px-2 py-0.5 tracking-tighter flex items-center justify-center">
                FTA
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-extrabold text-xs tracking-wide text-white truncate max-w-[120px]">
                  {config.nomeSistema}
                </span>
                <span className="text-[9px] text-gray-300 uppercase tracking-widest font-semibold">
                  SISTEMA DE GESTÃO GEMBA
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto bg-[#F58220] text-white font-black text-xs rounded px-1.5 py-0.5 tracking-tighter animate-fade-in">
              FTA
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="flex flex-col gap-4 px-3 py-4">
          {/* Menu Principal Group */}
          <div className="flex flex-col gap-1">
            {!collapsed && (
              <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400 px-2.5 mb-1 select-none">
                Menu Principal
              </span>
            )}
            <nav className="flex flex-col gap-1 pl-3">
              {menuPrincipal.map(renderMenuItem)}
            </nav>
          </div>

          {/* Análise Group */}
          <div className="flex flex-col gap-1">
            {!collapsed && (
              <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400 px-2.5 mb-1 select-none">
                Análise e Gestão
              </span>
            )}
            <nav className="flex flex-col gap-1 pl-3">
              {menuAnalise.map(renderMenuItem)}
            </nav>
          </div>
        </div>
      </div>

      {/* User Session Info Bottom Block */}
      <div className="p-4 border-t border-[#133e72] bg-[#092548]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#133e72] flex items-center justify-center border-2 border-[#F58220] text-white font-black shrink-0 text-xs uppercase">
              {currentUser?.nome.substring(0, 2) || "U"}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">
                  {currentUser?.nome || "Usuário"}
                </span>
                <span className="text-[9px] text-[#F58220] font-bold truncate flex items-center gap-1">
                  <ShieldCheck size={10} /> {currentUser?.perfil || "Supervisor"}
                </span>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={onLogout}
              className="p-1 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded transition cursor-pointer"
              title="Fazer Logout"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
