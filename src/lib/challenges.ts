export type Challenge = {
  tag: string;
  title: string;
  question: string;
  requirements: string[];
  duration: number;
};

export const CHALLENGES: Challenge[] = [
  {
    tag: "Energy",
    title: "Grid-scale battery storage",
    question:
      "Which country added the most grid-scale battery storage capacity (in GW) in 2024, and roughly how much was added?",
    requirements: [
      "State a single country and a numeric GW figure",
      "Cite at least two independent sources with publication dates",
      "Explain how the figure was measured (installed vs. contracted)",
    ],
    duration: 300,
  },
  {
    tag: "Health",
    title: "Measles resurgence drivers",
    question:
      "What is the single biggest documented driver of the 2024-2025 measles resurgence in high-income countries?",
    requirements: [
      "Name one primary driver and quantify its impact",
      "Cite at least one public health agency source",
      "Address one plausible competing explanation",
    ],
    duration: 300,
  },
  {
    tag: "Crypto",
    title: "Cost of an on-chain verdict",
    question:
      "How does GenLayer's optimistic democracy consensus decide the outcome of a non-deterministic LLM call, and what stops a single validator from dictating the result?",
    requirements: [
      "Describe the leader/validator flow accurately",
      "Explain the equivalence principle in your own words",
      "Cite at least one official GenLayer source",
    ],
    duration: 420,
  },
  {
    tag: "Climate",
    title: "Carbon removal delivered",
    question:
      "How many tonnes of durable carbon removal were actually delivered (not just purchased) worldwide in 2024?",
    requirements: [
      "Give a numeric tonnage for delivered removals only",
      "Distinguish delivered from purchased volumes",
      "Cite a registry or tracker as evidence",
    ],
    duration: 300,
  },
];
