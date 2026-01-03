/**
 * @fileoverview Opportunity qualification logic for Singh Automation
 * @module lib/qualification
 *
 * This module contains the business logic for determining whether an opportunity
 * is a good fit for Singh Automation based on certifications, NAICS codes,
 * keywords, and set-aside restrictions.
 *
 * ## Scoring Algorithm
 *
 * The qualification system uses a point-based scoring system:
 *
 * | Factor | Points | Description |
 * |--------|--------|-------------|
 * | NAICS Match | 30 | Primary NAICS code matches company capabilities |
 * | Keyword Match | 5 each | Keywords in title/description match company services |
 * | Set-Aside | 20 | Compatible set-aside type (Small Business, Full & Open, etc.) |
 *
 * ## Thresholds
 *
 * - **GO** (≥50 points): Strong match, recommend pursuing
 * - **Review** (25-49 points): Potential match, needs manual review
 * - **NO-GO**: Automatic disqualification (missing required certifications)
 *
 * ## Automatic Disqualification
 *
 * The following set-asides result in automatic NO-GO:
 * - SDVOSB (Service-Disabled Veteran-Owned Small Business)
 * - 8(a) Program
 * - HUBZone
 * - Contract vehicle restrictions (SeaPort, OASIS, etc.)
 */

import config from './config.js';

/**
 * @typedef {Object} QualificationResult
 * @property {'GO' | 'NO-GO' | 'Review'} status - Qualification status
 * @property {string} reason - Human-readable reason for the qualification
 * @property {string} recommendation - Action recommendation
 * @property {number} [score] - Numeric score (if applicable)
 * @property {Object} breakdown - Detailed breakdown of scoring factors
 */

/**
 * @typedef {Object} Opportunity
 * @property {string} id - Unique identifier
 * @property {string} title - Opportunity title
 * @property {string} [description] - Short description
 * @property {string} [fullDescription] - Full description text
 * @property {string} [setAside] - Set-aside type
 * @property {string} [naicsCode] - Primary NAICS code
 * @property {number} [value] - Estimated contract value
 */

/**
 * @typedef {Object} CompanyProfile
 * @property {string[]} naicsCodes - Company's NAICS codes
 * @property {string[]} keywords - Keywords matching company capabilities
 * @property {string[]} certifications - Certifications held
 * @property {string[]} notCertified - Certifications NOT held
 * @property {string[]} noVehicles - Contract vehicles NOT held
 */

/**
 * Checks if opportunity has a disqualifying set-aside
 * @param {string} setAside - Set-aside type
 * @param {string[]} notCertified - Certifications not held
 * @returns {{ disqualified: boolean, reason?: string }}
 */
function checkSetAsideRestrictions(setAside, notCertified) {
    const lowerSetAside = setAside.toLowerCase();

    // Check each certification we don't have
    const restrictionMap = {
        'sdvosb': 'SDVOSB set-aside - not eligible',
        'service-disabled veteran': 'SDVOSB set-aside - not eligible',
        '8(a)': '8(a) set-aside - not 8(a) certified',
        '8a': '8(a) set-aside - not 8(a) certified',
        'hubzone': 'HUBZone set-aside - not HUBZone certified',
        'wosb': 'WOSB set-aside - not WOSB certified',
        'edwosb': 'EDWOSB set-aside - not EDWOSB certified',
        'vosb': 'VOSB set-aside - not VOSB certified',
    };

    for (const [key, reason] of Object.entries(restrictionMap)) {
        if (lowerSetAside.includes(key)) {
            return { disqualified: true, reason };
        }
    }

    return { disqualified: false };
}

/**
 * Checks if opportunity requires a contract vehicle we don't have
 * @param {string} fullText - Combined title and description text
 * @param {string[]} noVehicles - Contract vehicles not held
 * @returns {{ disqualified: boolean, reason?: string }}
 */
function checkVehicleRestrictions(fullText, noVehicles) {
    const lowerText = fullText.toLowerCase();

    for (const vehicle of noVehicles) {
        const lowerVehicle = vehicle.toLowerCase();

        // Check if text mentions vehicle with "holders only" type restriction
        if (lowerText.includes(lowerVehicle)) {
            const restrictionPhrases = [
                'holders only',
                'contract holders',
                'vehicle holders',
                'schedule holders',
                'gwac holders'
            ];

            for (const phrase of restrictionPhrases) {
                if (lowerText.includes(phrase)) {
                    return {
                        disqualified: true,
                        reason: `Restricted to ${vehicle} holders`
                    };
                }
            }
        }
    }

    return { disqualified: false };
}

/**
 * Calculates keyword match score
 * @param {string} fullText - Combined title and description text
 * @param {string[]} keywords - Keywords to match
 * @param {number} pointsPerMatch - Points awarded per match
 * @returns {{ score: number, matchedKeywords: string[] }}
 */
function calculateKeywordScore(fullText, keywords, pointsPerMatch) {
    const lowerText = fullText.toLowerCase();
    const matchedKeywords = [];
    let score = 0;

    for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
            score += pointsPerMatch;
            matchedKeywords.push(keyword);
        }
    }

    return { score, matchedKeywords };
}

/**
 * Checks if set-aside type is compatible
 * @param {string} setAside - Set-aside type
 * @param {string[]} compatibleTypes - Compatible set-aside types
 * @returns {boolean}
 */
function isCompatibleSetAside(setAside, compatibleTypes) {
    const lowerSetAside = setAside.toLowerCase();
    return compatibleTypes.some(type => lowerSetAside.includes(type));
}

/**
 * Qualifies an opportunity for Singh Automation
 *
 * @param {Opportunity} opportunity - The opportunity to qualify
 * @param {CompanyProfile} [profile] - Company profile (defaults to config)
 * @returns {QualificationResult}
 *
 * @example
 * const result = qualifyOpportunity({
 *   id: 'abc123',
 *   title: 'Robotic Welding System Installation',
 *   naicsCode: '333249',
 *   setAside: 'Small Business'
 * });
 *
 * console.log(result);
 * // {
 * //   status: 'GO',
 * //   reason: 'Strong match: robotic/welding',
 * //   recommendation: 'GO',
 * //   score: 55,
 * //   breakdown: { naics: true, keywords: 'robotic, welding', setAside: 'Small Business' }
 * // }
 */
export function qualifyOpportunity(opportunity, profile = null) {
    // Use config profile if not provided
    const companyProfile = profile || config.companyProfile;
    const scoring = config.scoring;

    // Extract and normalize text fields
    const setAside = (opportunity.setAside || '').trim();
    const title = (opportunity.title || '').trim();
    const description = (opportunity.description || '').trim();
    const fullDescription = (opportunity.fullDescription || '').trim();
    const naicsCode = (opportunity.naicsCode || '').trim();

    // Combine all text for keyword matching
    const fullText = `${title} ${description} ${fullDescription}`;

    // =========================================================================
    // STEP 1: Check for automatic disqualifications
    // =========================================================================

    // Check set-aside restrictions
    const setAsideCheck = checkSetAsideRestrictions(setAside, companyProfile.notCertified);
    if (setAsideCheck.disqualified) {
        return {
            status: 'NO-GO',
            reason: setAsideCheck.reason,
            recommendation: 'No-Go',
            breakdown: { restriction: setAsideCheck.reason }
        };
    }

    // Check contract vehicle restrictions
    const vehicleCheck = checkVehicleRestrictions(fullText, companyProfile.noVehicles);
    if (vehicleCheck.disqualified) {
        return {
            status: 'NO-GO',
            reason: vehicleCheck.reason,
            recommendation: 'No-Go',
            breakdown: { restriction: vehicleCheck.reason }
        };
    }

    // =========================================================================
    // STEP 2: Calculate positive scoring factors
    // =========================================================================

    let totalScore = 0;
    const breakdown = {};

    // NAICS code match
    const naicsMatch = naicsCode && companyProfile.naicsCodes.includes(naicsCode);
    if (naicsMatch) {
        totalScore += scoring.naicsMatchPoints;
        breakdown.naics = naicsCode;
    }

    // Keyword matches
    const { score: keywordScore, matchedKeywords } = calculateKeywordScore(
        fullText,
        companyProfile.keywords,
        scoring.keywordMatchPoints
    );
    totalScore += keywordScore;
    if (matchedKeywords.length > 0) {
        breakdown.keywords = matchedKeywords.slice(0, 5).join(', ');
    }

    // Set-aside compatibility
    const compatibleSetAside = isCompatibleSetAside(setAside, scoring.compatibleSetAsides);
    if (compatibleSetAside) {
        totalScore += scoring.setAsidePoints;
        breakdown.setAside = setAside;
    }

    // =========================================================================
    // STEP 3: Determine final recommendation
    // =========================================================================

    if (totalScore >= scoring.goThreshold) {
        // Strong match - recommend pursuing
        const topKeywords = matchedKeywords.slice(0, 2).join('/') || 'NAICS match';
        return {
            status: 'GO',
            reason: `Strong match: ${topKeywords}`,
            recommendation: 'GO',
            score: totalScore,
            breakdown
        };
    }

    if (totalScore >= scoring.reviewThreshold) {
        // Potential match - needs review
        return {
            status: 'Review',
            reason: 'Potential match - review scope details',
            recommendation: 'Review',
            score: totalScore,
            breakdown
        };
    }

    // Low match - still worth reviewing
    return {
        status: 'Review',
        reason: 'Limited match - review for fit',
        recommendation: 'Review',
        score: totalScore,
        breakdown
    };
}

/**
 * Batch qualifies multiple opportunities
 * @param {Opportunity[]} opportunities - Array of opportunities
 * @param {CompanyProfile} [profile] - Company profile
 * @returns {Array<Opportunity & { qualification: QualificationResult }>}
 */
export function qualifyOpportunities(opportunities, profile = null) {
    return opportunities.map(opp => {
        const qualification = qualifyOpportunity(opp, profile);
        return {
            ...opp,
            qualification,
            status: qualification.status,
            statusReason: qualification.reason,
            recommendation: qualification.recommendation,
            matchBreakdown: qualification.breakdown
        };
    });
}

/**
 * Filters opportunities by qualification status
 * @param {Array<Opportunity & { qualification: QualificationResult }>} opportunities
 * @param {'GO' | 'NO-GO' | 'Review' | 'all'} status - Status to filter by
 * @returns {Array}
 */
export function filterByStatus(opportunities, status = 'all') {
    if (status === 'all') return opportunities;
    return opportunities.filter(opp => opp.qualification?.status === status);
}

/**
 * Sorts opportunities by qualification score (highest first)
 * @param {Array<Opportunity & { qualification: QualificationResult }>} opportunities
 * @returns {Array}
 */
export function sortByScore(opportunities) {
    return [...opportunities].sort((a, b) => {
        const scoreA = a.qualification?.score ?? 0;
        const scoreB = b.qualification?.score ?? 0;
        return scoreB - scoreA;
    });
}

export default {
    qualifyOpportunity,
    qualifyOpportunities,
    filterByStatus,
    sortByScore
};
