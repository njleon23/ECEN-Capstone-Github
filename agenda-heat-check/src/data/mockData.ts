import { AgendaItem, MunicipalDataset, CouncilMeeting, ChatMessage } from '../types';

export const SAMPLE_AGENDA_TEXT = `CITY OF COLLEGE STATION
CITY COUNCIL REGULAR MEETING
OCTOBER 24, 2024 — 6:00 PM
COUNCIL CHAMBERS, 1101 TEXAS AVENUE, COLLEGE STATION, TX

1. Call to Order, Invocation & Pledge of Allegiance.
   - Presiding: Mayor John Nichols.

2. Presentation, Possible Action, and Discussion on Consent Agenda.
   - Routine administrative vouchers, interlocal mutual-aid renewals, and park maintenance authorizations.

3. Approval of Minutes.
   - October 10, 2024 Regular Meeting Minutes & October 16 Workshop Transcript.

4. Item 4 (Docket #2024-C089): Public Hearing & Action regarding Main Street Mixed-Use Corridor Redevelopment and Capital Infrastructure Agreement with Apex Infrastructure Corp.
   - Total fiscal appropriation: $14,250,000.
   - Includes utility easements and pedestrian sidewalk expansion.

5. Item 5 (Docket #2024-O042): Ordinance Amending the Unified Development Ordinance (UDO) Section 6.3 regarding High-Density Student Multi-Family Parking Minimums.
   - Proposed 35% reduction of mandatory tenant spaces along transit routes.

6. Item 6 (Docket #2024-R112): Resolution authorizing City Manager to execute multi-year Enterprise Cloud Data & Dispatch Upgrade with Brazos Valley Communications Group.

7. Item 7 (Docket #2024-Z019): Public Hearing & Action on Zoning Change Request for 1400 University Drive from General Commercial (C-1) to High-Density Commercial Mixed-Use (C-3).
   - Adjacent neighborhood association petition filed in formal protest.

8. Item 8: Citizen Hearing & Open Forum.
   - Registered citizens appearing to address Council on non-agenda or contested municipal actions.`;

export const INITIAL_AGENDA_ITEMS: AgendaItem[] = [
  {
    id: 'itm-04',
    itemNumber: 4,
    docketCode: 'CIP-24-0094',
    title: 'Item 4: Main Street redevelopment contract award to Apex Infrastructure ($14.2M)',
    category: 'Capital Improvement / Public Works',
    heatScore: 92,
    heatTier: 'critical',
    confidence: 94,
    status: 'Reviewed',
    primaryDrivers: [
      "Contractor's prior cost overruns: Apex Infrastructure incurred an 18.4% budget overrun on the 2022 Holleman Drive widening project.",
      "300% spike in negative sentiment about downtown traffic, detour routing, and parking access in resident social feedback & emails.",
      "Northgate business owner petition gathered 240+ verified signatures opposing daytime lane closures during football season."
    ],
    anticipatedQuestions: [
      "Why is Apex being awarded this phase after the $2.1M overrun on Holleman Dr in 2022?",
      "How will the city protect small business customer parking during the projected 9-month street closure?",
      "Are there liquidated damage penalty clauses if construction extends past the August 2025 deadline?"
    ],
    daisTalkingPoints: [
      '"The 2024 contract features strict performance milestones and a $5,000/day liquidated damages clause, unlike the 2022 Holleman agreement."',
      '"A dedicated $150K Business Mitigation Plan will maintain clear pedestrian corridors and designated patron parking."',
      '"Competitive bidding yielded 4 proposals; Apex was the lowest qualified responsible bidder by $840,000."'
    ],
    traceableRecords: [
      {
        name: 'Vendor Ledger: Apex Infra 2022.csv',
        fileType: 'CSV',
        url: 'https://www.cstx.gov/departments/fiscal_services/purchasing/vendor_transparency/APX-901-ledger.csv',
        snippet: 'Vendor ID: APX-901 | FY2022 Holleman Widening | Base: $11.6M | Change Orders: +$2.14M (18.4%) | Cause: Subsurface utility collision & asphalt index escalation.'
      },
      {
        name: 'Q3 Public Sentiment Traffic Report.pdf',
        fileType: 'PDF',
        url: 'https://www.cstx.gov/departments/public_works/traffic_engineering/reports/2024-Q3-traffic-sentiment.pdf',
        snippet: 'Sentiment analysis on 842 resident interactions: 68% oppose proposed 9-month detour. Dominant concern: Northgate business district delivery access.'
      },
      {
        name: 'Northgate Petition Doc #412',
        fileType: 'PDF',
        url: 'https://records.cstx.gov/public/petitions/2024-DOC-412-northgate.pdf',
        snippet: 'Verified petition by 242 local commercial business operators requesting moratorium on daytime lane closures from Aug 20 to Nov 30.'
      },
      {
        name: 'CIP Resolution 2024-88',
        fileType: 'Resolution',
        url: 'https://records.cstx.gov/resolutions/2024/RES-2024-88.pdf',
        snippet: 'Resolution authorizing $14,250,000 appropriation from 2022 General Obligation Bond Fund for Main Street Corridor reconstruction.'
      }
    ]
  },
  {
    id: 'itm-07',
    itemNumber: 7,
    docketCode: 'P&Z Docket #RZ-2024-11',
    title: 'Item 7: Zoning change request for 1400 University Drive (Light Commercial to High-Density Multi-Family)',
    category: 'Planning & Zoning',
    heatScore: 55,
    heatTier: 'moderate',
    confidence: 78,
    status: 'Draft',
    primaryDrivers: [
      'Similar 2024 request on adjacent parcel saw minor noise opposition from neighboring residential subdivision, though ultimately approved 6-1.',
      'Traffic impact analysis indicates peak morning intersection delay increase of 14 seconds.'
    ],
    anticipatedQuestions: [
      'Will this create cut-through traffic into the Southwood Valley neighborhood?',
      'Has College Station ISD confirmed school bus transit safety for this density?'
    ],
    daisTalkingPoints: [
      '"Planning & Zoning Commission unanimously recommended approval (7-0) with deed restrictions prohibiting driveway access on minor residential roads."',
      '"Developer funded a dedicated right-turn deceleration lane."'
    ],
    traceableRecords: [
      {
        name: 'P&Z Commission Minutes Aug 15, 2024',
        fileType: 'Minutes',
        url: 'https://www.cstx.gov/departments/planning_development/p_z_minutes/2024-08-15-pz-official.pdf',
        snippet: 'P&Z vote 7-0 in favor with deed covenant restriction prohibiting primary egress onto Southwood residential roads.'
      },
      {
        name: 'Traffic Impact Study #TR-24-11',
        fileType: 'Technical Report',
        url: 'https://records.cstx.gov/traffic/studies/TR-24-11-university-drive.pdf',
        snippet: 'Analyzed 1,200 weekday trips. Maximum queue length at Lincoln Ave intersection increases by 2.4 vehicles during AM peak.'
      }
    ]
  },
  {
    id: 'itm-02',
    itemNumber: 2,
    docketCode: 'Consent Calendar Item',
    title: 'Item 2: Approval of minutes from the Oct 10, 2024 Regular City Council Meeting',
    category: 'Consent Agenda',
    heatScore: 8,
    heatTier: 'calm',
    confidence: 99,
    status: 'Approved',
    primaryDrivers: [],
    anticipatedQuestions: [
      'Are there any corrections, additions, or clerical amendments submitted by staff or council before approving the minutes as distributed?',
      'Were all citizen comments and public hearing remarks from the October 10 meeting transcribed in compliance with Texas Open Meetings Act §551.021?',
      'Does any councilmember request separating any workshop transcripts for a separate review or amended motion?'
    ],
    daisTalkingPoints: [
      '"Minutes were transcribed by the City Secretary Office and reviewed by Legal with zero statutory variances."',
      '"Standard unanimous consent adoption recommended."'
    ],
    proceduralNote: 'Routine consent procedure with zero public inquiries, zero sentiment anomalies, and standard statutory language.',
    floorAction: '"Move to approve minutes as recorded and distributed."',
    traceableRecords: [
      {
        name: 'Official Minutes Draft Oct 10, 2024.pdf',
        fileType: 'Draft Minutes',
        url: 'https://www.cstx.gov/departments/city_secretary/city_council_agendas_and_minutes/2024-10-10-regular-draft.pdf',
        snippet: 'Approved unanimously on first reading; transcribed by City Secretary Office pursuant to Texas Open Meetings Act §551.021.'
      },
      {
        name: 'TOMA Section 551.021 Transcription Certification.pdf',
        fileType: 'Statutory Record',
        url: 'https://records.cstx.gov/compliance/open_meetings/TOMA-Sec-551-021-certification.pdf',
        snippet: 'Official City Secretary verification certifying proper public record keeping and verbatim recording preservation.'
      }
    ]
  },
  {
    id: 'itm-05',
    itemNumber: 5,
    docketCode: 'Docket #2024-O042',
    title: 'Item 5: Ordinance Amending UDO Section 6.3 regarding Student Multi-Family Parking Minimums',
    category: 'City Ordinances',
    heatScore: 48,
    heatTier: 'moderate',
    confidence: 86,
    status: 'Reviewed',
    primaryDrivers: [
      'Campus area neighborhood associations express apprehension regarding curbside spillover parking.',
      'Developers advocate for transit-oriented reduction to curb student rent escalation.'
    ],
    anticipatedQuestions: [
      'How does parking spillover enforcement work on permit-controlled residential zones adjacent to these multi-family developments?',
      'Has Texas A&M Transportation Services confirmed shuttle capacity along this transit corridor to accommodate reduced vehicle ownership?',
      'Will the 35% reduction in mandatory parking stalls apply to commercial vehicles and visitor spaces or strictly tenant spaces?'
    ],
    daisTalkingPoints: [
      '"Reductions apply strictly to developments situated within 400 feet of an active TAMU transit stop."',
      '"Staff reviewed peer university cities (Auburn, Fayetteville) showing minimal neighborhood displacement when paired with residential permit zones."',
      '"Reduces impervious surface coverage and promotes regional transit alignment."'
    ],
    traceableRecords: [
      {
        name: 'UDO Section 6.3 Amendment Draft.docx',
        fileType: 'Ordinance Text',
        url: 'https://records.cstx.gov/ordinances/drafts/UDO-Sec-6-3-parking-amendment-draft.docx',
        snippet: 'Amends minimum parking spaces from 1.0/bedroom to 0.65/bedroom for qualifying transit-adjacent developments.'
      },
      {
        name: 'P&Z Multi-Family Parking Study Report.pdf',
        fileType: 'Technical Report',
        url: 'https://www.cstx.gov/departments/planning_development/reports/2024-student-parking-ratios.pdf',
        snippet: 'Comprehensive field utilization study conducted by Planning Staff across 14 multi-family developments near campus.'
      }
    ]
  },
  {
    id: 'itm-08',
    itemNumber: 8,
    docketCode: 'Citizen Open Forum',
    title: 'Item 8: Citizen Hearing & Open Forum on Contested Actions',
    category: 'Public Forum',
    heatScore: 42,
    heatTier: 'moderate',
    confidence: 82,
    status: 'Draft',
    primaryDrivers: [
      '3 speakers registered regarding short-term rental noise ordinance revisions.',
      '1 speaker registered re: Northgate drainage easement maintenance.'
    ],
    anticipatedQuestions: [
      'Will council schedule a dedicated public workshop on short-term rentals before the winter recess?',
      'Can council members legally deliberate on citizen grievances raised tonight that are not formally posted on the agenda under Texas Government Code §551.042?',
      'What administrative follow-up timeline does the City Manager\'s office provide for drainage complaints submitted during open forum?'
    ],
    daisTalkingPoints: [
      '"City staff is currently compiling the 2024 STR Code Enforcement Audit, scheduled for Dais presentation in December."',
      '"Council welcomes citizen input and all remarks are entered into official permanent municipal record."',
      '"Under the Texas Open Meetings Act, council may only provide factual statements or propose placing the matter on a future agenda."'
    ],
    traceableRecords: [
      {
        name: 'Speaker Registration Roster Oct 24.csv',
        fileType: 'Roster',
        url: 'https://records.cstx.gov/public/speaker_rosters/2024-10-24-speaker-registration.csv',
        snippet: '4 registered citizen speakers; topics: Short-Term Rental enforcement (3), Northgate drainage (1).'
      },
      {
        name: 'Citizen Participation & Decorum Guidelines.pdf',
        fileType: 'Official Policy',
        url: 'https://www.cstx.gov/departments/city_secretary/citizen_participation_guidelines.pdf',
        snippet: 'Municipal policy establishing 3-minute speaking limit, decorum requirements, and staff referral workflow.'
      }
    ]
  },
  {
    id: 'itm-01',
    itemNumber: 1,
    docketCode: 'Ceremonial / Call to Order',
    title: 'Item 1: Call to Order, Invocation & Pledge of Allegiance',
    category: 'Procedural',
    heatScore: 4,
    heatTier: 'calm',
    confidence: 99,
    status: 'Approved',
    primaryDrivers: [],
    anticipatedQuestions: [
      'Are all seven councilmembers present in Council Chambers to establish a statutory quorum pursuant to City Charter Article IV?',
      'Has public notice of tonight\'s meeting and agenda been continuously posted online and at City Hall for at least 72 hours under Texas Open Meetings Act §551.043?',
      'Are there any conflict of interest disclosures or affidavits filed by councilmembers under Chapter 171 of the Texas Local Government Code?'
    ],
    daisTalkingPoints: [
      '"Quorum established with all members present."',
      '"Notice certified as posted on City Hall bulletin board and cstx.gov on Monday, October 21 at 2:15 PM."'
    ],
    proceduralNote: 'Presiding: Mayor John Nichols. Invocation by Pastor Marcus Vance, Grace Bible Church.',
    floorAction: '"Gavel in at 6:00 PM; call roll of Councilmembers."',
    traceableRecords: [
      {
        name: 'Dais Roll Call Order Oct 24.pdf',
        fileType: 'Roster',
        url: 'https://records.cstx.gov/council/proceedings/2024-10-24-roll-call-order.pdf',
        snippet: 'All 7 Councilmembers confirmed in attendance in person.'
      },
      {
        name: '72-Hour TOMA Notice Posting Verification.pdf',
        fileType: 'Statutory Certification',
        url: 'https://records.cstx.gov/compliance/open_meetings/2024-10-24-notice-certification.pdf',
        snippet: 'Official time-stamped posting certificate executed by City Secretary verifying compliance with Texas Open Meetings Act.'
      }
    ]
  },
  {
    id: 'itm-03',
    itemNumber: 3,
    docketCode: 'Administrative Report',
    title: 'Item 3: Interlocal Mutual-Aid renewals and park maintenance authorizations',
    category: 'Consent Agenda',
    heatScore: 12,
    heatTier: 'calm',
    confidence: 98,
    status: 'Approved',
    primaryDrivers: [],
    anticipatedQuestions: [
      'Does the annual mutual-aid renewal with Brazos County ESD #1 require any cost-share increase or capital equipment commitment from the City of College Station?',
      'How does the mutual-aid response radius impact response times for emergency medical and structure fire calls within municipal boundaries?',
      'Are all park maintenance service contracts in this renewal batch within the approved FY2025 Parks & Recreation departmental operating budget?'
    ],
    daisTalkingPoints: [
      '"Agreement is an automatic zero-cost mutual-aid reciprocity renewal serving the Highway 6 southern corridor."',
      '"Parks maintenance authorizations are fully encumbered in the adopted FY25 Parks Operations budget."'
    ],
    proceduralNote: 'Standard statutory interlocal agreement renewal between City of College Station and Brazos County Emergency Services District #1.',
    floorAction: '"Included on unanimous Consent Agenda motion."',
    traceableRecords: [
      {
        name: 'Interlocal Agreement ESD1-2024.pdf',
        fileType: 'Contract',
        url: 'https://records.cstx.gov/interlocal/agreements/2024-ESD1-mutual-aid-renewal.pdf',
        snippet: 'Automatic annual renewal for mutual fire and rescue response along State Highway 6 corridor.'
      },
      {
        name: 'FY2025 Parks Maintenance Encumbrance Ledger.csv',
        fileType: 'Ledger',
        url: 'https://www.cstx.gov/departments/parks/budget/FY2025-parks-maintenance-contracts.csv',
        snippet: 'Line-item breakdown of outsourced mowing, irrigation repair, and playground inspection contracts.'
      }
    ]
  },
  {
    id: 'itm-06',
    itemNumber: 6,
    docketCode: 'Docket #2024-R112',
    title: 'Item 6: Resolution for Enterprise Cloud Dispatch Upgrade with Brazos Valley Comm Group',
    category: 'Public Safety IT',
    heatScore: 19,
    heatTier: 'calm',
    confidence: 95,
    status: 'Approved',
    primaryDrivers: [
      'Funded through existing 911 dispatch grant reserves; zero ad-valorem tax impact.'
    ],
    anticipatedQuestions: [
      'Does this cloud dispatch upgrade meet 100% FBI CJIS data encryption and off-site redundancy standards?',
      'What backup dispatch protocol activates immediately if the primary cloud connection experiences a wide-area network failure?',
      'What percentage of the multi-year contract is funded by the Texas Commission on State Emergency Communications grant versus local enterprise funds?'
    ],
    daisTalkingPoints: [
      '"The system meets 100% FBI CJIS security policy requirements and ensures interoperability with Bryan PD and TAMU Police."',
      '"Includes dedicated local failover hardware at the primary and secondary dispatch stations."',
      '"80% ($340,000) funded by state NG9-1-1 grant allocation."'
    ],
    traceableRecords: [
      {
        name: 'BVCG Dispatch Contract Spec.pdf',
        fileType: 'Contract',
        url: 'https://records.cstx.gov/contracts/it/2024-BVCG-dispatch-specifications.pdf',
        snippet: 'CJIS-compliant NG9-1-1 cloud architecture funded 80% via Texas Commission on State Emergency Communications grant.'
      },
      {
        name: 'TSEC Grant Award Documentation 2024.pdf',
        fileType: 'Grant Award',
        url: 'https://records.cstx.gov/grants/public_safety/2024-TSEC-dispatch-upgrade.pdf',
        snippet: 'State of Texas Commission on State Emergency Communications grant contract #TSEC-24-CS-09.'
      }
    ]
  }
];

export const MUNICIPAL_DATASETS: MunicipalDataset[] = [
  {
    id: 'ds-cip',
    name: 'FY 2024-25 Capital Improvement Budget.csv',
    category: 'Finance / CIP',
    type: 'CSV',
    itemCount: '1,420 line items',
    active: true,
    lastUpdated: 'Oct 18, 2024',
    description: 'Adopted municipal capital improvement projects, project manager assignments, bond appropriations, and contingency reserve balances.',
    tags: ['CIP', 'Bonds', 'Public Works', 'Budget'],
    sampleRows: [
      { ProjectID: 'CIP-24-0094', Title: 'Main St Corridor Reconstruction', Budget: '$14,250,000', Fund: '2022 GO Bond', PM: 'E. Vance' },
      { ProjectID: 'CIP-22-0041', Title: 'Holleman Dr Widening', Budget: '$11,600,000', Actual: '$13,740,000', Contractor: 'Apex Infrastructure' },
      { ProjectID: 'CIP-24-0102', Title: 'Rock Prairie Road East Extension', Budget: '$8,900,000', Fund: 'Streets CIP', PM: 'K. Miller' }
    ]
  },
  {
    id: 'ds-minutes',
    name: 'Past Council Minutes (2022-2024).json',
    category: 'Legislative History',
    type: 'JSON',
    itemCount: '48 transcripts (Indexed)',
    active: true,
    lastUpdated: 'Oct 12, 2024',
    description: 'Full official council meeting minutes, roll-call voting records, public hearing speaker testimony, and motion transcripts.',
    tags: ['Council Minutes', 'Roll Call', 'Resolutions', 'Ordinances'],
    sampleRows: [
      { Session: '2022-08-11', Item: 'Holleman Dr Bid Award', Vote: '5-2 (Nichols, Smith Nay)', Notes: 'Concerns re: subcontractor capacity' },
      { Session: '2023-03-23', Item: '800 University Dr PUD', Vote: '5-2 Approved', Notes: 'Required drainage retention buffers' },
      { Session: '2024-05-09', Item: 'Northgate Pedestrian Mall Feasibility', Vote: '7-0 Approved', Notes: 'Directs staff to prepare traffic mitigation' }
    ]
  },
  {
    id: 'ds-vendors',
    name: 'Vendor Performance & Cost Overruns Ledger.csv',
    category: 'Procurement / Auditing',
    type: 'CSV',
    itemCount: '320 records • Apex, BVCG',
    active: true,
    lastUpdated: 'Oct 04, 2024',
    description: 'Historical contractor change order rates, on-time delivery audits, liquidated damage assessments, and warranty compliance logs.',
    tags: ['Vendors', 'Audits', 'Change Orders', 'Apex Infra'],
    sampleRows: [
      { Vendor: 'Apex Infrastructure Corp', Project: 'Holleman Widening', Bid: '$11.6M', ChangeOrders: '+$2.14M (+18.4%)', OverrunFlag: 'High' },
      { Vendor: 'Apex Infrastructure Corp', Project: '2021 Water Main Rehab', Bid: '$4.2M', ChangeOrders: '+$1.2M (+28.5%)', OverrunFlag: 'High' },
      { Vendor: 'Brazos Valley Comm Group', Project: '911 Microwave Link', Bid: '$1.8M', ChangeOrders: '$0 (0%)', OverrunFlag: 'Clean' }
    ]
  },
  {
    id: 'ds-sentiment',
    name: 'SeeClickFix & Citizen Comments Q3.csv',
    category: 'Public Feedback / 311',
    type: 'CSV',
    itemCount: '8,900 citizen notes',
    active: true,
    lastUpdated: 'Oct 22, 2024',
    description: 'Aggregated resident tickets, public hearing written submissions, online forum feedback, and email correspondence to the City Secretary.',
    tags: ['311', 'Citizen Voice', 'Traffic', 'Northgate', 'Noise'],
    sampleRows: [
      { Ticket: '311-2024-8841', Topic: 'Northgate Detour', Area: 'University & Main', Sentiment: 'Negative', Notes: 'Delivery trucks blocking access' },
      { Ticket: '311-2024-8910', Topic: 'Student Parking', Area: 'Southwood Valley', Sentiment: 'Negative', Notes: 'Street parked full of student vehicles' },
      { Ticket: '311-2024-9022', Topic: 'Sidewalk Condition', Area: 'Main St Corridor', Sentiment: 'Positive', Notes: 'Appreciates planned sidewalk expansion' }
    ]
  }
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'council',
    text: 'Have we had zoning requests from this developer before, and what was the public reaction?',
    timestamp: '17:42'
  },
  {
    id: 'msg-2',
    sender: 'assistant',
    text: 'Yes. In March 2023, developer Oakridge Partners submitted a PUD amendment for 800 University Dr (Item 6B).\n\nPublic reaction included 4 resident comments concerning stormwater drainage and building height setbacks. Council approved 5-2 after developer added retention pond buffers.',
    citation: 'Council Minutes Mar 23, 2023, p. 14',
    timestamp: '17:42'
  }
];

export const COUNCIL_CALENDAR: CouncilMeeting[] = [
  {
    id: 'meet-2024-10-24',
    title: 'City Council Regular Meeting',
    date: 'Thursday, Oct 24, 2024',
    time: '6:00 PM',
    location: 'College Station City Hall, Council Chambers (1101 Texas Ave)',
    status: 'Ready',
    docketCount: 8,
    criticalCount: 1,
    moderateCount: 2,
    calmCount: 5,
    agendaText: SAMPLE_AGENDA_TEXT
  },
  {
    id: 'meet-2024-11-05',
    title: 'Special Workshop & Mid-Year Budget Review',
    date: 'Tuesday, Nov 5, 2024',
    time: '4:00 PM',
    location: 'Bush 414 Briefing Room, City Hall',
    status: 'Upcoming',
    docketCount: 5,
    criticalCount: 0,
    moderateCount: 3,
    calmCount: 2
  },
  {
    id: 'meet-2024-11-18',
    title: 'Planning & Zoning Commission Joint Hearing',
    date: 'Monday, Nov 18, 2024',
    time: '7:00 PM',
    location: 'Council Chambers',
    status: 'Upcoming',
    docketCount: 6,
    criticalCount: 1,
    moderateCount: 3,
    calmCount: 2
  },
  {
    id: 'meet-2024-12-12',
    title: 'City Council Regular Meeting & End-of-Year CIP Review',
    date: 'Thursday, Dec 12, 2024',
    time: '6:00 PM',
    location: 'Council Chambers',
    status: 'Upcoming',
    docketCount: 10,
    criticalCount: 2,
    moderateCount: 3,
    calmCount: 5
  }
];

export const CIVIC_LOGO_URL = 'https://lh3.googleusercontent.com/aida/AEtjO1UcPp7Hb9gyXy40r2XZR4Wg4uAKVq9qSHP-48Q0Zbektr1P6zsuujBUG15yLfi41zXM-IsLkNx4wmgVYSmpwnTyf4AIbciJPUbRCcLVk24HY77gB3U7qOhvKFEqYu0ExxjkXYLz9KcWxXaw9dQyZEmjUg1RmeAwcpEmH5Tj2-PAvcbpN7ovvoY024zsWDX1gX32cbMGNZ6pn_TLWFtNkJG9dPGp-RKR7PNYmjiC5OONWu1wsSAKuIA-FQ';
