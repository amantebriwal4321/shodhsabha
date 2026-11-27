"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNCIL, agentById } from "@/lib/agents";
import type { A2AMessage, Brief, SponsorNote } from "@/lib/types";

type DemoChip = { id: string; question: string; blurb: string };
type Health = {
  brain: string;
  sponsors: Record<string, boolean>;
  demos: DemoChip[];
};

type SeatState = "idle" | "speaking" | "done";

const ANGLES = [-90, -30, 30, 90, 150, 210];

const FALLBACK_DEMOS: DemoChip[] = [
  {
    id: "hallucination",
    question: "What does the latest evidence say about LLM hallucination fixes?",
    blurb: "Papers, then a skeptic",
  },
  {
    id: "cloud-kitchen",
    question: "Is it worth opening a cloud kitchen in Koramangala?",
    blurb: "A local bet, thin evidence",
  },
  {
    id: "upi",
    question: "How ready is UPI for small street vendors?",
    blurb: "Public rails, open questions",
  },
];

async function readSSE(response: Response, onEvent: (event: string, data: Record<string, unknown>) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The sabha stream did not open.");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      onEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, unknown>);
    }
  }
}

export function SabhaApp() {
  const [health, setHealth] = useState<Health | null>(null);
  const [question, setQuestion] = useState(FALLBACK_DEMOS[0].question);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [seats, setSeats] = useState<Record<string, SeatState>>({});
  const [brief, setBrief] = useState<Brief | null>(null);
  const [label, setLabel] = useState<string>("");
  const [mode, setMode] = useState<string>("");
  const [notes, setNotes] = useState<SponsorNote[]>([]);
  const [error, setError] = useState<string>("");
  const threadRef = useRef<HTMLDivElement>(null);
  const demos = health?.demos?.length ? health.demos : FALLBACK_DEMOS;

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((payload: Health) => setHealth(payload))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, brief]);

  const sponsorPills = useMemo(() => {
    const flags = health?.sponsors ?? {};
    return [
      ["Lyzr", flags.lyzr],
      ["BAND", flags.band],
      ["Finch", flags.finch],
      ["Agent37", flags.agent37],
      ["AdaL", flags.adal],
    ] as const;
  }, [health]);

  async function convene(nextQuestion: string, demoId?: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || running) return;
    setQuestion(trimmed);
    setRunning(true);
    setMessages([]);
    setBrief(null);
    setNotes([]);
    setError("");
    setLabel("");
    setMode("");
    setSeats({});
    try {
      const response = await fetch("/api/sabha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          demoId,
          forceDemo: Boolean(demoId) && health?.brain === "none",
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "The sabha could not start.");
      }
      await readSSE(response, (event, data) => {
        if (event === "meta") {
          setMode(String(data.mode ?? ""));
          setLabel(String(data.label ?? ""));
        } else if (event === "status") {
          const agent = String(data.agent ?? "");
          const state = data.state === "speaking" || data.state === "done" ? data.state : "idle";
          setSeats((current) => ({ ...current, [agent]: state }));
        } else if (event === "message") {
          const message = data.message as A2AMessage;
          setMessages((current) => [...current, message]);
        } else if (event === "brief") {
          setBrief(data.brief as Brief);
        } else if (event === "sponsor") {
          setNotes((current) => [...current, data.note as SponsorNote]);
        } else if (event === "error") {
          setError(String(data.message ?? "The sabha failed."));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sabha failed.");
    } finally {
      setRunning(false);
    }
  }

  async function exportPdf() {
    if (!brief) return;
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, format: "pdf" }),
    });
    if (!response.ok) {
      setError("PDF export failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shodhsabha-brief.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    if (!brief) return;
    const blob = new Blob([brief.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shodhsabha-brief.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>ShodhSabha</h1>
          <p>A council, not a chatbot</p>
        </div>
        <div className="pills">
          <span className={mode === "live" ? "pill live" : "pill"} data-testid="mode-badge">
            {mode === "demo" ? "Recorded sabha" : mode === "live" ? "Live council" : mode === "keyless" ? "Keyless gather" : health?.brain === "none" ? "Demo ready" : "Live ready"}
          </span>
          {sponsorPills.map(([name, on]) => (
            <span key={name} className={on ? "pill on" : "pill"} data-testid={`sponsor-${name.toLowerCase()}`}>
              {name}
              {on ? " on" : ""}
            </span>
          ))}
        </div>
      </header>
      <main className="shell">
        <section className="stage">
          <form
            className="ask"
            onSubmit={(event) => {
              event.preventDefault();
              void convene(question);
            }}
          >
            <input
              data-testid="question-input"
              aria-label="Research question"
              value={question}
              maxLength={500}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask the sabha a research question"
            />
            <button type="submit" disabled={running} data-testid="start-button">
              {running ? "In session" : "Convene"}
            </button>
          </form>
          <div className="chips">
            {demos.map((demo) => (
              <button
                key={demo.id}
                type="button"
                data-testid={`demo-${demo.id}`}
                onClick={() => void convene(demo.question, demo.id)}
                disabled={running}
              >
                <strong>{demo.question}</strong>
                <span>{demo.blurb}</span>
              </button>
            ))}
          </div>
          <div className="court" aria-hidden="true">
            <Rangoli />
            {COUNCIL.map((agent, index) => {
              const state = seats[agent.id] ?? "idle";
              return (
                <div
                  key={agent.id}
                  className={`seat ${state}`}
                  style={{ ["--a" as string]: `${ANGLES[index]}deg`, ["--c" as string]: agent.color }}
                  data-testid={`seat-${agent.id}`}
                  data-state={state}
                >
                  <Lamp color={agent.color} />
                  <div className="who" style={{ color: agent.color }}>{agent.name}</div>
                  <div className="hindi">{agent.hindi}</div>
                </div>
              );
            })}
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="thread" ref={threadRef} data-testid="message-list" aria-live="polite">
            {messages.length === 0 && !running ? (
              <p className="empty">
                Pick a recorded question, or type your own. With no model key, a known question replays a real capture. Anything else is gathered live from arXiv, OpenAlex, Wikipedia, and the web, then checked before the brief.
              </p>
            ) : null}
            {messages.map((message) => {
              const from = agentById(message.from);
              const to = agentById(message.to);
              return (
                <article key={message.messageId} className="bubble" style={{ ["--c" as string]: from.color }} data-testid={`msg-${message.from}`}>
                  <header>
                    <span>{from.name} to {to.name}</span>
                    <span>{message.kind}</span>
                  </header>
                  <p>{message.text}</p>
                </article>
              );
            })}
          </div>
        </section>
        <BriefPanel
          brief={brief}
          label={label}
          notes={notes}
          onMarkdown={exportMarkdown}
          onPdf={() => void exportPdf()}
        />
      </main>
    </div>
  );
}

function Rangoli() {
  return (
    <svg className="rangoli" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="78" stroke="#e6b15a" strokeOpacity="0.55" strokeWidth="1" />
      <circle cx="100" cy="100" r="52" stroke="#e25b86" strokeOpacity="0.7" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="26" stroke="#3dbea8" strokeOpacity="0.8" strokeWidth="1.2" />
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = (index * Math.PI) / 6;
        const x = 100 + Math.cos(angle) * 70;
        const y = 100 + Math.sin(angle) * 70;
        return <path key={index} d={`M100 100 Q ${x} ${y} ${100 + Math.cos(angle + 0.4) * 78} ${100 + Math.sin(angle + 0.4) * 78}`} stroke={index % 2 ? "#e6b15a" : "#e25b86"} strokeOpacity="0.75" strokeWidth="1.1" />;
      })}
    </svg>
  );
}

function Lamp({ color }: { color: string }) {
  return (
    <svg className="lamp" viewBox="0 0 32 32" aria-hidden="true">
      <path className="flame" d="M16 4c2 5 1 8 0 11 4-1 6 2 5 6-1 4-8 5-10 1-1-3 2-6 2-10 1 2 2 4 3-8z" fill={color} />
      <path d="M8 24c4 4 12 4 16 0-4 2-12 2-16 0z" fill="#e6b15a" />
    </svg>
  );
}

function BriefPanel({
  brief,
  label,
  notes,
  onMarkdown,
  onPdf,
}: {
  brief: Brief | null;
  label: string;
  notes: SponsorNote[];
  onMarkdown: () => void;
  onPdf: () => void;
}) {
  if (!brief) {
    return (
      <aside className="brief" data-testid="brief-panel">
        <p className="section-label">Brief</p>
        <h2>The scribe writes last.</h2>
        <p className="empty">
          You will get a short answer, a confidence score from the quote check, open questions, and citations you can open. Rejected quotes stay visible so a weak source cannot hide.
        </p>
      </aside>
    );
  }
  const dash = Math.round((brief.confidence / 100) * 100);
  return (
    <aside className="brief" data-testid="brief-panel">
      <p className="section-label">Brief</p>
      <h2>{brief.question}</h2>
      <div className="score">
        <svg width="64" height="64" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" pathLength={100} fill="none" stroke="rgba(230,177,90,0.2)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            pathLength={100}
            fill="none"
            stroke="#e6b15a"
            strokeWidth="3"
            strokeDasharray={`${dash} 100`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        </svg>
        <div>
          <strong data-testid="confidence">{brief.confidence}</strong>
          <span>confidence out of 100, from quotes that matched the fetched text</span>
        </div>
      </div>
      <p className="answer">{brief.answer}</p>
      <div>
        <p className="section-label">Still open</p>
        <ul className="questions">
          {brief.openQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="section-label">Citations</p>
        <div className="citations">
          {brief.citations.map((citation) => (
            <a key={citation.id} className="cite" href={citation.url} target="_blank" rel="noreferrer">
              <span className={`tag ${citation.status}`}>{citation.status}</span>
              <b>{citation.title}</b>
              <small>{citation.excerpt}</small>
            </a>
          ))}
        </div>
      </div>
      <div className="export">
        <button type="button" data-testid="export-md" onClick={onMarkdown}>Markdown</button>
        <button type="button" className="ghost" data-testid="export-pdf" onClick={onPdf}>PDF</button>
      </div>
      {label ? <p className="mode-note" data-testid="mode-note">{label}</p> : null}
      {notes.map((note) => (
        <p key={`${note.sponsor}-${note.detail}`} className="mode-note">
          {note.sponsor}: {note.state}. {note.detail}
        </p>
      ))}
    </aside>
  );
}
