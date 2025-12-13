"use client";
import { useAnomalyBloc } from '../bloc/useAnomalyBloc';
import * as Diff2Html from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const { state, actions, derived } = useAnomalyBloc();
  const { selectedAnomaly } = derived;

  const [diffHtml, setDiffHtml] = useState<string | null>(null);

  useEffect(() => {
    if (selectedAnomaly?.generated_patch) {
      try {
        const html = (Diff2Html as any).html(selectedAnomaly.generated_patch, {
          drawFileList: false,
          matching: 'lines',
          outputFormat: 'side-by-side',
          renderNothingWhenEmpty: true,
        });
        setDiffHtml(html);
      } catch (e) {
        console.error("Diff rendering failed", e);
        setDiffHtml(null);
      }
    } else {
      setDiffHtml(null);
    }
  }, [selectedAnomaly?.generated_patch]);

  // Reusable Agent Header Component
  const AgentHeader = ({ name, status = 'ACTIVE' }: { name: string, status?: string }) => (
    <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-bold tracking-[0.2em] text-emerald-500 uppercase">{name}</span>
      </div>
      <span className="text-[10px] text-gray-600 font-mono tracking-widest">{status}</span>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-neutral-900 text-gray-400 font-mono overflow-hidden">
      {/* Left Rail: Anomaly List - Hidden on mobile if viewing details */}
      <aside className={`
        ${selectedAnomaly ? 'hidden md:flex' : 'flex'} 
        w-full md:w-1/4 h-full border-r border-white/5 flex-col bg-black/20
      `}>
        <header className="p-4 border-b border-white/5 flex justify-between items-center bg-black/40">
          <span className="uppercase tracking-widest text-xs font-bold text-gray-500">Night Agent // Signals</span>
          <span className="text-[10px] text-emerald-500 animate-pulse">● MONITORING</span>
        </header>
        <div className="flex-1 overflow-y-auto">

          {state.anomalies.filter(a => a.status !== 'RESOLVED' && a.status !== 'merged').length === 0 && (
            <div className="p-8 text-center text-xs opacity-50">
              No active anomalies via Sidecar.
            </div>
          )}
          {state.anomalies.filter(a => a.status !== 'RESOLVED' && a.status !== 'merged').map(a => (
            <div
              key={a.id}
              onClick={() => actions.selectAnomaly(a.id)}
              className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors group ${state.selectedId === a.id ? 'bg-white/5 border-l-2 border-l-emerald-500' : 'border-l-2 border-l-transparent'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${(a.severity || '').toLowerCase() === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                    (a.severity || '').toLowerCase() === 'high' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                  <span className={`text-[10px] uppercase font-bold ${(a.severity || '').toLowerCase() === 'critical' ? 'text-red-400' : 'text-gray-500'}`}>
                    {a.severity || 'UNKNOWN'}
                  </span>
                </div>
                <span className="text-[10px] opacity-40 font-mono">{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="font-bold text-sm text-gray-200 truncate mb-1 group-hover:text-emerald-400 transition-colors">{a.message || 'Unknown Signal'}</div>
              <div className="text-[10px] opacity-50 truncate font-mono">{a.repoUrl}</div>
            </div>
          ))}

          {/* Resolved Section */}
          {state.anomalies.some(a => a.status === 'RESOLVED' || a.status === 'merged') && (
            <>
              <header className="p-4 border-b border-white/5 flex justify-between items-center bg-black/40 mt-4">
                <span className="uppercase tracking-widest text-xs font-bold text-gray-600">Resolved // Archive</span>
                <span className="text-[10px] text-gray-600">DONE</span>
              </header>
              {state.anomalies.filter(a => a.status === 'RESOLVED' || a.status === 'merged').map(a => (
                <div
                  key={a.id}
                  onClick={() => actions.selectAnomaly(a.id)}
                  className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors group opacity-60 hover:opacity-100 ${state.selectedId === a.id ? 'bg-white/5 border-l-2 border-l-gray-500' : 'border-l-2 border-l-transparent'}`}
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
      </aside>

      {/* Main Content: Hidden on mobile unless viewing details */}
      <main className={`
        ${selectedAnomaly ? 'flex' : 'hidden md:flex'} 
        flex-1 flex-col bg-neutral-900 relative
      `}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
        {selectedAnomaly ? (
          <>
            <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-8 md:space-y-12">

              {/* Mobile Back Button */}
              <button
                onClick={() => actions.selectAnomaly('')} // Deselect to go back
                className="md:hidden flex items-center gap-2 text-xs text-emerald-500 font-bold uppercase tracking-widest mb-4 hover:text-emerald-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                Back to Signals
              </button>

              {/* STAGE 1: ANALYSIS */}
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                <AgentHeader name="ANOMALY DETECTED" status="COMPLETE" />
                <div className="pl-4 border-l border-white/5">
                  {/* Origin / File Tree Context */}
                  {selectedAnomaly.root_cause_analysis && selectedAnomaly.root_cause_analysis.relevant_files && (
                    <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 mb-4 font-mono tracking-wide">
                      <span className="opacity-50">FILES:</span>
                      {selectedAnomaly.root_cause_analysis.relevant_files.map((f: string) => (
                        <span key={f} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">{f}</span>
                      ))}
                    </div>
                  )}

                  <h1 className="text-xl font-bold text-gray-100 mb-2">{selectedAnomaly.message}</h1>
                  <div className="bg-black/40 p-4 rounded border border-white/5 text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed shadow-inner mb-4">
                    {selectedAnomaly.logs && selectedAnomaly.logs.length > 0 ? selectedAnomaly.logs.join('\n') : selectedAnomaly.context}
                  </div>
                </div>
              </section>

              {/* STAGE 2: PROPOSED FIX */}
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                <AgentHeader name="PROPOSED FIX" status={selectedAnomaly.status === 'SANDBOX_READY' || selectedAnomaly.status === 'RESOLVED' ? 'COMPLETE' : 'REVIEW'} />
                <div className="pl-4 border-l border-white/5">

                  {/* Detailed Reasoning Block */}
                  <div className="mb-6">
                    <h3 className="text-[10px] uppercase tracking-widest text-emerald-600 mb-2 flex items-center gap-2">
                      <span className="w-2 h-px bg-emerald-800"></span> Reasoning
                    </h3>
                    <div className="text-xs text-gray-300 leading-relaxed font-sans bg-emerald-900/5 p-3 rounded border border-emerald-500/10">
                      {selectedAnomaly.root_cause_analysis ? (
                        <>
                          <div className="font-bold mb-1">Root Cause & Suggested Fix:</div>
                          <div className="whitespace-pre-wrap">{selectedAnomaly.root_cause_analysis.root_cause}</div>
                        </>
                      ) : (
                        selectedAnomaly.description || 'Analysis pending...'
                      )}
                    </div>
                  </div>

                  {selectedAnomaly.status === 'SANDBOX_READY' || selectedAnomaly.status === 'RESOLVED' || selectedAnomaly.status === 'merged' ? (
                    <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded text-xs text-emerald-400 px-4 py-2 opacity-60">
                      ✓ Fix Proposal Approved
                    </div>
                  ) : (
                    <>
                      <div className="bg-[#0D1117] border border-white/10 rounded-lg overflow-hidden text-sm font-mono shadow-2xl mb-4">
                        <div className="border-b border-white/5 px-4 py-2 bg-white/5 flex justify-between items-center">
                          <span className="text-xs text-gray-400">Proposed Changes (Diff)</span>
                          <span className="text-[10px] text-gray-600">Generated by System</span>
                        </div>
                        <div className="p-0 text-xs text-gray-400 overflow-x-auto">
                          {diffHtml ? (
                            <div dangerouslySetInnerHTML={{ __html: diffHtml }} className="diff-view-container" />
                          ) : (
                            <div className="p-8 text-center opacity-50">
                              {selectedAnomaly.generated_patch ? 'Loading Diff...' : 'No patch generated yet.'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        {state.refiningProposal ? (
                          <div className="flex-1 flex gap-2 animate-in fade-in zoom-in-95">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Enter instruction for the system..."
                              className="flex-1 bg-black/50 border border-white/20 rounded px-3 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500"
                              value={state.proposalInstruction}
                              onChange={e => actions.setProposalInstruction(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && actions.refineProposal()}
                            />
                            <button onClick={actions.refineProposal} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs">Send</button>
                            <button onClick={() => actions.setRefiningProposal(false)} className="px-3 py-1 text-gray-500 hover:text-gray-300 text-xs">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => actions.setRefiningProposal(true)}
                            className="px-4 py-1.5 border border-white/10 rounded text-xs text-gray-400 hover:text-white hover:border-white/30 transition-colors flex items-center gap-2"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            REFINE PROPOSAL
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* STAGE 3: SANDBOX VERIFICATION */}
              {(selectedAnomaly.status === 'SANDBOX_READY' || selectedAnomaly.status === 'RESOLVED' || selectedAnomaly.status === 'merged') && (
                <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <AgentHeader name="SANDBOX VERIFICATION" status={selectedAnomaly.status === 'RESOLVED' || selectedAnomaly.status === 'merged' ? 'MERGED' : 'ACTION REQUIRED'} />
                  <div className="pl-4 border-l border-white/5">
                    <div className="bg-[#0D1117] border border-amber-500/20 rounded-lg p-6 shadow-2xl relative">
                      {selectedAnomaly.status !== 'RESOLVED' && selectedAnomaly.status !== 'merged' && (
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50"></div>
                      )}
                      <h4 className={selectedAnomaly.status === 'RESOLVED' || selectedAnomaly.status === 'merged' ? "text-gray-500 font-bold mb-2" : "text-amber-500 font-bold mb-2"}>
                        {selectedAnomaly.status === 'RESOLVED' || selectedAnomaly.status === 'merged' ? 'Validation Complete' : 'Sandbox Verification'}
                      </h4>
                      <p className="text-xs text-gray-400 mb-4">Fixes applied to validation branch. Review changes or request adjustments.</p>
                      <div className="bg-black/50 p-3 rounded font-mono text-xs text-gray-300 border border-white/5 mb-6 flex justify-between items-center">
                        <span>Branch: <span className="text-emerald-400">{selectedAnomaly.branch || 'generating...'}</span></span>
                      </div>

                      {selectedAnomaly.status !== 'RESOLVED' && selectedAnomaly.status !== 'merged' && (
                        <div className="mb-6 flex justify-end">
                          {state.refiningSandbox ? (
                            <div className="flex-1 flex gap-2 animate-in fade-in zoom-in-95">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Request adjustments to sandbox (e.g. 'Add more logging')"
                                className="flex-1 bg-black/50 border border-amber-500/30 rounded px-3 py-2 text-xs text-gray-200 outline-none focus:border-amber-500"
                                value={state.sandboxInstruction}
                                onChange={e => actions.setSandboxInstruction(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && actions.refineSandbox()}
                              />
                              <button onClick={actions.refineSandbox} className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-200 rounded text-xs border border-amber-600/30">Apply</button>
                              <button onClick={() => actions.setRefiningSandbox(false)} className="px-3 py-1 text-gray-500 hover:text-gray-300 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => actions.setRefiningSandbox(true)}
                              className="text-xs text-amber-500 hover:text-amber-400 hover:underline flex items-center gap-1"
                            >
                              <span>Request Adjustments / Tweak</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-end gap-4 border-t border-white/5 pt-6">
                        {selectedAnomaly.status !== 'RESOLVED' && selectedAnomaly.status !== 'merged' ? (
                          <>
                            <div className="flex-1 relative group">
                              <label className="block text-[10px] uppercase tracking-widest text-gray-600 mb-2">Target Branch</label>

                              {/* VSCode-style Combobox */}
                              <div className="relative">
                                <input
                                  type="text"
                                  id="targetBranchInput"
                                  className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none transition-colors text-gray-200 placeholder-gray-600 font-mono"
                                  placeholder="Select or type branch..."
                                  defaultValue="main"
                                  autoComplete="off"
                                  onFocus={(e) => {
                                    const list = document.getElementById('branchList');
                                    if (list) list.classList.remove('hidden');
                                  }}
                                  onBlur={(e) => {
                                    // Delay hiding to allow click
                                    setTimeout(() => {
                                      const list = document.getElementById('branchList');
                                      if (list) list.classList.add('hidden');
                                    }, 200);
                                  }}
                                  onChange={(e) => {
                                    const val = e.target.value.toLowerCase();
                                    const items = document.querySelectorAll('.branch-item');
                                    items.forEach((item: any) => {
                                      const text = item.innerText.toLowerCase();
                                      if (text.includes(val)) {
                                        item.style.display = 'block';
                                      } else {
                                        item.style.display = 'none';
                                      }
                                    });
                                  }}
                                />
                                <div className="absolute right-3 top-2.5 text-gray-500 pointer-events-none">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                                </div>

                                {/* Dropdown List */}
                                <div id="branchList" className="hidden absolute z-50 w-full mt-1 bg-[#1e1e1e] border border-white/10 rounded shadow-xl max-h-48 overflow-y-auto left-0">
                                  {derived.availableBranches.map(b => (
                                    <div
                                      key={b}
                                      className="branch-item px-3 py-2 text-xs text-gray-300 hover:bg-emerald-600 hover:text-white cursor-pointer font-mono"
                                      onClick={() => {
                                        const input = document.getElementById('targetBranchInput') as HTMLInputElement;
                                        input.value = b;
                                      }}
                                    >
                                      {b}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const input = document.getElementById('targetBranchInput') as HTMLInputElement;
                                actions.confirmMerge(input.value || 'main');
                              }}
                              className="px-6 py-2 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2 h-[38px]"
                            >
                              <span>CONFIRM MERGE</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center gap-2 text-gray-400 opacity-60">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            <span className="text-sm font-mono">Changes merged to <span className="text-emerald-500 font-bold">main</span></span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Footer Actions */}
            <footer className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-4 items-center">
              <div className="mr-auto text-xs text-gray-600">
                Workflow: <span className="text-gray-400">Agent-User-Agent-User</span>
              </div>
              {selectedAnomaly.status !== 'SANDBOX_READY' && ((selectedAnomaly.status !== 'RESOLVED' && selectedAnomaly.status !== 'merged')) && (
                <>
                  <button onClick={actions.rejectFix} className="px-6 py-2.5 border border-white/10 rounded text-xs font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors tracking-wide">
                    REJECT
                  </button>
                  <button
                    onClick={actions.approveToSandbox}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all tracking-wide flex items-center gap-2"
                  >
                    <span>APPROVE TO SANDBOX</span>
                  </button>
                </>
              )}
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 select-none">
            <div className="text-6xl mb-6 text-terminal-green font-thin animate-pulse">&gt;_</div>
            <p className="tracking-[0.3em] text-sm">SYSTEM MONITORING ACTIVE</p>
            <p className="text-xs mt-2 opacity-50">Select a signal to review details</p>
          </div>
        )}
      </main>
    </div>
  );
}
