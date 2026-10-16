export const money = (n) => (n == null || Number.isNaN(Number(n)) ? '-' : Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }));
export const num = (n) => (n == null ? '-' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
export const dt = (s) => (s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const dtm = (s) => (s ? new Date(s).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const human = (s) => String(s ?? '').replace(/_/g, ' ');
export const statusTone = (s) => ({
  pending: 'chip-warn', approved: 'chip-info', rejected: 'chip-bad', assigned: 'chip-primary', fulfilled: 'chip-ok', cancelled: 'chip-mute',
  issued: 'chip-info', partial: 'chip-warn', consumed: 'chip-ok', closed: 'chip-mute', completed: 'chip-ok', returned: 'chip-mute',
  diagnosing: 'chip-info', awaiting_parts: 'chip-warn', repairing: 'chip-primary', testing: 'chip-info',
  good: 'chip-ok', damaged: 'chip-warn', defective: 'chip-bad', urgent: 'chip-bad', high: 'chip-warn', normal: 'chip-mute', low: 'chip-mute',
}[s] || 'chip-mute');
