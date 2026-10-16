import { Handle, Position } from '@xyflow/react';
import { MODULE_MAP, PORT_TYPES } from '@shared/registry.js';
import { Icon, Lock } from '../lib/icons.jsx';

const ROW = 26;
const HEAD = 52;
export const nodeHeight = (m) => HEAD + Math.max(m.inputs.length, 1) * ROW + 12;

/** One typed node on the canvas. Input handles on the left (coloured by accepted type), single typed output on the right. */
export default function ModuleNode({ data, selected }) {
  const m = MODULE_MAP[data.type];
  const issues = data.issues || [];
  return (
    <div className="rounded-md bg-white select-none" style={{ width: 232, border: `2px solid ${selected ? '#1D4FB5' : '#0D1621'}`, boxShadow: selected ? '5px 5px 0 #1D4FB5' : '3px 3px 0 #0D1621', minHeight: nodeHeight(m) }}>
      <div className="flex items-center gap-2 px-2.5 py-2 rounded-t-[4px]" style={{ background: m.color, color: '#fff', height: HEAD - 8 }}>
        <Icon name={m.icon} size={18} />
        <div className="leading-tight min-w-0"><div className="text-[10px] font-bold opacity-80">MODULE {String(m.no).padStart(2, '0')}</div><div className="text-[13px] font-bold truncate">{m.label}</div></div>
        {m.core && <Lock size={13} className="ml-auto opacity-80" />}
        {issues.length > 0 && <span className="ml-auto w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold" style={{ background: '#DC2626' }}>{issues.length}</span>}
      </div>
      <div className="px-3 pb-2" style={{ paddingTop: 6 }}>
        {m.core ? <div className="text-[11px] text-slate-500 leading-snug">Always on. Handles login, roles and the site shell.</div> : m.inputs.map((i) => {
          const wired = (data.edges || []).some((e) => e.target === m.key && e.targetHandle === i.id);
          return (
            <div key={i.id} className="flex items-center text-[11px] font-medium" style={{ height: ROW }}>
              <span style={{ color: wired ? '#16A34A' : i.required ? '#DC2626' : '#64748B' }}>{wired ? '●' : '○'}</span>
              <span className="ml-1.5 truncate">{i.label}{i.required ? '' : ''}</span>
            </div>);
        })}
        {!m.core && m.inputs.length === 0 && <div className="text-[11px] text-slate-500" style={{ height: ROW, lineHeight: `${ROW}px` }}>No inputs needed</div>}
      </div>
      {!m.core && m.inputs.map((i, idx) => (
        <Handle key={i.id} id={i.id} type="target" position={Position.Left} style={{ top: HEAD + idx * ROW + ROW / 2 + 2, background: PORT_TYPES[i.accepts[0]].color }} />
      ))}
      {m.output && !m.core && <Handle id="out" type="source" position={Position.Right} style={{ top: HEAD / 2, background: PORT_TYPES[m.output.type].color }} />}
      {m.output && !m.core && <div className="absolute -right-1 translate-x-full top-[10px] text-[10px] font-bold pl-1.5 whitespace-nowrap" style={{ color: PORT_TYPES[m.output.type].color }}>{m.output.label}</div>}
    </div>
  );
}
