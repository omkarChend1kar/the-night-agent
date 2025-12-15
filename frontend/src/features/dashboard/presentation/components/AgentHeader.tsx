export const AgentHeader = ({ name, status = 'ACTIVE' }: { name: string, status?: string }) => (
    <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-2 mb-4">
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-bold tracking-[0.2em] text-emerald-500 uppercase">{name}</span>
        </div>
        <span className="text-[10px] text-gray-600 font-mono tracking-widest">{status}</span>
    </div>
);
