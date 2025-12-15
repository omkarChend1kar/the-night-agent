import { AnomalyEntity } from "../../domain/entities/anomaly.entity";

interface AnomalyListProps {
    anomalies: AnomalyEntity[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export const AnomalyList = ({ anomalies, selectedId, onSelect }: AnomalyListProps) => {
    // Filter logic
    const activeAnomalies = anomalies.filter(a => a.status !== 'RESOLVED' && a.status !== 'merged');
    const resolvedAnomalies = anomalies.filter(a => a.status === 'RESOLVED' || a.status === 'merged');

    return (
        <div className="flex-1 overflow-y-auto">
            {activeAnomalies.length === 0 && (
                <div className="p-8 text-center text-xs opacity-50">No active anomalies via Sidecar.</div>
            )}

            {activeAnomalies.map(a => (
                <div
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    className={`p-4 border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors group ${selectedId === a.id ? 'bg-[var(--color-surface)] border-l-2 border-l-emerald-500' : 'border-l-2 border-l-transparent'}`}
                >
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${(a.severity || '').toLowerCase() === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : (a.severity || '').toLowerCase() === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <span className={`text-[10px] uppercase font-bold ${(a.severity || '').toLowerCase() === 'critical' ? 'text-red-400' : 'text-gray-500'}`}>{a.severity || 'UNKNOWN'}</span>
                        </div>
                        <span className="text-[10px] opacity-40 font-mono">{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="font-bold text-sm text-gray-200 truncate mb-1 group-hover:text-emerald-400 transition-colors">{a.message || 'Unknown Signal'}</div>
                    <div className="text-[10px] opacity-50 truncate font-mono">{a.repoUrl}</div>
                </div>
            ))}

            {resolvedAnomalies.length > 0 && (
                <>
                    <header className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-surface)] mt-4">
                        <span className="uppercase tracking-widest text-xs font-bold text-gray-600">Resolved // Archive</span>
                        <span className="text-[10px] text-gray-600">DONE</span>
                    </header>
                    {resolvedAnomalies.map(a => (
                        <div
                            key={a.id}
                            onClick={() => onSelect(a.id)}
                            className={`p-4 border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors group opacity-60 hover:opacity-100 ${selectedId === a.id ? 'bg-[var(--color-surface)] border-l-2 border-l-gray-500' : 'border-l-2 border-l-transparent'}`}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> RESOLVED
                                </span>
                                <span className="text-[10px] opacity-40 font-mono line-through">{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="font-bold text-sm text-gray-500 truncate mb-1 line-through decoration-gray-700">{a.message || 'Unknown Signal'}</div>
                            <div className="text-[10px] opacity-30 truncate font-mono">{a.repoUrl}</div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};
