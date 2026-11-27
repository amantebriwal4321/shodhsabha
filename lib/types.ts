export type AgentId =
  | "planner"
  | "web_scout"
  | "paper_scout"
  | "skeptic"
  | "fact_checker"
  | "scribe"
  | "user";

export type SourceKind = "arxiv" | "openalex" | "wikipedia" | "web";

export type SourceDoc = {
  id: string;
  kind: SourceKind;
  title: string;
  url: string;
  excerpt: string;
  text: string;
  year?: string;
};

export type ClaimStatus = "verified" | "partial" | "rejected";

export type Claim = {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  kind: SourceKind;
  excerpt: string;
  status: ClaimStatus;
  note: string;
};

export type A2AKind = "task" | "finding" | "challenge" | "verdict" | "brief";

export type A2AMessage = {
  messageId: string;
  contextId: string;
  taskId: string;
  from: AgentId;
  to: AgentId;
  kind: A2AKind;
  text: string;
  createdAt: string;
};

export type Citation = {
  id: string;
  title: string;
  url: string;
  kind: SourceKind;
  excerpt: string;
  status: ClaimStatus;
};

export type Brief = {
  question: string;
  mode: "demo" | "keyless" | "live";
  provider: string;
  answer: string;
  markdown: string;
  confidence: number;
  openQuestions: string[];
  citations: Citation[];
  capturedAt?: string;
};

export type SponsorNote = {
  sponsor: "band" | "agent37" | "adal" | "lyzr" | "finch";
  state: "used" | "skipped" | "failed";
  detail: string;
};

export type SabhaEvent =
  | {
      type: "meta";
      mode: Brief["mode"];
      provider: string;
      label: string;
      question: string;
    }
  | {
      type: "status";
      agent: AgentId;
      state: "listening" | "speaking" | "done";
    }
  | { type: "message"; message: A2AMessage }
  | { type: "brief"; brief: Brief }
  | { type: "sponsor"; note: SponsorNote };

export type Send = (event: SabhaEvent) => void | Promise<void>;

export type RunOptions = {
  question: string;
  demoId?: string;
  forceDemo?: boolean;
  send: Send;
};
