/**
 * @fileoverview SAM.gov and Multi-Portal Scanner API v1
 * @module api/v1/scan
 *
 * Scans multiple government procurement portals including:
 * - SAM.gov Federal Contracts
 * - SBIR/STTR Opportunities
 * - Grants.gov
 * - State Procurement Portals
 * - County Procurement (CA, MI)
 * - DLA DIBBS
 *
 * @author Singh Automation
 * @version 2.0.0
 */

import config from '../../lib/config.js';
import { qualifyOpportunity } from '../../lib/qualification.js';
import { validateInput, emailSubscriptionSchema, sanitizeHtml } from '../../lib/validation.js';
import { fetchWithTimeout, ExternalApiError, handleApiError } from '../../lib/errors.js';
import { handleCors } from '../../middleware/cors.js';
import { scanRateLimiter } from '../../middleware/rate-limit.js';
import { setupRequest } from '../../middleware/security.js';

// =============================================================================
// PORTAL DATA
// =============================================================================

/**
 * State procurement portal definitions
 */
const STATE_PORTALS = [
    {
        id: 'ca-eprocure-1',
        title: 'Search CA State Opportunities',
        agency: 'California DGS',
        solicitation: 'Cal eProcure Portal',
        link: 'https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx',
        description: 'Browse California state procurement opportunities. Search for automation, robotics, PLC, SCADA, conveyor systems.',
        setAside: 'Various',
        state: 'CA',
    },
    {
        id: 'mi-sigma-1',
        title: 'Search Michigan State Opportunities',
        agency: 'Michigan DTMB',
        solicitation: 'SIGMA VSS Portal',
        link: 'https://www.michigan.gov/budget/budget-offices/sigma/doing-business-with-the-state',
        description: 'Browse Michigan state procurement opportunities. Search for automation, welding, robotics, controls.',
        setAside: 'Various',
        state: 'MI',
    },
    {
        id: 'tx-smartbuy-1',
        title: 'Search Texas State Opportunities',
        agency: 'Texas DIR',
        solicitation: 'SmartBuy Portal',
        link: 'https://www.txsmartbuy.com/sp',
        description: 'Browse Texas state procurement opportunities for automation and industrial equipment.',
        setAside: 'HUB',
        state: 'TX',
    },
];

/**
 * California county procurement portals
 */
const CA_COUNTY_PORTALS = [
    { id: 'ca-orange-1', title: 'Orange County Procurement', agency: 'Orange County CPO', county: 'Orange', link: 'https://cpo.oc.gov/open-bids-county-contracts-portal', contact: { phone: '714-567-7314', email: 'cpo@ceo.ocgov.com' } },
    { id: 'ca-la-1', title: 'Los Angeles County Procurement', agency: 'LA County ISD', county: 'Los Angeles', link: 'https://doingbusiness.lacounty.gov/', contact: { phone: '323-267-2725', email: 'ISDVendorRelations@isd.lacounty.gov' } },
    { id: 'ca-sd-1', title: 'San Diego County Procurement', agency: 'SD County Purchasing', county: 'San Diego', link: 'https://www.sandiegocounty.gov/content/sdc/purchasing/solicitations.html', contact: { phone: '858-505-6367', email: 'cosd_procurement@sdcounty.ca.gov' } },
    { id: 'ca-sd-city', title: 'City of San Diego Procurement', agency: 'City of San Diego Purchasing', county: 'San Diego', link: 'https://www.sandiego.gov/purchasing/bids', contact: { phone: '619-236-6000', email: 'purchasing@sandiego.gov' } },
    { id: 'ca-sd-port', title: 'Port of San Diego Procurement', agency: 'Port of San Diego', county: 'San Diego', link: 'https://www.portofsandiego.org/procurement', contact: { phone: '619-686-6200' } },
    { id: 'ca-sd-water', title: 'SD County Water Authority', agency: 'SDCWA', county: 'San Diego', link: 'https://www.sdcwa.org/doing-business-with-us', contact: { phone: '858-522-6600' } },
    { id: 'ca-riverside-1', title: 'Riverside County Procurement', agency: 'Riverside County Purchasing', county: 'Riverside', link: 'https://purchasing.rivco.org/', contact: { phone: '951-955-3100' } },
    { id: 'ca-sb-1', title: 'San Bernardino County Procurement', agency: 'SB County Purchasing', county: 'San Bernardino', link: 'https://purchasing.sbcounty.gov/', contact: { phone: '909-387-2060' } },
];

/**
 * Michigan county procurement portals
 */
const MI_COUNTY_PORTALS = [
    { id: 'mi-kalamazoo-1', title: 'Kalamazoo County Procurement', agency: 'Kalamazoo County', county: 'Kalamazoo', link: 'https://www.kalcounty.com/purchasing/', contact: { phone: '269-384-8111' } },
    { id: 'mi-kent-1', title: 'Kent County Procurement (Grand Rapids)', agency: 'Kent County', county: 'Kent', link: 'https://www.accesskent.com/Departments/Purchasing/', contact: { phone: '616-632-7720' } },
    { id: 'mi-wayne-1', title: 'Wayne County Procurement (Detroit)', agency: 'Wayne County', county: 'Wayne', link: 'https://waynecounty.com/departments/procurement/', contact: { phone: '313-224-0900' } },
    { id: 'mi-oakland-1', title: 'Oakland County Procurement', agency: 'Oakland County', county: 'Oakland', link: 'https://www.oakgov.com/purchasing/', contact: { phone: '248-858-0530' } },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Formats date for SAM.gov API
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date (MM/DD/YYYY)
 */
function formatSamDate(date) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

/**
 * Creates a portal opportunity object
 * @param {Object} portal - Portal definition
 * @param {string} type - Portal type
 * @param {string} source - Source label
 * @returns {Object} - Opportunity object
 */
function createPortalOpportunity(portal, type, source) {
    return {
        id: portal.id,
        noticeId: portal.id,
        title: portal.title,
        solicitation: portal.solicitation || `${portal.county || portal.state} Portal`,
        agency: portal.agency,
        postedDate: new Date().toISOString().split('T')[0],
        closeDate: null,
        setAside: portal.setAside || 'Small Business',
        naicsCode: '333249',
        value: null,
        description: portal.description || `${portal.county || portal.state} procurement portal`,
        link: portal.link,
        isLive: true,
        isPortal: true,
        source,
        type,
        category: type === 'state' ? 'State' : 'County',
        contact: portal.contact,
        state: portal.state,
        county: portal.county,
        status: 'Review',
        statusReason: 'Portal - search for relevant opportunities',
        recommendation: 'Review',
        qualification: {
            status: 'Review',
            reason: 'Procurement portal - search for opportunities',
            breakdown: { portal: portal.link }
        }
    };
}

// =============================================================================
// API FETCHERS
// =============================================================================

/**
 * Fetches opportunities from SAM.gov
 * @param {string} apiKey - SAM.gov API key
 * @param {string[]} keywords - Search keywords
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @param {Function} log - Logger function
 * @returns {Promise<Object[]>} - Array of opportunities
 */
async function fetchSamOpportunities(apiKey, keywords, fromDate, toDate, log) {
    const opportunities = [];
    const seenIds = new Set();

    const urls = keywords.map(kw => ({
        url: `https://api.sam.gov/prod/opportunities/v2/search?api_key=${apiKey}&keyword=${encodeURIComponent(kw)}&postedFrom=${encodeURIComponent(formatSamDate(fromDate))}&postedTo=${encodeURIComponent(formatSamDate(toDate))}&limit=15`,
        keyword: kw
    }));

    const results = await Promise.all(
        urls.map(async ({ url, keyword }) => {
            try {
                const response = await fetchWithTimeout(url, `SAM:${keyword}`, {
                    timeout: config.timeouts.fetch,
                    retry: true
                });
                return await response.json();
            } catch (error) {
                log('warn', `SAM.gov ${keyword} fetch failed`, { error: error.message });
                return null;
            }
        })
    );

    for (const data of results) {
        if (!data?.opportunitiesData) continue;

        for (const o of data.opportunitiesData) {
            if (seenIds.has(o.noticeId)) continue;
            seenIds.add(o.noticeId);

            opportunities.push({
                id: o.noticeId,
                noticeId: o.noticeId,
                title: sanitizeHtml(o.title || 'Untitled'),
                solicitation: o.solicitationNumber || o.noticeId,
                agency: sanitizeHtml(o.fullParentPathName || o.departmentName || 'Federal Agency'),
                postedDate: o.postedDate,
                closeDate: o.responseDeadLine,
                setAside: o.typeOfSetAsideDescription || '',
                naicsCode: o.naicsCode || '',
                value: o.award?.amount || null,
                description: sanitizeHtml((o.description || '').substring(0, 1000)),
                fullDescription: o.description || '',
                link: `https://sam.gov/opp/${o.noticeId}/view`,
                isLive: true,
                source: 'SAM.gov',
                type: 'contract',
                category: 'Federal'
            });
        }
    }

    log('info', 'SAM.gov fetch complete', { count: opportunities.length });
    return opportunities;
}

/**
 * Fetches opportunities from SBIR.gov
 * @param {string[]} keywords - Search keywords
 * @param {Function} log - Logger function
 * @returns {Promise<Object[]>} - Array of opportunities
 */
async function fetchSbirOpportunities(keywords, log) {
    const opportunities = [];
    const seenIds = new Set();

    const results = await Promise.all(
        keywords.map(async (kw) => {
            try {
                const url = `https://api.www.sbir.gov/public/api/solicitations?keyword=${encodeURIComponent(kw)}&open=1&rows=20`;
                const response = await fetchWithTimeout(url, `SBIR:${kw}`, {
                    timeout: 5000,
                    retry: true
                });
                return await response.json();
            } catch (error) {
                log('warn', `SBIR ${kw} fetch failed`, { error: error.message });
                return null;
            }
        })
    );

    for (const sbirData of results) {
        if (!Array.isArray(sbirData)) continue;

        for (const sol of sbirData) {
            const solId = `sbir-${sol.solicitation_number || sol.solicitation_title || Date.now()}`;
            if (seenIds.has(solId)) continue;
            seenIds.add(solId);

            const phase = sol.phase || 'Phase I';
            const value = phase === 'Phase I' ? 275000 : phase === 'Phase II' ? 1500000 : 250000;

            opportunities.push({
                id: solId,
                noticeId: solId,
                title: sanitizeHtml(sol.solicitation_title || 'SBIR/STTR Opportunity'),
                solicitation: sol.solicitation_number || 'SBIR',
                agency: sanitizeHtml(sol.agency || 'Federal Agency'),
                postedDate: sol.release_date || sol.open_date,
                closeDate: sol.application_due_date?.[0] || sol.close_date || null,
                setAside: `${sol.program || 'SBIR'} ${phase}`.trim(),
                naicsCode: '',
                value,
                description: sanitizeHtml(sol.solicitation_topics?.[0]?.topic_description?.substring(0, 500) || `${sol.program || 'SBIR'} ${phase}`),
                link: sol.solicitation_agency_url || 'https://www.sbir.gov/topics',
                isLive: sol.current_status === 'Open',
                source: 'SBIR.gov',
                type: 'sbir',
                category: 'SBIR/STTR',
                status: 'GO',
                statusReason: 'SBIR/STTR program - eligible as small business',
                recommendation: 'GO',
                qualification: {
                    status: 'GO',
                    reason: 'SBIR/STTR program - eligible as small business',
                    breakdown: { program: `${sol.program || 'SBIR'} ${phase}`, eligibility: 'Small Business - Eligible' }
                }
            });
        }
    }

    log('info', 'SBIR.gov fetch complete', { count: opportunities.length });
    return opportunities;
}

/**
 * Fetches opportunities from Grants.gov
 * @param {string[]} keywords - Search keywords
 * @param {Function} log - Logger function
 * @returns {Promise<Object[]>} - Array of opportunities
 */
async function fetchGrantsOpportunities(keywords, log) {
    const opportunities = [];
    const seenIds = new Set();

    const results = await Promise.all(
        keywords.map(async (kw) => {
            try {
                const url = `https://www.grants.gov/grantsws/rest/opportunities/search?keyword=${encodeURIComponent(kw)}&oppStatuses=forecasted|posted&rows=15`;
                const response = await fetchWithTimeout(url, `Grants:${kw}`, {
                    timeout: config.timeouts.fetch,
                    retry: true
                });
                return await response.json();
            } catch (error) {
                log('warn', `Grants.gov ${kw} fetch failed`, { error: error.message });
                return null;
            }
        })
    );

    for (const grantsData of results) {
        if (!grantsData?.oppHits) continue;

        for (const grant of grantsData.oppHits) {
            const grantId = `grant-${grant.id || grant.oppNumber || Date.now()}`;
            if (seenIds.has(grantId)) continue;
            seenIds.add(grantId);

            opportunities.push({
                id: grantId,
                noticeId: grantId,
                title: sanitizeHtml(grant.oppTitle || 'Federal Grant Opportunity'),
                solicitation: grant.oppNumber || 'GRANT',
                agency: sanitizeHtml(grant.agencyName || 'Federal Agency'),
                postedDate: grant.postedDate || grant.openDate,
                closeDate: grant.closeDate,
                setAside: 'Grant',
                naicsCode: '',
                value: parseInt(grant.awardCeiling) || 250000,
                description: sanitizeHtml((grant.synopsis || '').substring(0, 500)),
                link: grant.oppNumber ? `https://www.grants.gov/search-results-detail/${grant.oppNumber}` : 'https://www.grants.gov',
                isLive: grant.oppStatus === 'posted',
                source: 'Grants.gov',
                type: 'grant',
                category: 'Federal Grant',
                status: 'GO',
                statusReason: 'Federal grant - review eligibility',
                recommendation: 'GO',
                qualification: { status: 'GO', reason: 'Federal grant opportunity' }
            });
        }
    }

    log('info', 'Grants.gov fetch complete', { count: opportunities.length });
    return opportunities;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * API handler for scanning procurement opportunities
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export default async function handler(req, res) {
    const startTime = Date.now();

    // Handle CORS
    if (handleCors(req, res)) return;

    // Setup request (ID, logging, security headers)
    const { requestId, log } = setupRequest(req, res);
    log('info', 'Scan API v1 request received');

    // Rate limiting
    if (scanRateLimiter(req, res)) return;

    // Handle email subscription (POST)
    if (req.method === 'POST') {
        return handleEmailSubscription(req, res, requestId, log);
    }

    // Only allow GET for scanning
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
            requestId
        });
    }

    try {
        // Get API key (REQUIRED - no fallback)
        const samApiKey = config.api.samApiKey;

        // Setup date range
        const today = new Date();
        const ago = new Date(today);
        ago.setDate(ago.getDate() - 60);

        // Search keywords
        const samKeywords = [
            'robotic welding', 'robotics', 'automation', 'conveyor', 'warehouse automation',
            'PLC', 'SCADA', 'machine vision', 'systems integration', 'FANUC',
            'industrial machinery', 'manufacturing equipment', 'assembly line', 'material handling'
        ];
        const sbirKeywords = ['robot', 'automation', 'manufacturing', 'machine', 'vision'];
        const grantsKeywords = ['robotics', 'automation', 'manufacturing', 'industrial'];

        // Fetch from all sources in parallel
        const [samOpps, sbirOpps, grantsOpps] = await Promise.all([
            fetchSamOpportunities(samApiKey, samKeywords, ago, today, log),
            fetchSbirOpportunities(sbirKeywords, log),
            fetchGrantsOpportunities(grantsKeywords, log),
        ]);

        // Combine all opportunities
        let allOpps = [...samOpps, ...sbirOpps, ...grantsOpps];

        // Add state portals
        for (const portal of STATE_PORTALS) {
            allOpps.push(createPortalOpportunity(portal, 'state', 'State Portal'));
        }

        // Add county portals
        for (const portal of CA_COUNTY_PORTALS) {
            allOpps.push(createPortalOpportunity(portal, 'county', 'CA County'));
        }
        for (const portal of MI_COUNTY_PORTALS) {
            allOpps.push(createPortalOpportunity(portal, 'county', 'MI County'));
        }

        // Add DIBBS portal
        allOpps.push({
            id: 'dibbs-portal',
            noticeId: 'dibbs-portal',
            title: 'DLA DIBBS - DoD Parts Portal',
            agency: 'DLA',
            solicitation: 'DIBBS Portal',
            postedDate: new Date().toISOString().split('T')[0],
            naicsCode: '334419',
            link: 'https://www.dibbs.bsm.dla.mil/RFQ/',
            description: 'Defense Logistics Agency Internet Bid Board System. Search for robot components, PLC modules, industrial parts.',
            isLive: true,
            isPortal: true,
            source: 'DIBBS',
            type: 'dibbs',
            category: 'DoD Parts',
            status: 'Review',
            statusReason: 'DIBBS portal - search for parts/components',
            recommendation: 'Review',
            qualification: { status: 'Review', reason: 'DLA DIBBS portal' }
        });

        // Qualify SAM.gov opportunities (others are pre-qualified or portals)
        const profile = config.companyProfile;
        allOpps = allOpps.map(opp => {
            if (opp.source === 'SAM.gov' && !opp.qualification) {
                const qualification = qualifyOpportunity(opp, profile);
                return {
                    ...opp,
                    qualification,
                    status: qualification.status,
                    statusReason: qualification.reason,
                    recommendation: qualification.recommendation,
                    matchBreakdown: qualification.breakdown
                };
            }
            return opp;
        });

        // Sort: live opportunities first, then portals, by date
        allOpps.sort((a, b) => {
            if (a.isPortal && !b.isPortal) return 1;
            if (!a.isPortal && b.isPortal) return -1;
            return new Date(b.postedDate || 0) - new Date(a.postedDate || 0);
        });

        // Calculate stats
        const stats = {
            total: allOpps.length,
            federal: allOpps.filter(o => o.type === 'contract').length,
            sbir: allOpps.filter(o => o.type === 'sbir').length,
            grants: allOpps.filter(o => o.type === 'grant').length,
            state: allOpps.filter(o => o.type === 'state').length,
            county: allOpps.filter(o => o.type === 'county').length,
            dibbs: allOpps.filter(o => o.type === 'dibbs').length,
            qualified: allOpps.filter(o => o.status === 'GO' || o.status === 'Review').length,
            go: allOpps.filter(o => o.status === 'GO').length,
            review: allOpps.filter(o => o.status === 'Review').length,
            nogo: allOpps.filter(o => o.status === 'NO-GO').length,
            totalValue: allOpps.filter(o => o.value).reduce((sum, o) => sum + (o.value || 0), 0),
            portals: allOpps.filter(o => o.isPortal).length
        };

        const totalTime = Date.now() - startTime;
        log('info', 'Scan complete', { stats, totalTime });

        return res.status(200).json({
            success: true,
            count: allOpps.length,
            stats,
            opportunities: allOpps,
            requestId,
            timestamp: new Date().toISOString(),
            latencyMs: totalTime,
            apiVersion: 'v1'
        });

    } catch (error) {
        handleApiError(error, req, res, requestId, log);
    }
}

/**
 * Handles email subscription requests
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} requestId - Request ID
 * @param {Function} log - Logger function
 */
function handleEmailSubscription(req, res, requestId, log) {
    const validation = validateInput(emailSubscriptionSchema, req.body);

    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: { message: 'Invalid input', errors: validation.errors },
            requestId
        });
    }

    const { email, frequency } = validation.data;
    log('info', 'Email subscription', { email, frequency });

    return res.status(200).json({
        success: true,
        message: `Subscribed ${email} for ${frequency} updates`,
        requestId
    });
}
