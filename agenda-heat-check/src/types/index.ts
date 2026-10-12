export type HeatLevel = 'critical' | 'moderate' | 'calm';

export type ReviewStatus = 'Draft' | 'Reviewed' | 'Approved';

export interface TraceableRecord {
  name: string;
  fileType: string;
  snippet?: string;
  url?: string;
}

export interface AgendaItem {
  id: string;
  itemNumber: number;
  docketCode: string;
  title: string;
  category: string;
  heatScore: number; // 0-100
  heatTier: HeatLevel;
  confidence: number; // e.g. 94%
  status: ReviewStatus;
  primaryDrivers: string[];
  anticipatedQuestions: string[];
  daisTalkingPoints: string[];
  traceableRecords: TraceableRecord[];
  proceduralNote?: string;
  floorAction?: string;
}

export interface MunicipalDataset {
  id: string;
  name: string;
  category: string;
  type: 'CSV' | 'JSON' | 'TRANSCRIPT' | 'PDF';
  itemCount: string;
  active: boolean;
  lastUpdated: string;
  description: string;
  tags: string[];
  sampleRows?: Record<string, string | number>[];
}

export interface WebSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  sender: 'council' | 'system' | 'assistant';
  text: string;
  citation?: string;
  timestamp: string;
  webSources?: WebSource[];
  isLiveWebSearch?: boolean;
}

export interface CouncilMeeting {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  status: 'Ready' | 'In Progress' | 'Upcoming' | 'Completed';
  docketCount: number;
  criticalCount: number;
  moderateCount: number;
  calmCount: number;
  agendaText?: string;
}
