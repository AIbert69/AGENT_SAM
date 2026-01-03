// /api/generate-section.js
// Singh Automation - Section Generator with REAL Company Data
// v3 - Uses verified information only, marks gaps clearly

export default async function handler(req, res) {
  // CORS - Restrict to allowed origins
  const allowedOrigins = ['https://singh-automation.vercel.app', 'https://singhautomation.com', 'http://localhost:3000', 'http://localhost:5173'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ success: false, error: 'API key not configured' });
  }

  try {
    const { section, opportunity } = req.body;
    
    if (!section || !opportunity) {
      return res.status(400).json({ success: false, error: 'Missing section or opportunity' });
    }

    const title = opportunity.title || 'Government Contract';
    const agency = opportunity.agency || opportunity.departmentName || 'Government Agency';
    const desc = opportunity.description || '';
    const value = opportunity.value ? `$${Number(opportunity.value).toLocaleString()}` : 'TBD';
    const solicitation = opportunity.noticeId || opportunity.id || '[SOLICITATION #]';
    
    // Determine agency type
    const isState = agency.toLowerCase().includes('state') || 
                    agency.toLowerCase().includes('dtmb') || 
                    agency.toLowerCase().includes('county') ||
                    agency.toLowerCase().includes('dgs');

    const systemPrompt = `You are a proposal writer for Singh Automation LLC. 

CRITICAL RULES:
1. Use ONLY verified company information - never invent metrics or claims
2. Mark sections needing input with **[ACTION REQUIRED: description]**
3. Use confident but honest language
4. ${isState ? 'This is a STATE/LOCAL opportunity - do not use federal jargon' : 'This is a FEDERAL opportunity - use appropriate terminology'}

VERIFIED SINGH AUTOMATION DATA:
- Legal Name: Singh Automation LLC
- CAGE: 86VF7 | UEI: GJ1DPYQ3X8K5
- HQ: 7804 S Sprinkle Road, Portage, MI 49002
- Detroit: 41000 Woodward Ave, Bloomfield Twp, MI 48304
- California: 300 Spectrum Center Dr, Suite 400, Irvine, CA 92618
- Contact: gs@singhautomation.com

KEY PERSONNEL (REAL NAMES):
- Gurdeep Singh - Owner/Chairman (Executive Sponsor)
- David Mih - COO/GM (Program Manager)
- Soorya Sridhar - PM Electrical (Technical Lead - Controls)
- Sonny Singh - Operations Manager (Technical Lead - Mechanical)
- Ricardo del Olmo Parrado - Compliance Manager (QA Lead)

CAPABILITIES:
- FANUC robotics integration (Authorized System Integrator)
- Universal Robots integration (CSP Partner)
- PLC programming (Allen-Bradley, Siemens)
- Machine vision systems
- Turnkey system integration
- FAT/SAT testing

Write professional proposal content using numbered sections (1.0, 1.1, etc).`;

    const sectionPrompts = getSectionPrompt(section, { title, agency, desc, value, solicitation, isState });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: sectionPrompts }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ success: false, error: 'AI request failed' });
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      content: data.content[0].text,
      section: section
    });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

function getSectionPrompt(section, opp) {
  const prompts = {
    executive: `Write an EXECUTIVE SUMMARY for this opportunity:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}
- Solicitation: ${opp.solicitation}
- Value: ${opp.value}
- Description: ${opp.desc}

Include:
1.0 EXECUTIVE SUMMARY
- Opening: Singh Automation's interest and capability statement
- 1.1 Understanding of Requirements (reference the description)
- 1.2 Proposed Solution Overview (FANUC robotics, controls integration)
- 1.3 Why Singh Automation (small business, Michigan HQ, OEM partnerships, experienced team)
- 1.4 Commitment statement

Keep to 1-1.5 pages. Use confident language. Do not invent metrics.`,

    technical: `Write a TECHNICAL APPROACH for this opportunity:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}
- Description: ${opp.desc}
- Value: ${opp.value}

Include:
2.0 TECHNICAL APPROACH
- 2.1 Technical Understanding (what the customer needs)
- 2.2 Proposed Solution
  - Equipment: FANUC Arc Mate or appropriate robot model
  - Controls: Allen-Bradley PLC integration
  - Safety: Light curtains, guarding per OSHA/NFPA 79
- 2.3 Implementation Phases
  - Phase 1: Design & Engineering (weeks 1-4)
  - Phase 2: Fabrication & FAT (weeks 5-10)
  - Phase 3: Installation & SAT (weeks 11-14)
  - Phase 4: Training & Closeout (weeks 15-16)
- 2.4 Deliverables (list key deliverables)
- 2.5 Value-Added (engineering support from Chennai, multiple locations)

Use tables where helpful. 2-3 pages.`,

    management: `Write a MANAGEMENT APPROACH for this opportunity:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}
- Value: ${opp.value}

Include:
3.0 MANAGEMENT APPROACH
- 3.1 Organization Structure
  - Executive Sponsor: Gurdeep Singh (Owner)
  - Program Manager: David Mih (COO)
  - Technical Lead: Soorya Sridhar or Sonny Singh
  - QA Lead: Ricardo del Olmo Parrado
- 3.2 Roles & Responsibilities (brief for each)
- 3.3 Communication Plan
  - Kickoff meeting
  - Weekly status calls
  - Monthly progress reports
  - Issue escalation path
- 3.4 Schedule Management
- 3.5 Risk Management approach

1-2 pages. Use real names.`,

    personnel: `Write a KEY PERSONNEL section for this opportunity:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}

Include:
4.0 KEY PERSONNEL

4.1 Program Manager: David Mih
- Current Role: COO / General Manager, Singh Automation
- Responsibilities: Day-to-day operations, program management, production oversight
- Qualifications: [Note: **[ACTION REQUIRED: Add specific qualifications, years experience]**]

4.2 Technical Lead: Soorya Sridhar
- Current Role: Project Manager - Electrical
- Responsibilities: Controls engineering, robot programming, PLC integration, system integration
- Qualifications: [Note: **[ACTION REQUIRED: Add specific qualifications]**]

4.3 Operations/Integration Lead: Sonny Singh
- Current Role: Operations Manager
- Responsibilities: Mechanical systems, fabrication, assembly, FAT, SAT
- Qualifications: [Note: **[ACTION REQUIRED: Add specific qualifications]**]

4.4 QA/Compliance Manager: Ricardo del Olmo Parrado
- Current Role: Resource & Compliance Manager
- Responsibilities: Documentation compliance, quality control, customer communication
- Qualifications: [Note: **[ACTION REQUIRED: Add specific qualifications]**]

**[ACTION REQUIRED: Attach resumes for all key personnel]**

1-2 pages.`,

    past: `Write a PAST PERFORMANCE section:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}
- Description: ${opp.desc}

Include:
5.0 PAST PERFORMANCE

5.1 Overview
Singh Automation has delivered robotics and automation solutions for industrial clients across automotive, manufacturing, and other sectors. Representative project references are provided below.

5.2 Reference 1
- Project: **[ACTION REQUIRED: Insert project name]**
- Customer: **[ACTION REQUIRED: Insert customer name]**
- Contract Value: **[ACTION REQUIRED: Insert value]**
- Period of Performance: **[ACTION REQUIRED: Insert dates]**
- Scope: **[ACTION REQUIRED: Describe - e.g., "Design, fabrication, and installation of robotic welding cell including FANUC robot, positioner, and safety systems"]**
- Relevance: **[ACTION REQUIRED: Explain how this project is similar to current requirement]**
- Point of Contact: **[ACTION REQUIRED: Name, Title, Phone, Email - obtain permission before listing]**

5.3 Reference 2
[Same structure as above]

5.4 Reference 3
[Same structure as above]

Note: Additional references available upon request.

**[ACTION REQUIRED: Complete all reference information before submission. Obtain POC permission to list as reference.]**`,

    quality: `Write a QUALITY ASSURANCE section:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}

Include:
6.0 QUALITY ASSURANCE PLAN

6.1 Quality Management Approach
Singh Automation maintains quality control throughout the project lifecycle. Our QA/Compliance Manager, Ricardo del Olmo Parrado, oversees documentation compliance and quality processes.

6.2 Design Quality
- Design reviews at 30%, 60%, 90% completion
- Customer approval gates before fabrication

6.3 Fabrication Quality
- Incoming inspection of components
- In-process inspection checkpoints
- Weld inspection per AWS standards (if applicable)

6.4 Factory Acceptance Test (FAT)
- Functional testing of all systems
- Safety system verification
- Customer witness test invitation
- Punch list resolution before shipment

6.5 Site Acceptance Test (SAT)
- Installation verification
- Integration testing with facility systems
- Performance validation
- Operator training verification

6.6 Documentation Control
- Controlled document numbering
- Revision tracking
- As-built documentation package

6.7 Non-Conformance Management
- Issue identification and documentation
- Root cause analysis
- Corrective action implementation
- Verification of effectiveness

1-1.5 pages.`,

    risk: `Write a RISK MANAGEMENT section:

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency}
- Description: ${opp.desc}

Include:
7.0 RISK MANAGEMENT

7.1 Risk Management Approach
Singh Automation proactively identifies, assesses, and mitigates project risks. The Program Manager maintains a risk register reviewed during weekly status meetings.

7.2 Risk Assessment
Risks are evaluated by Probability (L/M/H) and Impact (L/M/H).

7.3 Identified Risks and Mitigations

Risk 1: Equipment Lead Time
- Description: Long lead times for robot or major components could delay schedule
- Probability: Medium | Impact: High
- Mitigation: Early ordering upon contract award; maintain relationships with FANUC and suppliers
- Contingency: Expedited shipping; schedule adjustment with customer approval

Risk 2: Site Integration Complexity
- Description: Unforeseen site conditions affecting installation
- Probability: Medium | Impact: Medium
- Mitigation: Pre-installation site survey; detailed interface control document
- Contingency: On-site engineering support; schedule buffer

Risk 3: Resource Availability
- Description: Key personnel availability during critical phases
- Probability: Low | Impact: High
- Mitigation: Cross-training of team members; early resource commitment
- Contingency: Backup personnel identified; subcontractor support if needed

Risk 4: Requirements Changes
- Description: Customer requirements changes affecting scope/schedule
- Probability: Medium | Impact: Medium
- Mitigation: Clear requirements documentation; formal change control process
- Contingency: Change order process; schedule/cost adjustment

Risk 5: Safety/Compliance Issues
- Description: Safety system design not meeting standards
- Probability: Low | Impact: High
- Mitigation: Early safety concept review; compliance checklist
- Contingency: Rework before SAT; third-party safety audit if needed

7.4 Risk Monitoring
Risk register reviewed weekly. High risks escalated to customer immediately.

1-1.5 pages.`
  };

  return prompts[section] || prompts.executive;
}
