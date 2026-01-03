// Singh Automation - Subcontracting Opportunities API v2
// PRODUCTION BUILD - Hard errors, structured logging, no fallbacks
// Deploy to: /api/subcontracting.js on Vercel

export default async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const log = (level, message, data = {}) => {
        console.log(JSON.stringify({ level, requestId, timestamp: new Date().toISOString(), message, ...data }));
    };
    
    log('info', 'Subcontracting scan started');
    
    // CORS - Restrict to allowed origins
    const allowedOrigins = ['https://singh-automation.vercel.app', 'https://singhautomation.com', 'http://localhost:3000', 'http://localhost:5173'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = req.method === 'POST' ? (req.body || {}) : req.query;
        
        const options = {
            daysBack: parseInt(body.daysBack) || 90,
            minAmount: parseInt(body.minAmount) || 500000,
            maxAmount: parseInt(body.maxAmount) || 50000000,
            limit: Math.min(parseInt(body.limit) || 50, 100),
            filterTier: body.filterTier || 'all'
        };

        log('info', 'Fetching opportunities', { options });

        const opportunities = await fetchSubcontractingOpportunities(options, log);
        
        const stats = {
            total: opportunities.length,
            hot: opportunities.filter(o => o.tier === 'hot').length,
            warm: opportunities.filter(o => o.tier === 'warm').length,
            cold: opportunities.filter(o => o.tier === 'cold').length,
            totalValue: opportunities.reduce((sum, o) => sum + (o.awardAmount || 0), 0)
        };

        const totalTime = Date.now() - startTime;
        log('info', 'Subcontracting scan complete', { stats, latencyMs: totalTime });

        return res.status(200).json({
            success: true,
            opportunities,
            stats,
            filters: options,
            dataSources: ['USASpending.gov'],
            requestId,
            timestamp: new Date().toISOString(),
            latencyMs: totalTime
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        log('error', 'Subcontracting scan failed', { error: error.message, latencyMs: totalTime });
        
        return res.status(500).json({
            success: false,
            error: error.message,
            requestId,
            timestamp: new Date().toISOString(),
            latencyMs: totalTime
        });
    }
}

// ============================================
// PRIME CONTRACTOR CONTACT DATABASE
// ============================================
const PRIME_CONTACTS = {
    // Major Construction Primes
    "turner construction": {
        portalUrl: "https://www.turnerconstruction.com/subcontractors",
        email: "turner@tcco.com",
        phone: "(212) 229-6000",
        helpDesk: "servicedesk@tcco.com",
        notes: "Register via Vertikal prequalification platform"
    },
    "hensel phelps": {
        portalUrl: "https://www.henselphelps.com/trade-partners/",
        email: null,
        phone: null,
        supplierDiversity: "blewis@henselphelps.com",
        notes: "Regional contact pages available - select your region for local contacts"
    },
    "fluor": {
        portalUrl: "https://www.fluor.com/sustainability/supply-chain/become-a-supplier",
        email: null,
        notes: "Register through supplier portal"
    },
    "bechtel": {
        portalUrl: "https://www.bechtel.com/suppliers/",
        email: null,
        notes: "Supplier registration required"
    },
    "kiewit": {
        portalUrl: "https://www.kiewit.com/business-with-us/subcontractors/",
        email: null,
        notes: "Prequalification required"
    },
    "skanska": {
        portalUrl: "https://www.usa.skanska.com/about-skanska/subcontractor-information/",
        email: null,
        notes: "Online prequalification system"
    },
    "clark construction": {
        portalUrl: "https://www.clarkconstruction.com/subcontractors",
        email: null,
        notes: "Trade partner registration"
    },
    "mortenson": {
        portalUrl: "https://www.mortenson.com/trade-partners",
        email: null,
        notes: "Trade partner portal"
    },
    "dpr construction": {
        portalUrl: "https://www.dpr.com/trade-partners",
        email: null,
        notes: "Trade partner registration"
    },
    // Defense/IT Primes
    "leidos": {
        portalUrl: "https://www.leidos.com/suppliers",
        email: "supplier.diversity@leidos.com",
        phone: "571-526-6000",
        notes: "Small business liaison office available"
    },
    "saic": {
        portalUrl: "https://www.saic.com/who-we-are/suppliers",
        email: "smallbusiness@saic.com",
        notes: "Small business program office"
    },
    "booz allen": {
        portalUrl: "https://www.boozallen.com/about/supplier-relations.html",
        email: null,
        notes: "Supplier registration portal"
    },
    "lockheed martin": {
        portalUrl: "https://www.lockheedmartin.com/en-us/suppliers.html",
        email: null,
        notes: "Supplier portal - Exostar registration required"
    },
    "northrop grumman": {
        portalUrl: "https://www.northropgrumman.com/suppliers/",
        email: null,
        notes: "Supplier registration via OASIS"
    },
    "raytheon": {
        portalUrl: "https://www.rtx.com/suppliers",
        email: null,
        notes: "RTX supplier portal"
    },
    "bae systems": {
        portalUrl: "https://www.baesystems.com/en/our-company/inc-businesses/supplier-information",
        email: null,
        notes: "Supplier portal registration"
    },
    "l3harris": {
        portalUrl: "https://www.l3harris.com/company/suppliers",
        email: null,
        notes: "Supplier registration"
    },
    "mantech": {
        portalUrl: "https://www.mantech.com/suppliers",
        email: "smallbusiness@mantech.com",
        notes: "Small business program"
    },
    "caci": {
        portalUrl: "https://www.caci.com/teaming-subcontracting",
        email: null,
        notes: "Teaming and subcontracting"
    },
    "peraton": {
        portalUrl: "https://www.peraton.com/suppliers/",
        email: null,
        notes: "Supplier portal"
    },
    // Engineering Primes
    "aecom": {
        portalUrl: "https://aecom.com/about-aecom/suppliers/",
        email: null,
        notes: "Supplier registration"
    },
    "jacobs": {
        portalUrl: "https://www.jacobs.com/about/suppliers",
        email: null,
        notes: "Supplier portal"
    },
    "parsons": {
        portalUrl: "https://www.parsons.com/suppliers/",
        email: null,
        notes: "Supplier registration"
    },
    "tetra tech": {
        portalUrl: "https://www.tetratech.com/suppliers/",
        email: null,
        notes: "Supplier portal"
    }
};

// ============================================
// SINGH AUTOMATION CONFIGURATION
// ============================================
const SINGH_CONFIG = {
    company: {
        name: "Singh Automation",
        cage: "86VF7",
        uei: "GJ1DPYQ3X8K5"
    },
    
    targetNAICS: [
        "333249", "333318", "541330", "541512", "541715", "333923", "332710"
    ],
    
    scopeKeywords: [
        "robot", "robotic", "automation", "automated", "autonomous",
        "conveyor", "material handling", "amr", "agv",
        "vision system", "machine vision", "inspection",
        "welding", "assembly", "manufacturing",
        "warehouse", "distribution", "logistics",
        "plc", "scada", "hmi", "controls",
        "fanuc", "universal robot", "cobot", "collaborative"
    ],
    
    generalContractorTerms: [
        "construction", "general contractor", "building", "facilities",
        "engineering", "logistics", "consulting", "management", "it services",
        "staffing", "support services"
    ],
    
    specialistTerms: [
        "robot", "automat", "fanuc", "kuka", "abb", "yaskawa", "integrat", "motion", "servo"
    ]
};

// ============================================
// GET PRIME CONTACT INFO
// ============================================
function getPrimeContactInfo(recipientName) {
    const nameLower = recipientName.toLowerCase();
    
    for (const [key, info] of Object.entries(PRIME_CONTACTS)) {
        if (nameLower.includes(key)) {
            return info;
        }
    }
    
    return {
        portalUrl: `https://www.google.com/search?q=${encodeURIComponent(recipientName + " subcontractor supplier portal")}`,
        email: null,
        notes: "Search for this company's supplier/subcontractor registration portal",
        isGenericSearch: true
    };
}

// ============================================
// USASPENDING API - AWARD FETCHING
// ============================================
async function fetchSubcontractingOpportunities(options, log) {
    const { daysBack, minAmount, maxAmount, limit } = options;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const url = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
    
    const payload = {
        filters: {
            time_period: [{
                start_date: startDate.toISOString().split('T')[0],
                end_date: new Date().toISOString().split('T')[0]
            }],
            award_type_codes: ["A", "B", "C", "D"],
            award_amounts: [{
                lower_bound: minAmount,
                upper_bound: maxAmount
            }]
        },
        fields: [
            "Award ID",
            "Recipient Name",
            "Recipient UEI",
            "Award Amount",
            "Description",
            "Awarding Agency",
            "Awarding Sub Agency",
            "Place of Performance City",
            "Place of Performance State",
            "NAICS Code",
            "NAICS Description",
            "Start Date",
            "End Date",
            "generated_internal_id"
        ],
        page: 1,
        limit: limit,
        sort: "Award Amount",
        order: "desc"
    };

    const fetchStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const latency = Date.now() - fetchStart;

    if (!response.ok) {
        log('error', 'USASpending API error', { status: response.status, latency });
        throw new Error(`USASpending API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
        log('warn', 'USASpending returned no results', { latency });
        throw new Error('USASpending API returned no results for the given filters');
    }

    log('info', 'USASpending fetch complete', { resultCount: data.results.length, latency });

    // Process and score each opportunity
    const opportunities = data.results.map(award => {
        const scoring = scoreOpportunity(award);
        const contactInfo = getPrimeContactInfo(award["Recipient Name"] || "");
        const outreach = generateOutreachEmail(award, scoring);
        
        return {
            // Core fields - BOTH camelCase and snake_case for compatibility
            awardId: award["Award ID"] || "",
            recipientName: award["Recipient Name"] || "Unknown Contractor",
            recipient_name: award["Recipient Name"] || "Unknown Contractor",
            recipientUei: award["Recipient UEI"] || "",
            description: award["Description"] || "",
            awardAmount: award["Award Amount"] || 0,
            award_amount: award["Award Amount"] || 0,
            agency: award["Awarding Agency"] || award["Awarding Sub Agency"] || "Federal Agency",
            subAgency: award["Awarding Sub Agency"] || "",
            state: award["Place of Performance State"] || "",
            city: award["Place of Performance City"] || "",
            location: award["Place of Performance City"] && award["Place of Performance State"]
                ? `${award["Place of Performance City"]}, ${award["Place of Performance State"]}`
                : award["Place of Performance State"] || "USA",
            naicsCode: award["NAICS Code"] || "",
            naicsDesc: award["NAICS Description"] || "",
            startDate: award["Start Date"] || "",
            endDate: award["End Date"] || "",
            
            // Scoring
            score: scoring.score,
            match_score: scoring.score,
            tier: scoring.tier,
            signals: scoring.signals,
            
            // Outreach
            outreachSubject: outreach.subject,
            outreachBody: outreach.body,
            
            // Contact info
            contact: contactInfo,
            
            // Links
            usaSpendingUrl: award["generated_internal_id"]
                ? `https://www.usaspending.gov/award/${award["generated_internal_id"]}`
                : "https://www.usaspending.gov"
        };
    });

    // Sort by score and filter by tier if requested
    opportunities.sort((a, b) => b.score - a.score);
    
    if (options.filterTier && options.filterTier !== 'all') {
        return opportunities.filter(o => o.tier === options.filterTier);
    }
    
    return opportunities;
}

// ============================================
// SCORING ENGINE
// ============================================
function scoreOpportunity(award) {
    let score = 0;
    const signals = [];
    
    const description = (award["Description"] || "").toLowerCase();
    const recipientName = (award["Recipient Name"] || "").toLowerCase();
    const naicsCode = award["NAICS Code"] || "";
    const awardAmount = award["Award Amount"] || 0;
    const state = award["Place of Performance State"] || "";
    
    // Signal 1: Description contains automation/robotics keywords
    const keywordMatches = SINGH_CONFIG.scopeKeywords.filter(kw => 
        description.includes(kw.toLowerCase())
    );
    if (keywordMatches.length > 0) {
        score += Math.min(keywordMatches.length * 10, 30);
        signals.push(`Scope: ${keywordMatches.slice(0, 3).join(", ")}`);
    }
    
    // Signal 2: Prime is NOT a robotics/automation specialist
    const isAutomationCompany = SINGH_CONFIG.specialistTerms.some(term => 
        recipientName.includes(term)
    );
    
    if (!isAutomationCompany) {
        score += 25;
        signals.push("Prime is not automation specialist");
    }
    
    // Signal 3: Prime appears to be general contractor/construction
    const isGeneralContractor = SINGH_CONFIG.generalContractorTerms.some(term => 
        recipientName.includes(term)
    );
    
    if (isGeneralContractor) {
        score += 20;
        signals.push("General/facilities contractor");
    }
    
    // Signal 4: Large award (more likely to have sub work)
    if (awardAmount >= 10000000) {
        score += 15;
        signals.push("Large contract ($10M+)");
    } else if (awardAmount >= 5000000) {
        score += 12;
        signals.push("Large contract ($5M+)");
    } else if (awardAmount >= 1000000) {
        score += 8;
        signals.push("Mid-size contract ($1M+)");
    }
    
    // Signal 5: Location match (MI or CA)
    if (state === "MI" || state === "CA") {
        score += 10;
        signals.push(`Location: ${state}`);
    }
    
    // Signal 6: NAICS alignment
    if (SINGH_CONFIG.targetNAICS.includes(naicsCode)) {
        score += 10;
        signals.push(`NAICS: ${naicsCode}`);
    }
    
    // Signal 7: Award requires subcontracting plan (contracts > $750k)
    if (awardAmount >= 750000) {
        score += 5;
    }
    
    return {
        score: Math.min(score, 100),
        signals,
        tier: score >= 70 ? "hot" : score >= 50 ? "warm" : "cold"
    };
}

// ============================================
// OUTREACH EMAIL GENERATOR
// ============================================
function generateOutreachEmail(award, scoring) {
    const recipientName = award["Recipient Name"] || "Contractor";
    const description = award["Description"] || "contract";
    const agency = award["Awarding Agency"] || "the government";
    
    const subject = `Subcontracting Support – ${truncate(description, 50)}`;
    
    const body = `Dear ${recipientName} Team,

I noticed your company was recently awarded a contract with ${agency} involving ${truncate(description.toLowerCase(), 100)}.

Singh Automation is a FANUC and Universal Robots authorized integrator specializing in industrial robotics, AI vision systems, and warehouse automation. If your team needs support executing the robotics, automation, or vision systems portion of this contract, we'd welcome the opportunity to discuss teaming.

Our qualifications:
• FANUC Authorized System Integrator (ASI)
• Universal Robots Certified System Partner (CSP)
• CAGE Code: 86VF7 | UEI: GJ1DPYQ3X8K5
• Certified Small Business, MBE, WBENC
• NAICS: 333249, 541330, 541512, 541715

We have facilities in both Michigan and California and can mobilize quickly for projects nationwide.

Would you be available for a brief call this week to explore potential collaboration?

Best regards,

Singh Automation
www.singhautomation.com
(269) 381-6236
2400 E Cork Street, Kalamazoo, MI 49001`;

    return { subject, body };
}

// ============================================
// UTILITIES
// ============================================
function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}
