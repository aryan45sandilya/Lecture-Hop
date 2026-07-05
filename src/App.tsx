/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight, ArrowUp, ArrowDown, AlertTriangle, RefreshCw,
  ArrowLeft, ExternalLink, Copy, Check, GitBranch, Zap,
  Network, BookOpen, Layers, ChevronRight, Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Video {
  id: string;
  youtube_video_id: string;
  title: string;
  original_position: number;
  suggested_position: number;
  duration_seconds: number;
  primary_topic_name?: string;
  primary_topic_id?: string;
}

interface TopicGap {
  id: string;
  missing_topic: string;
  blocks_video_title: string;
  explanation: string;
}

interface PlaylistAnalysis {
  id: string;
  youtube_playlist_id: string;
  title: string;
  video_count: number;
  status: "pending"|"fetching_transcripts"|"embedding"|"clustering"|"sorting"|"completed"|"failed";
  analyzed_at: string | null;
  error?: string;
  videos: Video[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const ytWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;


// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex gap-4 items-start p-4 rounded-xl bg-white/5 animate-pulse">
      <div className="w-8 h-8 bg-white/10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-white/10 rounded w-3/4" />
        <div className="h-2 bg-white/10 rounded w-1/3" />
      </div>
    </div>
  );
}

// ─── Topic Graph ──────────────────────────────────────────────────────────────

interface TopicNode { id: string; name: string; videoCount: number; }
interface TopicEdge { from: string; to: string; }

function TopicGraph({ topics, edges }: { topics: TopicNode[]; edges: TopicEdge[] }) {
  if (topics.length === 0) return null;
  const levels = new Map<string, number>();
  topics.forEach((t) => levels.set(t.id, 0));
  for (let pass = 0; pass < topics.length; pass++) {
    edges.forEach(({ from, to }) => {
      const fl = levels.get(from) ?? 0;
      const tl = levels.get(to) ?? 0;
      if (tl <= fl) levels.set(to, fl + 1);
    });
  }
  const maxLevel = Math.max(0, ...Array.from(levels.values()));
  const cols = maxLevel + 1;
  const colWidth = 176; const nodeHeight = 60; const rowGap = 20; const colGap = 56;
  const byLevel = new Map<number, TopicNode[]>();
  for (let i = 0; i <= maxLevel; i++) byLevel.set(i, []);
  topics.forEach((t) => { const lv = levels.get(t.id) ?? 0; byLevel.get(lv)!.push(t); });
  const nodePos = new Map<string, { x: number; y: number }>();
  byLevel.forEach((nodes, col) => {
    const x = col * (colWidth + colGap) + colWidth / 2;
    nodes.forEach((n, i) => { nodePos.set(n.id, { x, y: i * (nodeHeight + rowGap) + nodeHeight / 2 }); });
  });
  const svgW = cols * (colWidth + colGap);
  const maxRows = Math.max(...Array.from(byLevel.values()).map((v) => v.length), 1);
  const svgH = maxRows * (nodeHeight + rowGap);
  const COLORS = ["#a78bfa","#34d399","#f59e0b","#60a5fa","#f472b6","#fb923c"];
  return (
    <div className="w-full overflow-x-auto pb-2">
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
        className="block mx-auto" style={{ minWidth: Math.min(svgW, 300) }}
        aria-label="Topic dependency graph" role="img">
        {edges.map((e, i) => {
          const from = nodePos.get(e.from); const to = nodePos.get(e.to);
          if (!from || !to) return null;
          const mx = (from.x + colWidth / 2 + to.x - colWidth / 2) / 2;
          return (
            <g key={i}>
              <path d={`M${from.x+colWidth/2},${from.y} C${mx},${from.y} ${mx},${to.y} ${to.x-colWidth/2},${to.y}`}
                fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.5" />
              <polygon points={`${to.x-colWidth/2},${to.y} ${to.x-colWidth/2-8},${to.y-4} ${to.x-colWidth/2-8},${to.y+4}`}
                fill="#a78bfa" opacity="0.6" />
            </g>
          );
        })}
        {topics.map((t, i) => {
          const pos = nodePos.get(t.id); if (!pos) return null;
          const color = COLORS[i % COLORS.length];
          const nx = pos.x - colWidth / 2; const ny = pos.y - nodeHeight / 2;
          return (
            <g key={t.id}>
              <rect x={nx} y={ny} width={colWidth} height={nodeHeight} rx="10"
                fill="#1e1b2e" stroke={color} strokeWidth="1.5" />
              <rect x={nx} y={ny} width={3} height={nodeHeight} rx="2" fill={color} />
              <text x={nx+14} y={ny+16} fill={color} fontSize="7" fontWeight="800"
                fontFamily="monospace" letterSpacing="1.5">TOPIC</text>
              <foreignObject x={nx+12} y={ny+20} width={colWidth-20} height={nodeHeight-26}>
                <div style={{ color:"#e2e8f0", fontSize:"10px", fontWeight:"700",
                  fontFamily:"Inter,sans-serif", lineHeight:"1.3", overflow:"hidden",
                  display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                  {t.name}
                </div>
              </foreignObject>
              <text x={nx+colWidth-8} y={ny+nodeHeight-8} fill="#94a3b8" fontSize="7"
                fontFamily="monospace" textAnchor="end">{t.videoCount}v</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<"home"|"loading"|"results">("home");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistTopic, setPlaylistTopic] = useState("");
  const [playlistId, setPlaylistId] = useState<string|null>(null);
  const [analysisData, setAnalysisData] = useState<PlaylistAnalysis|null>(null);
  const [gaps, setGaps] = useState<TopicGap[]>([]);
  const [error, setError] = useState<string|null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const topicNodes: TopicNode[] = (() => {
    if (!analysisData?.videos) return [];
    const map = new Map<string,{name:string;count:number}>();
    analysisData.videos.forEach((v) => {
      if (!v.primary_topic_id||!v.primary_topic_name) return;
      const e = map.get(v.primary_topic_id);
      map.set(v.primary_topic_id,{name:v.primary_topic_name,count:(e?.count??0)+1});
    });
    return Array.from(map.entries()).map(([id,{name,count}])=>({id,name,videoCount:count}));
  })();

  const topicEdges: TopicEdge[] = (() => {
    if (topicNodes.length < 2) return [];
    const avgPos = new Map<string,number>();
    topicNodes.forEach(({id}) => {
      const vids = analysisData?.videos.filter((v)=>v.primary_topic_id===id)??[];
      avgPos.set(id, vids.length ? vids.reduce((s,v)=>s+v.suggested_position,0)/vids.length : 0);
    });
    const sorted = [...topicNodes].sort((a,b)=>(avgPos.get(a.id)??0)-(avgPos.get(b.id)??0));
    return sorted.slice(0,-1).map((t,i)=>({from:t.id,to:sorted[i+1].id}));
  })();

  const steps = [
    { key:"fetching_transcripts", label:"Extracting Transcripts", desc:"Pulling captions & segmenting into chunks" },
    { key:"embedding", label:"Vector Embeddings", desc:"Generating 384-dim semantic vectors" },
    { key:"clustering", label:"HDBSCAN Clustering", desc:"Grouping segments into topic clusters" },
    { key:"sorting", label:"Topological Sort", desc:"Sequencing prerequisite learning order" },
  ];

  const quickStarts = [
    { label:"Linear Algebra", url:"https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab", topic:"3Blue1Brown Essence of Linear Algebra" },
    { label:"Machine Learning", url:"https://www.youtube.com/playlist?list=PLkDaE6sCZn6FNC6YRfRQc_FbeQrF8BwGI", topic:"Machine Learning by Andrew Ng" },
    { label:"Python OOP", url:"https://www.youtube.com/playlist?list=PL-osiE80TeTsqhIuOqKh-JIJiO5OMV", topic:"Python Object Oriented Programming" },
  ];

  const handleAnalyze = async (urlToSubmit: string, topicHint?: string) => {
    if (!urlToSubmit.trim()) return;
    setError(null); setSubmitLoading(true);
    try {
      const res = await fetch("/api/playlists/analyze", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ url: urlToSubmit, topic: topicHint||playlistTopic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"Failed to initiate analysis.");
      setPlaylistId(data.id); setScreen("loading");
    } catch(err:any) {
      setError(err.message||"An error occurred. Please try again.");
    } finally { setSubmitLoading(false); }
  };

  useEffect(() => {
    if (screen!=="loading"||!playlistId) return;
    let interval: ReturnType<typeof setInterval>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/playlists/${playlistId}`);
        const data = await res.json() as PlaylistAnalysis;
        if (!res.ok) throw new Error(data.error||"Failed to retrieve status.");
        setAnalysisData(data);
        if (data.status==="completed") {
          const gRes = await fetch(`/api/playlists/${playlistId}/gaps`);
          const gData = await gRes.json();
          setGaps(gData.gaps||[]); setScreen("results"); clearInterval(interval);
        } else if (data.status==="failed") {
          setError(data.error||"Analysis failed."); setScreen("home"); clearInterval(interval);
        }
      } catch(err:any) { setError(err.message||"Connection lost."); setScreen("home"); clearInterval(interval); }
    };
    poll(); interval = setInterval(poll,3000);
    return () => clearInterval(interval);
  }, [screen, playlistId]);

  useEffect(() => {
    if (screen==="results"&&resultsRef.current) {
      setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),200);
    }
  }, [screen]);

  const getActiveStepIndex = () => {
    if (!analysisData||analysisData.status==="pending") return 0;
    const i = steps.findIndex((s)=>s.key===analysisData.status);
    return i>=0?i:0;
  };

  const handleReset = () => {
    setPlaylistUrl(""); setPlaylistId(null); setAnalysisData(null);
    setGaps([]); setError(null); setScreen("home"); setPlaylistTopic("");
  };

  const handleCopySequence = useCallback(() => {
    if (!analysisData?.videos) return;
    const sorted = [...analysisData.videos].sort((a,b)=>a.suggested_position-b.suggested_position);
    const text = [`# ${analysisData.title} — Optimized Learning Sequence`,"Generated by Lecture Hop","",
      ...sorted.map((v,i)=>`${i+1}. ${v.title} (${formatDuration(v.duration_seconds)}) — https://youtube.com/watch?v=${v.youtube_video_id}`)
    ].join("\n");
    navigator.clipboard.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2500); });
  }, [analysisData]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans selection:bg-violet-500/30">

      {/* ── HEADER ── */}
      <header className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <button onClick={handleReset} className="flex items-center gap-3 group cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center group-hover:bg-violet-500/30 transition-all">
              <BookOpen className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">Lecture Hop</h1>
              <p className="text-[10px] text-white/40 tracking-widest uppercase hidden sm:block">AI Curriculum Sequencer</p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {analysisData && (
              <span className="text-xs text-white/40 hidden md:block truncate max-w-[200px]">{analysisData.title}</span>
            )}
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-16">
        <AnimatePresence mode="wait">

          {/* ══ HOME SCREEN ══ */}
          {screen === "home" && (
            <motion.div key="home" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.35}} className="max-w-2xl mx-auto">

              {/* Hero */}
              <div className="text-center mb-10 space-y-5">
                <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest">
                  <Sparkles className="w-3 h-3" /> AI-Powered Curriculum Analysis
                </div>
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
                  Learn in the <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">right order</span>
                </h2>
                <p className="text-base text-white/50 max-w-lg mx-auto leading-relaxed">
                  Paste any YouTube playlist. We cluster transcripts, map prerequisites, and resequence lectures into the optimal learning path.
                </p>
              </div>

              {/* Input Card */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 backdrop-blur-sm shadow-2xl shadow-black/40">
                <div className="space-y-3">
                  <label htmlFor="playlist-url" className="text-xs font-semibold uppercase tracking-widest text-white/50">
                    YouTube Playlist URL
                  </label>
                  <input
                    id="playlist-url" type="url" inputMode="url" autoComplete="url"
                    className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all font-mono"
                    placeholder="https://youtube.com/playlist?list=..."
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key==="Enter") handleAnalyze(playlistUrl); }}
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor="playlist-topic" className="text-xs font-semibold uppercase tracking-widest text-white/50">
                    Topic / Subject <span className="text-white/25 normal-case font-normal">(helps AI analyze correctly)</span>
                  </label>
                  <div className="flex gap-3">
                    <input
                      id="playlist-topic" type="text"
                      className="flex-1 h-12 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                      placeholder="e.g. UPSC Internal Security, React JS, Linear Algebra..."
                      value={playlistTopic}
                      onChange={(e) => setPlaylistTopic(e.target.value)}
                      onKeyDown={(e) => { if (e.key==="Enter") handleAnalyze(playlistUrl); }}
                    />
                    <button
                      onClick={() => handleAnalyze(playlistUrl)}
                      disabled={submitLoading}
                      className="h-12 px-6 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-lg shadow-violet-500/20"
                    >
                      {submitLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><span>Analyze</span><ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-white/5 space-y-3">
                  <p className="text-xs text-white/30 uppercase tracking-widest font-semibold">Quick Start</p>
                  <div className="flex flex-wrap gap-2">
                    {quickStarts.map((qs, i) => (
                      <button key={i}
                        className="text-xs bg-white/5 hover:bg-violet-500/20 border border-white/10 hover:border-violet-500/40 text-white/70 hover:text-white px-4 py-2 rounded-lg transition-all font-medium cursor-pointer"
                        onClick={() => { setPlaylistUrl(qs.url); setPlaylistTopic(qs.topic); handleAnalyze(qs.url, qs.topic); }}>
                        {qs.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Feature Cards */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: Zap, color:"violet", num:"01", title:"HDBSCAN Clustering", desc:"384-dim semantic vectors grouped into dense topic clusters." },
                  { icon: Network, color:"fuchsia", num:"02", title:"Prereq Graph", desc:"LLM maps pairwise constraints — what must come before what." },
                  { icon: GitBranch, color:"pink", num:"03", title:"Gap Detection", desc:"Flags missing foundational topics that block learner progress." },
                ].map(({ icon: Icon, color, num, title, desc }) => (
                  <div key={num} className="bg-white/3 border border-white/8 rounded-xl p-5 space-y-3 hover:border-white/15 transition-all">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md bg-${color}-500/15 text-${color}-400`}>{num}</span>
                      <Icon className="w-3.5 h-3.5 text-white/30" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/70">{title}</h3>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ══ LOADING SCREEN ══ */}
          {screen === "loading" && (
            <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-8 text-center shadow-2xl shadow-black/40">
                <div className="space-y-4 pt-2">
                  <div className="relative w-16 h-16 mx-auto">
                    <div className="absolute inset-0 rounded-full border-2 border-violet-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 border-r-fuchsia-500 animate-spin" />
                    <div className="absolute inset-2 rounded-full border border-violet-500/10 border-t-violet-400/40 animate-spin" style={{animationDirection:"reverse",animationDuration:"1.5s"}} />
                    <Layers className="absolute inset-0 m-auto w-5 h-5 text-violet-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Analyzing Playlist...</h2>
                  <p className="text-sm text-white/40">Running AI pipelines to sequence your curriculum</p>
                </div>

                <div className="space-y-2 text-left">
                  {steps.map((s, index) => {
                    const active = getActiveStepIndex();
                    const isDone = index < active;
                    const isCurrent = index === active;
                    return (
                      <div key={s.key} className={`flex gap-4 p-4 rounded-xl transition-all ${isCurrent ? "bg-violet-500/15 border border-violet-500/25" : isDone ? "opacity-60" : "opacity-30"}`}>
                        <div className="shrink-0 mt-0.5">
                          {isDone ? (
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs">✓</div>
                          ) : isCurrent ? (
                            <div className="w-6 h-6 rounded-full bg-violet-500/30 border border-violet-400/50 flex items-center justify-center text-violet-300 text-[10px] font-bold animate-pulse">{index+1}</div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-[10px] font-bold">{index+1}</div>
                          )}
                        </div>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wider ${isCurrent ? "text-violet-300" : "text-white/60"}`}>{s.label}</p>
                          <p className="text-xs text-white/30 mt-0.5">{s.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-white/20 uppercase tracking-widest">Est. ~10s — do not reload</p>
              </div>
            </motion.div>
          )}

          {/* ══ RESULTS SCREEN ══ */}
          {screen === "results" && analysisData && (
            <motion.div key="results" initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.4}}>
            <div ref={resultsRef} className="space-y-6">

              {/* Result Header */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
                  </button>
                  <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{analysisData.title}</h1>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-violet-400" />
                      <strong className="text-white">{analysisData.video_count}</strong> lectures
                    </span>
                    <ChevronRight className="w-3 h-3" />
                    <span>Topological sequence</span>
                    {gaps.length > 0 && (
                      <><ChevronRight className="w-3 h-3" />
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />{gaps.length} gap{gaps.length>1?"s":""} detected
                      </span></>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleCopySequence}
                    className="h-10 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer">
                    {copied ? <><Check className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">Copied!</span></> : <><Copy className="w-4 h-4" /><span>Copy</span></>}
                  </button>
                  <button onClick={handleReset}
                    className="h-10 px-4 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer">
                    <RefreshCw className="w-4 h-4" /><span>New</span>
                  </button>
                </div>
              </div>

              {/* Topic Graph */}
              {topicNodes.length >= 2 && (
                <div className="bg-[#0d0d18] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] bg-violet-500/20 text-violet-400 border border-violet-500/30 px-2.5 py-1 rounded-md font-bold uppercase tracking-widest">Graph</span>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Topic Dependency Map</h2>
                    <span className="ml-auto text-[10px] font-mono text-white/25">{topicNodes.length} clusters · {topicEdges.length} edges</span>
                  </div>
                  <TopicGraph topics={topicNodes} edges={topicEdges} />
                  <p className="text-[10px] text-white/20 text-center uppercase tracking-widest">Left → Right = Learning Order</p>
                </div>
              )}

              {/* Side-by-Side Video Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Original Order */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                    <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">01</span>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">Original Order</h3>
                  </div>
                  <div className="space-y-1">
                    {[...(analysisData.videos||[])].sort((a,b)=>a.original_position-b.original_position).map((video) => (
                      <a key={video.id} href={ytWatchUrl(video.youtube_video_id)} target="_blank" rel="noopener noreferrer"
                        className="flex gap-3 items-start p-3 rounded-lg opacity-40 hover:opacity-80 hover:bg-white/5 transition-all group no-underline">
                        <span className="text-sm font-mono text-white/40 min-w-[24px] mt-0.5">{video.original_position}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white leading-snug group-hover:text-violet-300 transition-colors line-clamp-2">{video.title}</p>
                          <p className="text-[10px] text-white/30 font-mono mt-1">{formatDuration(video.duration_seconds)}</p>
                        </div>
                        <ExternalLink className="w-3 h-3 text-white/20 group-hover:text-violet-400 shrink-0 mt-0.5 transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>

                {/* Optimized Order */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest border border-violet-500/30">02</span>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-white">Optimized Learning Path</h3>
                    </div>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Cohesion: High</span>
                  </div>

                  <div className="bg-[#0d0d18] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-2">
                    {analysisData.videos.length === 0
                      ? Array.from({length:5}).map((_,i)=><SkeletonCard key={i}/>)
                      : [...(analysisData.videos||[])].sort((a,b)=>a.suggested_position-b.suggested_position).map((video) => {
                          const shift = video.original_position - video.suggested_position;
                          return (
                            <div key={video.id}
                              className="group flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-xl bg-white/3 hover:bg-white/7 border border-white/5 hover:border-violet-500/20 transition-all">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <span className="text-2xl font-bold text-violet-400/60 min-w-[28px] leading-none mt-1">{video.suggested_position}.</span>
                                <div className="min-w-0 flex-1">
                                  <a href={ytWatchUrl(video.youtube_video_id)} target="_blank" rel="noopener noreferrer"
                                    className="flex items-start gap-1.5 group/link no-underline">
                                    <p className="text-sm font-semibold text-white group-hover/link:text-violet-300 transition-colors leading-snug">{video.title}</p>
                                    <ExternalLink className="w-3 h-3 text-white/20 group-hover/link:text-violet-400 shrink-0 mt-0.5 transition-colors" />
                                  </a>
                                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    {video.primary_topic_name && (
                                      <span className="text-[10px] bg-violet-500/15 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-md font-semibold">{video.primary_topic_name}</span>
                                    )}
                                    <span className="text-[10px] text-white/25 font-mono">{formatDuration(video.duration_seconds)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pl-9 sm:pl-0 shrink-0">
                                {shift > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full"><ArrowUp className="w-2.5 h-2.5"/>UP {shift}</span>}
                                {shift < 0 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full"><ArrowDown className="w-2.5 h-2.5"/>DN {Math.abs(shift)}</span>}
                                {shift === 0 && <span className="text-[10px] text-white/20 font-mono px-2">—</span>}
                              </div>
                            </div>
                          );
                        })}
                  </div>
                </div>
              </div>

              {/* Gaps Section */}
              <div className="pt-4 border-t border-white/10 space-y-5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-widest">03</span>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">Knowledge Gaps Detected</h2>
                </div>
                {gaps.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {gaps.map((gap) => (
                      <div key={gap.id} className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-5 space-y-3 hover:border-amber-500/30 transition-all">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <h3 className="text-sm font-bold text-white leading-snug">{gap.missing_topic}</h3>
                        </div>
                        <p className="text-xs text-white/50 leading-relaxed">{gap.explanation}</p>
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-amber-400/70 font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded-md">Missing Prereq</span>
                          <span className="text-[10px] text-white/30 font-mono text-right truncate">→ {gap.blocks_video_title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-5 text-sm text-emerald-400 flex items-center gap-3">
                    <span className="text-lg">✓</span>
                    <span>No structural prerequisite gaps detected — curriculum is well-sequenced.</span>
                  </div>
                )}
              </div>

            </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
