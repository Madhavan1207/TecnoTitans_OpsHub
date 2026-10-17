import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, MarkerType, useReactFlow, useNodesState, useEdgesState } from '@xyflow/react';
import { MODULES, MODULE_MAP, GROUPS, PORT_TYPES } from '@shared/registry.js';
import { addModule, removeModule, canAddModule, connect, isValidConnection, validateConfig, edgeId, normalizeConfig } from '@shared/validate.js';
import { PRESETS, applyPreset } from '@shared/presets.js';
import { http, errMsg, errDetails } from '../lib/api.js';
import { toast } from '../lib/store.js';
import { Chip, Modal, Spinner, Tabs, useAsync, ErrorBox, Logo } from '../components/ui.jsx';
import { Icon } from '../lib/icons.jsx';
import { PanelLeft, PanelRight, ArrowLeft, Eye, Rocket, Layers, History, CheckCircle2, AlertTriangle, Lock, Plus, Cloud, Loader2 } from '../lib/icons.jsx';
import ModuleNode from './ModuleNode.jsx';
import { ModuleTab, SiteTab } from './Inspector.jsx';
import Releases from './Releases.jsx';

const nodeTypes = { module: ModuleNode };

function Canvas({ slug, init, status, refreshStatus }) {
  const nav = useNavigate();
  const rf = useReactFlow();
  const [config, setConfigRaw] = useState(() => normalizeConfig(init));
  const [selected, setSelected] = useState(null); // {kind:'node'|'edge', id}
  const [tab, setTab] = useState('site');
  const [save, setSave] = useState('saved'); // saved | dirty | saving | error
  const [view, setView] = useState('canvas');
  const [showIssues, setShowIssues] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [presetMenu, setPresetMenu] = useState(false);
  const [showPalette, setShowPalette] = useState(() => window.innerWidth >= 1100);
  const [showInspector, setShowInspector] = useState(true);
  useEffect(() => { const t = setTimeout(() => rf.fitView({ padding: 0.1, maxZoom: 0.85 }), 120); return () => clearTimeout(t); }, [showPalette, showInspector, view]); // eslint-disable-line
  const timer = useRef(null);
  const latest = useRef(config);

  const validation = useMemo(() => validateConfig(config), [config]);
  const setConfig = useCallback((updater) => {
    setConfigRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      latest.current = next;
      return next;
    });
    setSave('dirty');
  }, []);

  // autosave: configuration persists without a manual step
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    setSave('saving');
    try { await http.put(`/sites/${slug}/draft`, { config: latest.current }); setSave('saved'); refreshStatus(); return true; } catch (e) { setSave('error'); toast.bad(`Could not save: ${errMsg(e)}`); return false; }
  }, [slug, refreshStatus]);
  useEffect(() => { if (save === 'dirty') { clearTimeout(timer.current); timer.current = setTimeout(flush, 900); } return () => clearTimeout(timer.current); }, [config, save, flush]);
  useEffect(() => { const f = (e) => { if (save === 'dirty') { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, [save]);

  const issuesBy = useMemo(() => { const m = {}; validation.errors.forEach((e) => { if (e.module) (m[e.module] ||= []).push(e); }); return m; }, [validation]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setNodes((prevNodes) => {
      const prevMap = new Map(prevNodes.map((n) => [n.id, n]));
      return config.modules.map((m) => {
        const prev = prevMap.get(m.type);
        const isDragging = prev?.dragging;
        const position = isDragging && prev?.position ? prev.position : m.position;
        return {
          id: m.type,
          type: 'module',
          position,
          data: { type: m.type, edges: config.edges, issues: issuesBy[m.type] },
          selected: selected?.kind === 'node' && selected.id === m.type,
          draggable: true,
          deletable: false,
        };
      });
    });
  }, [config.modules, config.edges, issuesBy, selected, setNodes]);

  useEffect(() => {
    setEdges(config.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      targetHandle: e.targetHandle,
      sourceHandle: 'out',
      animated: true,
      selected: selected?.kind === 'edge' && selected.id === e.id,
      style: { stroke: PORT_TYPES[MODULE_MAP[e.source]?.output?.type]?.color || '#888', strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: PORT_TYPES[MODULE_MAP[e.source]?.output?.type]?.color || '#888' },
    })));
  }, [config.edges, selected, setEdges]);

  const onNodeDragStop = useCallback((_, n) => {
    if (!n?.position) return;
    const newPos = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    setConfig((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => (m.type === n.id ? { ...m, position: newPos } : m)),
    }));
  }, [setConfig]);

  const apply = (res, okMsg) => { if (res.error) { toast.bad(res.error); return false; } setConfig(res.config); if (okMsg) toast.ok(okMsg); return true; };
  const add = (key, position) => { const ok = apply(addModule(config, key, position)); if (ok) { setSelected({ kind: 'node', id: key }); setTab('module'); } };
  const remove = (key) => { if (apply(removeModule(config, key))) setSelected(null); };

  const onDrop = (e) => { e.preventDefault(); const key = e.dataTransfer.getData('application/opshub-module'); if (!key) return; const pos = rf.screenToFlowPosition({ x: e.clientX - 116, y: e.clientY - 26 }); add(key, { x: Math.round(pos.x), y: Math.round(pos.y) }); };
  const onConnect = (c) => apply(connect(config, { source: c.source, target: c.target, targetHandle: c.targetHandle }));
  const onConnectEnd = (_e, st) => { if (st?.fromNode && st?.toNode && !st.isValid) { const r = isValidConnection(config, { source: st.fromNode.id, target: st.toNode.id, targetHandle: st.toHandle?.id || MODULE_MAP[st.toNode.id].inputs[0]?.id }); if (!r.ok) toast.bad(r.reason); } };
  const checkConn = (c) => isValidConnection(config, { source: c.source, target: c.target, targetHandle: c.targetHandle }).ok;

  useEffect(() => {
    const f = (e) => {
      if (!['Delete', 'Backspace'].includes(e.key) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || !selected) return;
      if (selected.kind === 'node') remove(selected.id);
      else { setConfig({ ...config, edges: config.edges.filter((x) => x.id !== selected.id) }); setSelected(null); }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }); // eslint-disable-line

  const preview = async () => { if (save !== 'saved') await flush(); window.open(`/s/${slug}?preview=1`, '_blank'); };
  const doPreset = (k) => { setPresetMenu(false); if (!window.confirm(`Replace the canvas with the "${PRESETS.find((p) => p.key === k).label}" preset? Your theme and site name are kept.`)) return; setConfig(applyPreset(config, k)); setSelected(null); toast.ok('Preset applied'); setTimeout(() => rf.fitView({ padding: 0.2 }), 50); };

  const selNode = selected?.kind === 'node' ? selected.id : null;
  const selEdge = selected?.kind === 'edge' ? config.edges.find((e) => e.id === selected.id) : null;
  const saveChip = { saved: ['ok', 'Draft saved'], dirty: ['warn', 'Unsaved changes'], saving: ['info', 'Saving...'], error: ['bad', 'Save failed'] }[save];

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F4F1E8' }}>
      <header style={{ background: '#0D1621' }} className="text-white">
        <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
          <button className="btn btn-sm btn-icon" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)', boxShadow: 'none' }} onClick={async () => { if (save === 'dirty') await flush(); nav('/'); }}><ArrowLeft size={16} /></button>
          <Logo height={34} />
          <div className="leading-tight"><div className="text-[10px] font-bold tracking-widest opacity-60">BUILDER</div><div className="font-heading text-xl" style={{ color: '#FFDD0A' }}>{config.name}</div></div>
          <Chip tone={saveChip[0]}>{save === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Cloud size={11} />}{saveChip[1]}</Chip>
          <Chip tone={status?.live_version ? 'info' : 'mute'}>{status?.live_version ? `Live: v${status.live_version}` : 'Never published'}</Chip>
          {status?.has_unpublished_changes && <Chip tone="warn">Unpublished changes</Chip>}
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-sm btn-icon" title="Show / hide module palette" onClick={() => setShowPalette(!showPalette)} style={showPalette ? { background: '#FFDD0A' } : {}}><PanelLeft size={14} /></button>
            <button className="btn btn-sm btn-icon" title="Show / hide settings panel" onClick={() => setShowInspector(!showInspector)} style={showInspector ? { background: '#FFDD0A' } : {}}><PanelRight size={14} /></button>
            <button className="btn btn-sm" onClick={() => setShowIssues(!showIssues)} style={validation.errors.length ? { background: '#FEE2E2' } : { background: '#DCFCE7' }}>{validation.errors.length ? <><AlertTriangle size={14} className="text-bad" /> {validation.errors.length} issue{validation.errors.length > 1 ? 's' : ''}</> : <><CheckCircle2 size={14} className="text-ok" /> Valid</>}{validation.warnings.length > 0 && <span className="chip chip-warn !ml-1">{validation.warnings.length}</span>}</button>
            <div className="relative"><button className="btn btn-sm" onClick={() => setPresetMenu(!presetMenu)}><Layers size={14} /> Presets</button>
              {presetMenu && <div className="absolute right-0 mt-2 w-72 card p-1.5 z-50" style={{ color: '#0D1621' }}>{PRESETS.map((p) => <button key={p.key} className="w-full text-left px-3 py-2 rounded hover:bg-[#FFF6B8]" onClick={() => doPreset(p.key)}><div className="font-bold text-sm">{p.label}</div><div className="text-xs text-muted">{p.desc}</div></button>)}</div>}</div>
            <button className="btn btn-sm" onClick={preview}><Eye size={14} /> Preview</button>
            <button className="btn btn-sm btn-primary" disabled={!validation.ok} onClick={async () => { if (await flush()) setPublishing(true); }}><Rocket size={14} /> Publish</button>
          </div>
        </div>
        <div className="px-4"><div className="flex gap-1">{[['canvas', 'Canvas', Layers], ['releases', 'Releases and rollback', History]].map(([k, l, I]) => <button key={k} onClick={async () => { if (save === 'dirty') await flush(); setView(k); }} className="px-4 py-2 text-sm font-bold flex items-center gap-2" style={{ background: view === k ? '#F4F1E8' : 'transparent', color: view === k ? '#0D1621' : 'rgba(255,255,255,.7)', borderRadius: '6px 6px 0 0' }}><I size={14} />{l}</button>)}</div></div>
      </header>

      {view === 'releases' ? <div className="flex-1 overflow-y-auto"><Releases slug={slug} onChanged={() => { refreshStatus(); http.get(`/sites/${slug}/builder`).then((r) => { setConfigRaw(normalizeConfig(r.data.draft)); latest.current = r.data.draft; setSave('saved'); }); }} /></div> : (
        <div className="flex-1 flex min-h-0">
          {showPalette && <aside className="w-52 xl:w-64 shrink-0 overflow-y-auto p-3" style={{ background: '#fff', borderRight: '2px solid #0D1621' }}>
            <div className="font-heading text-xl mb-1">Module palette</div><p className="help mb-3">Drag onto the canvas, or click +. Modules wire themselves to what they need.</p>
            {GROUPS.map((g) => (
              <div key={g} className="mb-4"><div className="label">{g}</div>
                <div className="flex flex-col gap-1.5">{MODULES.filter((m) => m.group === g).map((m) => {
                  const present = config.modules.some((n) => n.type === m.key);
                  const chk = canAddModule(config, m.key);
                  const blocked = !present && !chk.ok;
                  return (
                    <div key={m.key} draggable={!present && !m.core} onDragStart={(e) => { e.dataTransfer.setData('application/opshub-module', m.key); e.dataTransfer.effectAllowed = 'move'; }}
                      className="flex items-center gap-2 p-2 rounded-md text-left" title={present ? 'On the canvas' : blocked ? chk.reason : m.desc}
                      style={{ border: '2px solid #0D1621', background: present ? '#F1F5F9' : '#fff', opacity: present || blocked ? 0.6 : 1, cursor: present || m.core ? 'default' : 'grab' }}>
                      <span className="w-7 h-7 rounded grid place-items-center text-white shrink-0" style={{ background: m.color }}><Icon name={m.icon} size={15} /></span>
                      <span className="flex-1 min-w-0 text-[12px] font-bold leading-tight">{m.label}{blocked && <span className="block text-[10px] font-medium text-bad">{chk.reason}</span>}</span>
                      {present ? (m.core ? <Lock size={13} /> : <CheckCircle2 size={14} className="text-ok" />) : <button className="btn btn-sm btn-icon" onClick={() => add(m.key)}><Plus size={13} /></button>}
                    </div>);
                })}</div></div>))}
          </aside>}

          <div className="flex-1 min-w-0 relative" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.1, maxZoom: 0.85 }}
              minZoom={0.3}
              maxZoom={1.4}
              deleteKeyCode={null}
              onNodeClick={(_, n) => { setSelected({ kind: 'node', id: n.id }); setTab('module'); }}
              onEdgeClick={(_, e) => setSelected({ kind: 'edge', id: e.id })}
              onPaneClick={() => { setSelected(null); setTab('site'); }}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={checkConn}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1.5} color="#C9C3AE" /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(n) => MODULE_MAP[n.id]?.color || '#999'} style={{ border: '2px solid #0D1621' }} />
            </ReactFlow>
            {showIssues && (
              <div className="absolute left-3 bottom-3 right-3 card max-h-56 overflow-y-auto p-3 z-10 bg-white">
                <div className="flex justify-between mb-2"><b className="font-heading text-lg">Checks</b><button className="btn btn-sm" onClick={() => setShowIssues(false)}>Close</button></div>
                {!validation.errors.length && !validation.warnings.length && <div className="text-sm text-ok font-bold">Everything is valid. Ready to publish.</div>}
                {[...validation.errors, ...validation.warnings].map((i, k) => <button key={k} className="flex gap-2 items-start text-sm w-full text-left py-1 hover:bg-[#FFF6B8] rounded px-1" onClick={() => { if (i.module) { setSelected({ kind: 'node', id: i.module }); setTab('module'); } }}><Chip tone={i.severity === 'error' ? 'bad' : 'warn'}>{i.severity}</Chip><span>{i.message}</span></button>)}
              </div>)}
            {!config.modules.some((m) => !m.core) && <div className="absolute inset-x-0 top-10 text-center pointer-events-none"><div className="inline-block card px-6 py-4 bg-white"><div className="font-heading text-2xl">Start building</div><div className="text-sm text-muted">Drag a module from the left, or pick a preset.</div></div></div>}
          </div>

          {showInspector && <aside className="w-[310px] xl:w-[360px] shrink-0 overflow-y-auto" style={{ background: '#fff', borderLeft: '2px solid #0D1621' }}>
            <div className="px-3 pt-2"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'module', label: 'Module' }, { key: 'site', label: 'Site and theme' }]} /></div>
            <div className="p-4">
              {tab === 'module' ? (selNode ? <ModuleTab config={config} moduleKey={selNode} issues={issuesBy[selNode] || []} update={(c) => setConfig({ ...config, modules: config.modules.map((m) => (m.type === selNode ? { ...m, config: c } : m)) })} remove={() => remove(selNode)} />
                : selEdge ? (
                  <div className="flex flex-col gap-3"><div className="font-heading text-xl">Connection</div>
                    <div className="text-sm"><b>{MODULE_MAP[selEdge.source].label}</b> ({PORT_TYPES[MODULE_MAP[selEdge.source].output.type].label}) feeds <b>{MODULE_MAP[selEdge.target].label}</b> / {MODULE_MAP[selEdge.target].inputs.find((i) => i.id === selEdge.targetHandle)?.label}</div>
                    <button className="btn btn-sm btn-danger self-start" onClick={() => { setConfig({ ...config, edges: config.edges.filter((x) => x.id !== selEdge.id) }); setSelected(null); }}>Remove connection</button></div>
                ) : <div className="help">Select a module on the canvas to configure its fields and workflow.</div>)
                : <SiteTab config={config} setConfig={setConfig} />}
            </div>
          </aside>}
        </div>)}
      {publishing && <PublishModal slug={slug} config={config} status={status} validation={validation} onClose={() => setPublishing(false)} onDone={() => { setPublishing(false); refreshStatus(); }} />}
    </div>
  );
}

function PublishModal({ slug, status, validation, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const d = status?.diff || {};
  const go = async () => {
    setBusy(true);
    try { const { data } = await http.post(`/sites/${slug}/publish`, { note }); toast.ok(`Published v${data.version} - live now, no restart needed`); onDone(); }
    catch (e) { toast.bad(errMsg(e)); if (errDetails(e)?.errors) console.warn(errDetails(e).errors); } finally { setBusy(false); }
  };
  const nothing = status && !status.has_unpublished_changes;
  return (
    <Modal title={`Publish ${slug}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || nothing || !validation.ok} onClick={go}><Rocket size={15} /> {busy ? 'Publishing...' : 'Publish now'}</button></>}>
      <p className="text-sm mb-3">Publishing creates a new numbered release and makes it live immediately for everyone on this site. Data is never touched. You can roll back any time.</p>
      <div className="card-flat panel-pad mb-4 text-sm flex flex-col gap-1.5">
        <div><b>Added:</b> {d.added?.length ? d.added.map((k) => <Chip key={k} tone="ok">{MODULE_MAP[k]?.label}</Chip>) : <span className="text-muted">none</span>}</div>
        <div><b>Removed:</b> {d.removed?.length ? d.removed.map((k) => <Chip key={k} tone="bad">{MODULE_MAP[k]?.label}</Chip>) : <span className="text-muted">none</span>}</div>
        <div><b>Settings changed:</b> {d.changed?.length ? d.changed.map((k) => <Chip key={k} tone="info">{MODULE_MAP[k]?.label}</Chip>) : <span className="text-muted">none</span>}{d.themeChanged && <Chip tone="info">theme</Chip>}</div>
      </div>
      {nothing && <div className="err-text mb-3">Nothing to publish: the draft matches the live version.</div>}
      {validation.warnings.map((w, i) => <div key={i} className="help mb-1">Warning: {w.message}</div>)}
      <label className="label mt-3">Release note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? e.g. Enable returns" autoFocus />
    </Modal>
  );
}

export default function BuilderPage() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useAsync(() => http.get(`/sites/${slug}/builder`).then((r) => r.data), [slug]);
  const [status, setStatus] = useState(null);
  const refreshStatus = useCallback(() => http.get(`/sites/${slug}/builder`).then((r) => setStatus({ live_version: r.data.live_version, has_unpublished_changes: r.data.has_unpublished_changes, diff: r.data.diff })).catch(() => {}), [slug]);
  useEffect(() => { if (data) setStatus({ live_version: data.live_version, has_unpublished_changes: data.has_unpublished_changes, diff: data.diff }); }, [data]);
  if (loading) return <Spinner label="Opening builder" />;
  if (error) return <div className="p-10"><ErrorBox error={error} onRetry={reload} /></div>;
  return <ReactFlowProvider><Canvas key={slug} slug={slug} init={data.draft} status={status} refreshStatus={refreshStatus} /></ReactFlowProvider>;
}
void edgeId;
