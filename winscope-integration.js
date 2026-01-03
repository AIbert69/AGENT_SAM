/**
 * WinScope Integration for Singh Automation Platform
 * ===================================================
 * 
 * This file connects your existing frontend to WinScope's AI backend.
 * 
 * Upload to: Root of your repo (same level as agent.js, index.html)
 * 
 * Usage in your code:
 * 
 * // When user clicks "Scan Live Data":
 * await WinScope.scanPortals();
 * const opportunities = await WinScope.getOpportunities();
 * 
 * // When user clicks "Request Distributor Quote":
 * const rfq = await WinScope.generateRFQ(opportunityId);
 * 
 * Author: Albert Mizuno
 * Date: December 2025
 */

const WinScope = {
    // Configuration - UPDATE THIS after deploying backend
    config: {
        // For local testing: 'http://localhost:8000'
        // For production: 'https://your-winscope-api.com'
        apiUrl: 'http://localhost:8000'
    },

    /**
     * Scan all portals for new opportunities
     */
    async scanPortals(options = {}) {
        console.log('🔍 WinScope: Starting portal scan...');
        
        try {
            const response = await fetch(`${this.config.apiUrl}/api/scan-portals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(options)
            });

            if (!response.ok) {
                throw new Error(`Scan failed: ${response.statusText}`);
            }

            const { job_id } = await response.json();
            console.log(`✓ Scan job started: ${job_id}`);

            // Wait for scan to complete
            return await this._waitForJob(job_id);
            
        } catch (error) {
            console.error('❌ WinScope scan failed:', error);
            throw error;
        }
    },

    /**
     * Get all discovered opportunities
     */
    async getOpportunities(filters = {}) {
        try {
            const params = new URLSearchParams({
                min_score: filters.minScore || 50,
                limit: filters.limit || 100,
                ...(filters.portal && { portal: filters.portal })
            });

            const response = await fetch(
                `${this.config.apiUrl}/api/opportunities?${params}`
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch opportunities: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`✓ WinScope: Retrieved ${data.total} opportunities`);
            
            return data.opportunities;
            
        } catch (error) {
            console.error('❌ WinScope: Failed to get opportunities:', error);
            throw error;
        }
    },

    /**
     * Generate complete RFQ with real data
     */
    async generateRFQ(opportunityId) {
        console.log(`📋 WinScope: Generating RFQ for ${opportunityId}...`);
        
        try {
            // First, process the opportunity (download docs, extract data)
            await this._processOpportunity(opportunityId);
            
            // Then generate the RFQ
            const response = await fetch(`${this.config.apiUrl}/api/generate-rfq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ opportunity_id: opportunityId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'RFQ generation failed');
            }

            const data = await response.json();
            console.log(`✅ WinScope: RFQ generated (${data.fulfillment_confidence}% confidence)`);
            
            return {
                rfqDocument: data.rfq_document,
                fulfillmentConfidence: data.fulfillment_confidence,
                lineItemsCount: data.line_items_count,
                generatedAt: data.generated_at
            };
            
        } catch (error) {
            console.error('❌ WinScope: RFQ generation failed:', error);
            throw error;
        }
    },

    /**
     * Check if WinScope backend is online
     */
    async checkStatus() {
        try {
            const response = await fetch(`${this.config.apiUrl}/`);
            
            if (!response.ok) {
                return { status: 'offline', error: response.statusText };
            }

            const data = await response.json();
            return {
                status: 'online',
                version: data.version,
                portals: data.portals_monitored,
                backend: data.backend_status
            };
            
        } catch (error) {
            return {
                status: 'offline',
                error: error.message
            };
        }
    },

    /**
     * Get platform statistics
     */
    async getStats() {
        try {
            const response = await fetch(`${this.config.apiUrl}/api/stats`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch stats');
            }

            return await response.json();
            
        } catch (error) {
            console.error('❌ WinScope: Failed to get stats:', error);
            return {
                total_opportunities: 0,
                high_score_count: 0,
                qualified_count: 0,
                backend_status: 'disconnected'
            };
        }
    },

    // ==================== INTERNAL METHODS ====================

    /**
     * Process opportunity (download docs, extract data)
     * @private
     */
    async _processOpportunity(opportunityId) {
        console.log(`📄 WinScope: Processing opportunity ${opportunityId}...`);
        
        try {
            // Get opportunity details first
            const oppResponse = await fetch(`${this.config.apiUrl}/api/opportunity/${opportunityId}`);
            const opp = await oppResponse.json();
            
            // Start processing
            const response = await fetch(`${this.config.apiUrl}/api/process-opportunity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    opportunity_id: opportunityId,
                    source_url: opp.source_url,
                    title: opp.title,
                    agency: opp.agency
                })
            });

            if (!response.ok) {
                throw new Error(`Processing failed: ${response.statusText}`);
            }

            const { job_id } = await response.json();
            console.log(`✓ Processing job started: ${job_id}`);

            // Wait for processing to complete
            const result = await this._waitForJob(job_id);
            
            console.log(`✅ WinScope: Extracted ${result.line_items_extracted} line items`);
            
            return result;
            
        } catch (error) {
            console.error('❌ WinScope: Processing failed:', error);
            throw error;
        }
    },

    /**
     * Wait for a background job to complete
     * @private
     */
    async _waitForJob(jobId) {
        const maxWaitTime = 300000; // 5 minutes
        const pollInterval = 2000; // 2 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const response = await fetch(`${this.config.apiUrl}/api/scan-status/${jobId}`);
                const status = await response.json();

                if (status.status === 'completed') {
                    console.log('✅ WinScope: Job completed');
                    return status;
                }

                if (status.status === 'failed') {
                    throw new Error(status.error || 'Job failed');
                }

                // Still processing, wait and poll again
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
            } catch (error) {
                console.error('Error checking job status:', error);
                throw error;
            }
        }

        throw new Error('Job timeout - exceeded maximum wait time');
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WinScope;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.WinScope = WinScope;
}
