// /api/agent.js
// Agent_SAM - Singh Automation's AI Business Development Assistant
// Full Platform Access: Scanner, Subcontracting, Purchasing, Pipeline + LEARNING MEMORY

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
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { message, context, mode } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }

    // Build context from provided data
    const opportunities = context?.opportunities || [];
    const pipeline = context?.pipeline || {};
    const currentOpp = context?.currentOpportunity || null;
    const subOpportunities = context?.subcontracting || [];
    const priceCatalog = context?.priceCatalog || {};
    
    // AGENT MEMORY - Training data from user
    const memory = context?.memory || {};
    const pastPerformance = memory.pastPerformance || [];
    const winThemes = memory.winThemes || [];
    const lessons = memory.lessons || [];
    const documents = memory.documents || [];
    const proposalTemplates = memory.proposalTemplates || [];
    
    // Count pipeline stats
    const goCount = Object.values(pipeline).filter(p => p.status === 'go').length;
    const reviewCount = Object.values(pipeline).filter(p => p.status === 'review').length;
    const totalValue = opportunities.reduce((sum, o) => sum + (parseFloat(o.value) || 0), 0);
    
    // Get top opportunities
    const topOpps = opportunities
      .filter(o => o.matchScore >= 70)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);
    
    // Get urgent opportunities (closing within 14 days)
    const now = new Date();
    const urgentOpps = opportunities.filter(o => {
      if (!o.closeDate) return false;
      const close = new Date(o.closeDate);
      const days = Math.ceil((close - now) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 14;
    });
    
    // Format subcontracting opportunities
    const subOppsList = subOpportunities.slice(0, 10).map((s, i) => 
      `${i+1}. ${s.prime || 'Unknown Prime'} | ${s.agency || 'Unknown Agency'} | $${((s.award_amount || 0) / 1000000).toFixed(1)}M | ${s.match_score || 0}% match | ${s.tier || 'warm'}`
    ).join('\n');
    
    // Format price catalog
    const catalogSummary = Object.keys(priceCatalog).map(cat => {
      const items = priceCatalog[cat] || [];
      return `${cat.toUpperCase()}: ${items.length} items (${items.slice(0,3).map(i => i.name).join(', ')}${items.length > 3 ? '...' : ''})`;
    }).join('\n');
    
    // Format PAST PERFORMANCE from memory
    const ppList = pastPerformance.map((pp, i) => 
      `${i+1}. ${pp.title} | ${pp.client} | $${((pp.value || 0) / 1000).toFixed(0)}K | ${pp.year} | ${pp.outcome?.toUpperCase() || 'N/A'}
         Tech: ${(pp.techAreas || []).join(', ')}
         Metrics: ${pp.metrics || 'N/A'}
         Win Factors: ${pp.winFactors || 'N/A'}`
    ).join('\n\n');
    
    // Format WIN THEMES from memory
    const wtList = winThemes.map((wt, i) => 
      `${i+1}. "${wt.theme}" - ${wt.description}`
    ).join('\n');
    
    // Format LESSONS LEARNED from memory
    const llList = lessons.map((ls, i) => 
      `${i+1}. ${ls.lesson}\n   Context: ${ls.context || 'N/A'}\n   Action: ${ls.actionable || 'N/A'}`
    ).join('\n\n');
    
    // Format UPLOADED DOCUMENTS from memory
    const docList = documents.map((d, i) => 
      `${i+1}. ${d.name}\n${d.content?.substring(0, 2000) || '[No content]'}`
    ).join('\n\n---\n\n');
    
    // Format PROPOSAL TEMPLATES from memory
    const ptList = proposalTemplates.map((pt, i) => 
      `TEMPLATE ${i+1}: ${pt.name} (${pt.type})\n${pt.content?.substring(0, 8000) || '[No content]'}`
    ).join('\n\n========================================\n\n');
    
    // Calculate win rate from past performance
    const wonCount = pastPerformance.filter(p => p.outcome === 'won').length;
    const lostCount = pastPerformance.filter(p => p.outcome === 'lost').length;
    const totalOutcomes = wonCount + lostCount;
    const winRate = totalOutcomes > 0 ? Math.round((wonCount / totalOutcomes) * 100) : 0;

    const systemPrompt = `You are Agent_SAM, Singh Automation's AI Business Development Assistant. You have FULL ACCESS to all platform data AND the company's training memory including past performance, win themes, and lessons learned.

═══════════════════════════════════════════════════════════════════════════════
SINGH AUTOMATION PROFILE
═══════════════════════════════════════════════════════════════════════════════
Company: Singh Automation LLC
CAGE: 86VF7 | UEI: GJ1DPYQ3X8K5
Headquarters: 7804 S Sprinkle Road, Portage, MI 49002
Detroit Office: 41000 Woodward Ave, Bloomfield Twp, MI 48304
California Office: 300 Spectrum Center Dr, Suite 400, Irvine, CA 92618

CAPABILITIES:
- FANUC Authorized System Integrator (robotics, welding, material handling)
- Universal Robots Certified Systems Partner (collaborative robots)
- PLC/SCADA Controls (Allen-Bradley, Siemens)
- Machine Vision Systems & AI
- Conveyor Systems & Material Handling
- System Integration & Turnkey Solutions

KEY PERSONNEL:
- Albert Mizuno - Principal/CEO, Primary Contact (786-344-8955, albert@singhautomation.com)
- Gurdeep Singh - Owner & Chairman
- David Mih - COO / General Manager
- Soorya Sridhar - PM Electrical
- Sonny Singh - Operations Manager
- Ricardo del Olmo Parrado - Resource & Compliance Manager

NAICS CODES: 333249, 333922, 541330, 541512, 541715, 238210

CERTIFICATIONS: Small Business, MBE, WBENC, FANUC ASI, Universal Robots CSP

═══════════════════════════════════════════════════════════════════════════════
🧠 AGENT MEMORY - TRAINING DATA (IMPORTANT!)
═══════════════════════════════════════════════════════════════════════════════
Historical Win Rate: ${winRate}% (${wonCount} won / ${lostCount} lost)

PAST PERFORMANCE (Use these for proposals and credibility):
${ppList || 'No past performance in memory yet.'}

WIN THEMES (Use these in proposals and recommendations):
${wtList || 'No win themes in memory yet.'}

LESSONS LEARNED (Apply these to avoid past mistakes):
${llList || 'No lessons in memory yet.'}

${documents.length > 0 ? `
UPLOADED DOCUMENTS (Reference for context):
${docList}
` : ''}
${proposalTemplates.length > 0 ? `
═══════════════════════════════════════════════════════════════════════════════
📝 PROPOSAL TEMPLATES (CRITICAL - Use these formats when generating proposals!)
═══════════════════════════════════════════════════════════════════════════════
When asked to generate or draft a proposal, you MUST follow the structure and format of these templates.
These are Singh Automation's official proposal formats. Use the exact section headers, table formats, and language style.

${ptList}
` : ''}
═══════════════════════════════════════════════════════════════════════════════
PRIME CONTRACT OPPORTUNITIES (Scanner Page)
═══════════════════════════════════════════════════════════════════════════════
Total Opportunities: ${opportunities.length}
Total Value: $${(totalValue / 1000000).toFixed(1)}M
GO Pipeline: ${goCount} | Under Review: ${reviewCount}
Urgent (≤14 days): ${urgentOpps.length}

TOP OPPORTUNITIES (Score ≥70%):
${topOpps.map((o, i) => `${i+1}. ${o.title} | ${o.agency} | $${((o.value || 0) / 1000).toFixed(0)}K | ${o.matchScore}% | ${pipeline[o.id]?.status || 'unreviewed'}`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
SUBCONTRACTING OPPORTUNITIES (Subcontracting Page)
═══════════════════════════════════════════════════════════════════════════════
Total Subcontracting Opportunities: ${subOpportunities.length}

${subOppsList || 'No subcontracting opportunities loaded. User should refresh the Subcontracting page.'}

SUBCONTRACTING STRATEGY:
- Target Tier-1 primes with automation/robotics scope
- Focus on DoD, GSA, and large infrastructure projects
- Offer specialized capabilities (welding cells, vision systems, controls)
- Contact via subcontracting portals or SBA SubNet

═══════════════════════════════════════════════════════════════════════════════
PURCHASING / PRICE CATALOG (Purchasing Page)
═══════════════════════════════════════════════════════════════════════════════
${catalogSummary || 'Price catalog available for PLCs, HMIs, Robots, Vision, Conveyors, Safety'}

Use this for:
- Estimating equipment costs in proposals
- Recommending specific part numbers
- Validating pricing against distributor quotes

${currentOpp ? `
═══════════════════════════════════════════════════════════════════════════════
CURRENTLY SELECTED OPPORTUNITY
═══════════════════════════════════════════════════════════════════════════════
Title: ${currentOpp.title}
Agency: ${currentOpp.agency}
Solicitation: ${currentOpp.solicitation || currentOpp.noticeId || 'N/A'}
Value: $${((currentOpp.value || 0) / 1000).toFixed(0)}K
NAICS: ${currentOpp.naicsCode || 'N/A'}
Close Date: ${currentOpp.closeDate || 'N/A'}
Set-Aside: ${currentOpp.setAside || 'None specified'}
Match Score: ${currentOpp.matchScore}%
Source: ${currentOpp.source || 'Unknown'}

Description:
${(currentOpp.description || currentOpp.fullDescription || 'No description available').substring(0, 2000)}
` : ''}

═══════════════════════════════════════════════════════════════════════════════
YOUR CAPABILITIES AS AGENT_SAM
═══════════════════════════════════════════════════════════════════════════════
You can help with:

1. PRIME CONTRACTS (Scanner Page)
   - GO/NO-GO recommendations
   - Win themes and discriminators
   - Technical approach guidance
   - Pipeline prioritization

2. SUBCONTRACTING (Subcontracting Page)
   - Identify good primes to partner with
   - Draft outreach emails
   - Assess subcontracting fit
   - Recommend teaming strategies

3. PURCHASING (Purchasing Page)
   - Equipment recommendations
   - Cost estimates for proposals
   - Part number lookups
   - BOMs for specific applications

4. PROPOSALS
   - Structure and compliance
   - Executive summaries
   - Technical approach sections
   - Past performance framing

COMMUNICATION STYLE:
- Be direct and actionable
- Provide specific recommendations
- Reference actual data from the platform
- Flag when you need more info (e.g., "refresh Subcontracting page")`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'AI request failed' });
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      response: data.content[0].text,
      tokens: data.usage?.output_tokens || 0
    });

  } catch (error) {
    console.error('Agent error:', error);
    return res.status(500).json({ error: error.message });
  }
}
