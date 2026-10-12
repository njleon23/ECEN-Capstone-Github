export type PriorityFactor = {
  key: string
  label: string
  description: string
  score: number
}

export type SourceRecord = {
  id: string
  title: string
  type: string
  date: string
  url: string
  excerpt: string
  fileName?: string
}

export type AgendaItem = {
  id: string
  number: string
  title: string
  department: string
  itemType: string
  reviewStatus: "Draft generated" | "Needs review" | "Approved"
  summary: string
  factors: PriorityFactor[]
  sourceIds: string[]
  keyFacts: string[]
  historicalContext: string[]
  likelyQuestions: string[]
  talkingPoints: string[]
  missingInformation: string[]
}

export const sampleSources: SourceRecord[] = [
  {
    id: "agenda",
    title: "College Station Agendas and Minutes",
    type: "Agenda portal",
    date: "August 2026",
    url: "https://www.cstx.gov/your-government/agendas-and-minutes/",
    excerpt:
      "Official meeting materials provide agenda item descriptions, attachments, Council questions, staff responses, and final meeting records.",
  },
  {
    id: "budget",
    title: "City Budget and FY27 Materials",
    type: "Financial record",
    date: "FY 2027",
    url: "https://www.cstx.gov/your-government/budget-and-finance/budget/",
    excerpt:
      "The proposed FY27 budget materials describe the citywide financial plan, funded priorities, operating changes, capital spending, and tax-rate considerations.",
  },
  {
    id: "preview",
    title: "Five Things to Watch at the August 27 Meeting",
    type: "Pre-meeting preview",
    date: "August 26, 2026",
    url: "https://blog.cstx.gov/2026/08/26/5-things-to-watch-at-thursdays-city-council-meeting-99/",
    excerpt:
      "The City preview identified the advertised tax-rate hearing, proposed FY27 budget and tax-rate adoption, Harvey Road townhomes, the regional sports complex, and the Corporate Parkway extension as notable topics.",
  },
  {
    id: "live-blog",
    title: "Live from City Hall August 27 Council Meeting",
    type: "Retrospective meeting record",
    date: "August 27, 2026",
    url: "https://blog.cstx.gov/2026/08/27/live-from-city-hall-thursdays-city-council-meeting-aug-27/",
    excerpt:
      "The live blog reports public speakers, motions, and voting outcomes. It is useful for retrospective evaluation but is explicitly not the official minutes.",
  },
  {
    id: "open-checkbook",
    title: "CSTX Open Checkbook",
    type: "Public spending portal",
    date: "Current public portal",
    url: "https://checkbook.cstx.gov/",
    excerpt:
      "The public spending portal supports searches by department, vendor, and expenditure type for financial and contract context.",
  },
]

const factor = (
  key: string,
  label: string,
  description: string,
  score: number,
): PriorityFactor => ({ key, label, description, score })

export const sampleItems: AgendaItem[] = [
  {
    id: "fy27-budget",
    number: "8.2",
    title: "FY27 Budget and Property Tax Rate",
    department: "Fiscal Services",
    itemType: "Public hearing and vote",
    reviewStatus: "Needs review",
    summary:
      "Council considers the proposed FY27 budget and property tax rate following workshops and public hearings. The decision has a direct citywide financial impact and requires clear explanations of household effects, funded priorities, and alternatives.",
    factors: [
      factor("public", "Formal public participation", "A tax-rate public hearing was scheduled.", 2),
      factor("household", "Direct household effect", "The action concerns the property tax rate.", 2),
      factor("scale", "Decision scale", "The item affects the citywide budget and tax rate.", 2),
      factor("attention", "Prior public attention", "Budget workshops and an earlier hearing were documented.", 2),
      factor("tradeoff", "Decision uncertainty", "Council could amend the budget or rate.", 1),
    ],
    sourceIds: ["agenda", "budget", "preview", "live-blog"],
    keyFacts: [
      "The advertised property tax rate was $0.530254 per $100 valuation.",
      "The proposed FY27 budget was approximately $576.35 million.",
      "The City had already conducted budget workshops and an earlier public hearing.",
    ],
    historicalContext: [
      "Budget development included multiple public meetings before the scheduled adoption vote.",
      "A retrospective check found public speakers and divided votes on the budget and tax-rate actions.",
    ],
    likelyQuestions: [
      "Why is the proposed tax rate changing, and which budget needs drive the change?",
      "What is the estimated impact on representative residential property values?",
      "Which capital projects, staffing changes, or service levels account for the largest increases?",
      "What alternatives were considered, and what would change under a lower rate?",
    ],
    talkingPoints: [
      "Separate operating-budget changes from one-time capital expenditures.",
      "Use verified examples to explain household impact and the services funded by the proposal.",
      "Keep a finance subject-matter expert available for detailed follow-up questions.",
    ],
    missingInformation: [
      "Verify all final figures against the adopted agenda packet before external use.",
      "Confirm whether the City prefers household examples, percentage comparisons, or both.",
    ],
  },
  {
    id: "sports-complex",
    number: "9.1",
    title: "Regional Sports Complex Plan Changes",
    department: "Planning and Development",
    itemType: "Land use and zoning",
    reviewStatus: "Draft generated",
    summary:
      "Council considers land-use and zoning actions associated with a proposed regional sports complex. The item is prominent and potentially high impact, although prominence does not necessarily indicate controversy.",
    factors: [
      factor("public", "Formal public participation", "The action includes a public discussion opportunity.", 1),
      factor("household", "Direct household effect", "Financial effects are indirect in the current public record.", 1),
      factor("scale", "Decision scale", "The project has regional and long-term planning implications.", 2),
      factor("attention", "Prior public attention", "The City identified the item in its pre-meeting preview.", 1),
      factor("tradeoff", "Decision uncertainty", "Land-use alternatives create meaningful tradeoffs.", 1),
    ],
    sourceIds: ["agenda", "preview", "live-blog"],
    keyFacts: [
      "The item was selected by the City as a topic to watch before the meeting.",
      "The related land-use and zoning actions later passed unanimously.",
    ],
    historicalContext: [
      "The retrospective result illustrates that public prominence and formal disagreement are different signals.",
    ],
    likelyQuestions: [
      "What public infrastructure or operating commitments would accompany the development?",
      "How does the proposal fit existing land-use and transportation plans?",
      "What alternatives or locations were considered?",
    ],
    talkingPoints: [
      "Explain the planning rationale and the limits of the action before Council.",
      "Distinguish zoning approval from later funding or construction decisions.",
    ],
    missingInformation: ["Confirm project financing and phasing details from the official packet."],
  },
  {
    id: "corporate-parkway",
    number: "9.3",
    title: "Corporate Parkway Extension",
    department: "Capital Projects",
    itemType: "Long-range planning",
    reviewStatus: "Draft generated",
    summary:
      "Council considers plan changes related to the Corporate Parkway extension. The item warrants context on transportation planning and future development, but current public evidence does not establish strong controversy.",
    factors: [
      factor("public", "Formal public participation", "The item allows public discussion.", 1),
      factor("household", "Direct household effect", "Near-term household cost is indirect.", 1),
      factor("scale", "Decision scale", "The extension affects long-range transportation planning.", 2),
      factor("attention", "Prior public attention", "The City highlighted the item before the meeting.", 1),
      factor("tradeoff", "Decision uncertainty", "No strong pre-meeting evidence of conflict was located.", 0),
    ],
    sourceIds: ["agenda", "preview", "live-blog"],
    keyFacts: [
      "The City included the extension in its pre-meeting preview.",
      "Related plan changes later passed unanimously.",
    ],
    historicalContext: [
      "A planning item may deserve background preparation even when the final vote is not divided.",
    ],
    likelyQuestions: [
      "What development assumptions support the extension?",
      "How would the project affect traffic patterns and nearby properties?",
      "What future approvals or funding decisions would still be required?",
    ],
    talkingPoints: [
      "Clarify which decision is being made now and which decisions remain future actions.",
      "Prepare maps and cost ranges from the official supporting documents.",
    ],
    missingInformation: ["Confirm current cost estimates and delivery schedule."],
  },
  {
    id: "harvey-road",
    number: "9.2",
    title: "Harvey Road Townhomes",
    department: "Planning and Development",
    itemType: "Development action",
    reviewStatus: "Draft generated",
    summary:
      "Council considers a development action involving townhomes near Harvey Road. Preparation should focus on land use, transportation, neighborhood effects, and the exact scope of the requested approval.",
    factors: [
      factor("public", "Formal public participation", "The development action includes public participation.", 1),
      factor("household", "Direct household effect", "Effects are localized rather than citywide.", 1),
      factor("scale", "Decision scale", "The item is material to the surrounding area.", 1),
      factor("attention", "Prior public attention", "The City selected the item for its public preview.", 2),
      factor("tradeoff", "Decision uncertainty", "Development and neighborhood priorities may differ.", 1),
    ],
    sourceIds: ["agenda", "preview", "live-blog"],
    keyFacts: ["The City identified the townhome item as a topic to watch before the meeting."],
    historicalContext: ["Comparable development items often require clear explanations of the approval boundary."],
    likelyQuestions: [
      "How would the development affect traffic and nearby neighborhoods?",
      "What zoning or land-use changes are being requested?",
      "Which concerns can be addressed through conditions or later design review?",
    ],
    talkingPoints: [
      "Explain the exact approval before Council and any remaining review steps.",
      "Prepare a concise summary of transportation and neighborhood impacts documented in the packet.",
    ],
    missingInformation: ["Confirm the final site plan and staff recommendation."],
  },
]

