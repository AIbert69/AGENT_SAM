// SAM.gov API Proxy for Vercel Serverless
// This fetches opportunities from SAM.gov and returns them formatted for the frontend

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // NAICS codes for Singh Automation
    const NAICS_CODES = [
        '333249', // Industrial Machinery Manufacturing
        '541330', // Engineering Services
        '541512', // Computer Systems Design
        '541715', // R&D Physical Sciences
        '238210', // Electrical Contractors
        '333922'  // Conveyor Equipment
    ];

    // Keywords for robotics/automation
    const KEYWORDS = [
        'robot', 'robotic', 'automation', 'PLC', 'FANUC', 'Universal Robots',
        'manufacturing', 'conveyor', 'welding', 'assembly', 'integration'
    ];

    try {
        // Try to fetch from SAM.gov API
        const samApiKey = process.env.SAM_API_KEY;
        
        if (samApiKey) {
            const today = new Date();
            const futureDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
            
            const params = new URLSearchParams({
                api_key: samApiKey,
                postedFrom: today.toISOString().split('T')[0],
                postedTo: futureDate.toISOString().split('T')[0],
                limit: '100',
                naicsCode: NAICS_CODES.join(',')
            });

            const samResponse = await fetch(
                `https://api.sam.gov/opportunities/v2/search?${params}`,
                { headers: { 'Accept': 'application/json' } }
            );

            if (samResponse.ok) {
                const data = await samResponse.json();
                const opportunities = (data.opportunitiesData || []).map(opp => ({
                    id: opp.noticeId,
                    title: opp.title,
                    agency: opp.department || opp.agency,
                    source: 'SAM.gov',
                    sourceType: 'sam',
                    value: opp.award?.amount || estimateValue(opp),
                    match: calculateMatch(opp, NAICS_CODES, KEYWORDS),
                    deadline: opp.responseDeadLine,
                    status: 'review',
                    urgent: isUrgent(opp.responseDeadLine),
                    url: `https://sam.gov/opp/${opp.noticeId}/view`
                }));

                return res.status(200).json({
                    success: true,
                    count: opportunities.length,
                    opportunities: opportunities,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Fallback: Return demo data if API key not set or API fails
        return res.status(200).json({
            success: true,
            count: 5,
            opportunities: getDemoOpportunities(),
            timestamp: new Date().toISOString(),
            note: 'Demo data - set SAM_API_KEY for live data'
        });

    } catch (error) {
        console.error('SAM API Error:', error);
        
        // Return demo data on error
        return res.status(200).json({
            success: true,
            count: 5,
            opportunities: getDemoOpportunities(),
            timestamp: new Date().toISOString(),
            note: 'Demo data due to API error'
        });
    }
}

function estimateValue(opp) {
    // Estimate contract value based on type
    const type = (opp.type || '').toLowerCase();
    if (type.includes('sbir') || type.includes('sttr')) return 750000;
    if (type.includes('sole source')) return 250000;
    if (type.includes('competitive')) return 350000;
    return Math.floor(Math.random() * 400000) + 100000;
}

function calculateMatch(opp, naicsCodes, keywords) {
    let score = 50; // Base score
    
    // Check NAICS match
    if (opp.naicsCode && naicsCodes.includes(opp.naicsCode)) {
        score += 25;
    }
    
    // Check keyword matches in title/description
    const text = ((opp.title || '') + ' ' + (opp.description || '')).toLowerCase();
    const matches = keywords.filter(kw => text.includes(kw.toLowerCase()));
    score += Math.min(matches.length * 5, 25);
    
    return Math.min(score, 100);
}

function isUrgent(deadline) {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const daysUntil = (deadlineDate - new Date()) / (1000 * 60 * 60 * 24);
    return daysUntil <= 14;
}

function getDemoOpportunities() {
    return [
        {
            id: 'demo-1',
            title: 'Robotic Welding System for Defense Manufacturing',
            agency: 'Department of Defense',
            source: 'SAM.gov',
            sourceType: 'sam',
            value: 485000,
            match: 92,
            deadline: '2025-02-14',
            status: 'go',
            urgent: true,
            url: 'https://sam.gov'
        },
        {
            id: 'demo-2',
            title: 'PLC Modernization - Water Treatment Facility',
            agency: 'California Dept of Water Resources',
            source: 'CA eProcure',
            sourceType: 'ca',
            value: 175000,
            match: 78,
            deadline: '2025-02-27',
            status: 'review',
            urgent: false,
            url: '#'
        },
        {
            id: 'demo-3',
            title: 'SBIR Phase II - Advanced Vision Inspection',
            agency: 'NASA',
            source: 'SBIR/STTR',
            sourceType: 'sbir',
            value: 750000,
            match: 88,
            deadline: '2025-01-30',
            status: 'go',
            urgent: true,
            url: 'https://sbir.gov'
        },
        {
            id: 'demo-4',
            title: 'Conveyor System Automation Upgrade',
            agency: 'Michigan Dept of Transportation',
            source: 'MI SIGMA',
            sourceType: 'mi',
            value: 125000,
            match: 65,
            deadline: '2025-03-14',
            status: 'none',
            urgent: false,
            url: '#'
        },
        {
            id: 'demo-5',
            title: 'Collaborative Robot Integration - Manufacturing',
            agency: 'DLA Land and Maritime',
            source: 'DIBBS',
            sourceType: 'dibbs',
            value: 320000,
            match: 81,
            deadline: '2025-02-19',
            status: 'review',
            urgent: false,
            url: 'https://dibbs.bsm.dla.mil'
        }
    ];
}
