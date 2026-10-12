// src/api.ts
const API_BASE_URL = "http://localhost:8000/api/v1"; //to connect to backend

export interface Factor {
  key: string;
  label: string;
  description: string;
  score: number;
}

export interface AgendaItem { //added bc it was in the original demo.ts
  id: string;
  number: string;
  title: string;
  department: string;
  itemType: string;
  reviewStatus: "Draft generated" | "Needs review" | "Approved";
  summary: string;
  factors: Factor[];
  sourceIds: string[];
  keyFacts: string[];
  historicalContext: string[];
  likelyQuestions: string[];
  talkingPoints: string[];
  missingInformation: string[];
}

export interface SourceRecord { //added bc it was in original demo.ts
  id: string;
  title: string;
  type: string;
  date: string;
  url: string;
  excerpt: string;
  fileName?: string;
}

export async function fetchAgendas(): Promise<AgendaItem[]> {
  //TEMP: bypass to stop crashes while backend routes are built
  console.log("Skipping agenda fetch - endpoint not ready");
  return []; 

  /* Keep OG code safe here for later:
  const response = await fetch(`${API_BASE_URL}/agendas`);
  if (!response.ok) {
    throw new Error("Failed to fetch agendas from backend");
  }
  return response.json();
  */
}

export async function uploadAgendaPdf(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/agendas`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload agenda PDF");
  }
  return response.json();
}

export async function fetchSources(): Promise<SourceRecord[]> {
  //TEMP: bypass to stop crashes while backend routes are built
  console.log("Skipping sources fetch - endpoint not ready");
  return [];

  /* Keep OG code safe here for later:
  const response = await fetch(`${API_BASE_URL}/sources`);
  if (!response.ok) {
    throw new Error("Failed to fetch sources from backend");
  }
  return response.json();
  */
}

export async function addSourceRecord(record: any): Promise<SourceRecord> {
  const response = await fetch(`${API_BASE_URL}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error("Failed to add source record");
  }
  return response.json();
}