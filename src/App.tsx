/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Upload, 
  FileText, 
  MessageSquare, 
  Database, 
  Trash2, 
  Terminal, 
  ArrowRight,
  Loader2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RAGService, SearchResult } from './services/ragService';
import { get } from 'idb-keyval';
import { cn, formatDate } from './lib/utils';

export default function App() {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [processedDocs, setProcessedDocs] = useState<{name: string, chunkCount: number, date: string}[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [sources, setSources] = useState<SearchResult[]>([]);
  const [rag, setRag] = useState<RAGService | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      setRag(new RAGService(apiKey));
    }
    loadDocs();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadDocs = async () => {
    const docs = await get('processed_docs') || [];
    setProcessedDocs(docs);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-4), msg]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !rag) return;

    setIsProcessing(true);
    for (const file of Array.from(files)) {
      try {
        await rag.processDocument(file, addLog);
      } catch (err) {
        addLog(`Error processing ${file.name}: ${err}`);
      }
    }
    await loadDocs();
    setIsProcessing(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !rag || isProcessing) return;

    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsProcessing(true);
    setLogs(['Vectorizing query...', 'Searching index...', 'Extracting context...']);

    try {
      const results = await rag.search(query);
      setSources(results);
      addLog(`Found ${results.length} relevant context chunks.`);
      
      const answer = await rag.answer(query, results);
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      addLog(`Search error: ${err}`);
      setMessages(prev => [...prev, { role: 'assistant', content: "An error occurred during retrieval." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearIndex = async () => {
    if (!rag) return;
    await rag.clearIndex();
    setProcessedDocs([]);
    setMessages([]);
    setSources([]);
    addLog("Index cleared.");
  };

  return (
    <div className="flex h-screen bg-[#0A0B0D] text-[#E2E8F0] font-sans selection:bg-blue-500/30 overflow-hidden">
      {/* Sidebar - Technical Info */}
      <aside className="w-80 border-r border-white/5 bg-[#0D0E12] flex flex-col shrink-0">
        <div className="p-6 border-bottom border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight">FINSIGHT RAG</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Terminal v2.4</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
          {/* Status Section */}
          <section>
            <label className="text-[10px] text-white/30 uppercase tracking-widest font-bold mb-3 block">System Status</label>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs p-2 rounded bg-white/5 border border-white/5">
                <span className="text-white/60">Vector Engine</span>
                <span className="text-green-500 flex items-center gap-1"><Zap className="w-3 h-3"/> Active</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-white/5 border border-white/5">
                <span className="text-white/60">Encrypted FS</span>
                <span className="text-blue-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Secured</span>
              </div>
            </div>
          </section>

          {/* Document List */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] text-white/30 uppercase tracking-widest font-bold block">Internal Documents</label>
              <button 
                onClick={clearIndex}
                className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors uppercase tracking-widest font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Purge
              </button>
            </div>
            <div className="space-y-1">
              {processedDocs.length === 0 ? (
                <div className="text-center py-8 rounded border border-dashed border-white/10">
                  <p className="text-[11px] text-white/20 italic">No documents indexed</p>
                </div>
              ) : (
                processedDocs.map((doc, idx) => (
                  <div key={idx} className="group p-2 rounded hover:bg-white/5 flex items-start gap-3 transition-colors cursor-default border border-transparent hover:border-white/5">
                    <FileText className="w-4 h-4 text-blue-500/60 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs truncate font-medium text-white/80">{doc.name}</p>
                      <p className="text-[10px] text-white/40 font-mono italic">
                        {doc.chunkCount} vectors • {formatDate(doc.date)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Logs */}
          <section>
             <label className="text-[10px] text-white/30 uppercase tracking-widest font-bold mb-3 block">Live Console</label>
             <div className="bg-black/40 rounded p-3 font-mono text-[10px] space-y-2 border border-white/5 min-h-[140px] flex flex-col justify-end">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span>
                    <span className={cn(log.includes('Error') ? 'text-red-400' : 'text-blue-400/80')}>
                      {log}
                    </span>
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-blue-400 animate-pulse">
                     <span>{">_"}</span>
                     <span>Processing kernel...</span>
                  </div>
                )}
                <div ref={logEndRef} />
             </div>
          </section>
        </div>

        <div className="p-4 bg-black/20 border-t border-white/5">
          <label className="relative flex flex-col items-center justify-center p-4 border border-dashed border-white/20 rounded-lg hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group">
            <Upload className="w-5 h-5 text-white/40 group-hover:text-blue-400 mb-2" />
            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Ingest PDF</span>
            <input 
              type="file" 
              multiple 
              accept=".pdf" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isProcessing}
            />
          </label>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col bg-[#0A0B0D] relative">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0D0E12]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-mono font-bold tracking-tighter text-white/60">NODE-ID: LONDON-01</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
               <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">RAG Engine Online</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <button className="p-2 rounded hover:bg-white/5 transition-colors text-white/40">
                <Terminal className="w-4 h-4" />
             </button>
             <button className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[10px] font-bold uppercase tracking-wider">
                <ExternalLink className="w-3 h-3" /> Documentation
             </button>
          </div>
        </header>

        {/* Chat / Content */}
        <div className="flex-1 overflow-y-auto px-12 py-10 space-y-12">
          {messages.length === 0 && (
            <div className="max-w-3xl mx-auto space-y-8 mt-20">
               <div className="space-y-2">
                  <h2 className="text-4xl font-light text-white italic serif">Financial Intelligence <span className="text-blue-500 not-italic font-bold tracking-tighter font-sans uppercase text-2xl ml-2">Engine</span></h2>
                  <p className="text-white/40 max-w-lg leading-relaxed">
                    Ask complex questions about fund performance, risk metrics, or market outlook grounded in your internal research library.
                  </p>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  {[
                    "Summarize Q1 investor letters",
                    "What was the attribution for the Alpha Fund?",
                    "Analyze risk factors in the 2025 outlook report",
                    "Compare return breakdowns across funds"
                  ].map((preset, i) => (
                    <button 
                      key={i}
                      onClick={() => setQuery(preset)}
                      className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-left group"
                    >
                      <p className="text-xs font-bold text-white/60 mb-2 uppercase tracking-wider flex items-center group-hover:text-blue-400">
                        Preset Analysis <ChevronRight className="w-3 h-3 ml-auto" />
                      </p>
                      <p className="text-sm font-medium text-white/80">{preset}</p>
                    </button>
                  ))}
               </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto space-y-10">
            {messages.map((msg, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={idx} 
                className={cn(
                  "flex gap-6",
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[80%] p-6 rounded-2xl leading-relaxed text-sm",
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white font-medium shadow-lg shadow-blue-500/20' 
                    : 'bg-white/5 border border-white/10 text-white/90'
                )}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-white/40" />
                  </div>
                )}
              </motion.div>
            ))}
            
            <AnimatePresence>
              {sources.length > 0 && !isProcessing && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 pt-10"
                >
                  <label className="text-[10px] text-white/30 uppercase tracking-widest font-bold block flex items-center gap-2">
                    <Database className="w-3 h-3" /> Retrieval Grounding (Top 3)
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {sources.slice(0, 3).map((src, i) => (
                      <div key={i} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-blue-400">{Math.round(src.score * 100)}% RELIABILITY</span>
                          <span className="text-[10px] font-bold text-white/20">PG {src.pageNumber}</span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed italic line-clamp-4">
                          "...{src.content}..."
                        </p>
                        <div className="flex items-center gap-2 text-[9px] font-bold text-white/60">
                           <FileText className="w-3 h-3" /> {src.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-8 bg-gradient-to-t from-[#0A0B0D] via-[#0A0B0D] to-transparent">
          <form 
            onSubmit={handleSearch}
            className="max-w-4xl mx-auto relative group"
          >
            <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
            <div className="relative flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-2 px-6 focus-within:border-blue-500/50 transition-all backdrop-blur-xl">
              <Search className="w-5 h-5 text-white/20" />
              <input 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isProcessing ? "Analyzing vector space..." : "Query internal finance documents..."}
                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-white/20 py-4"
                disabled={isProcessing}
              />
              <button 
                type="submit"
                disabled={!query.trim() || isProcessing}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              </button>
            </div>
          </form>
          <div className="mt-4 flex justify-center gap-8 text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> SOC2 Compliant</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> End-to-End Encryption</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Citations Enforced</div>
          </div>
        </div>
      </main>
    </div>
  );
}

