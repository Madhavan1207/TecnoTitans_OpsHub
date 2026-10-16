import * as L from 'lucide-react';

const MAP = {
  ShieldCheck: L.ShieldCheck, Users: L.Users, Boxes: L.Boxes, LayoutDashboard: L.LayoutDashboard, FilePlus2: L.FilePlus2, Stamp: L.Stamp,
  PackageCheck: L.PackageCheck, ClipboardList: L.ClipboardList, Activity: L.Activity, Undo2: L.Undo2, CircuitBoard: L.CircuitBoard,
  BarChart3: L.BarChart3, FileSpreadsheet: L.FileSpreadsheet, Home: L.Home,
};
export const Icon = ({ name, size = 18, ...p }) => { const C = MAP[name] || L.Box; return <C size={size} {...p} />; };
export * from 'lucide-react';
