// /api/generate-proposal.js
// Singh Automation - One-Click Beautiful Proposal Generator
// Returns downloadable .docx file

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
        Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle, 
        WidthType, ShadingType, PageNumber, PageBreak } = require('docx');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { opportunity } = req.body;
    
    if (!opportunity) {
      return res.status(400).json({ error: 'Missing opportunity data' });
    }

    // === OPPORTUNITY DATA ===
    const title = opportunity.title || 'Government Contract';
    const solicitation = opportunity.solicitation || opportunity.noticeId || opportunity.id || '[SOLICITATION #]';
    const agency = opportunity.agency || opportunity.departmentName || 'Government Agency';
    const value = opportunity.value ? `$${Number(opportunity.value).toLocaleString()}` : 'TBD';
    const naics = opportunity.naicsCode || '333249';
    const description = opportunity.description || '';

    // === SINGH AUTOMATION DATA ===
    const company = {
      name: "Singh Automation LLC",
      cage: "86VF7",
      uei: "GJ1DPYQ3X8K5",
      hq: "7804 S Sprinkle Road, Portage, MI 49002",
      detroit: "41000 Woodward Ave, Bloomfield Twp, MI 48304",
      california: "300 Spectrum Center Dr, Suite 400, Irvine, CA 92618",
      email: "gs@singhautomation.com",
      website: "singhautomation.com"
    };

    const personnel = {
      executive: { name: "Gurdeep Singh", title: "Owner & Chairman" },
      pm: { name: "David Mih", title: "COO / General Manager" },
      techLead: { name: "Soorya Sridhar", title: "Project Manager - Electrical" },
      opsLead: { name: "Sonny Singh", title: "Operations Manager" },
      qa: { name: "Ricardo del Olmo Parrado", title: "Resource & Compliance Manager" }
    };

    // === STYLES ===
    const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
    const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };
    const headerShading = { fill: "1B4F72", type: ShadingType.CLEAR };  // Navy blue
    const altRowShading = { fill: "F8F9FA", type: ShadingType.CLEAR };
    const singhGreen = "9ACD32";  // Singh's brand green
    const singhGreenShading = { fill: "9ACD32", type: ShadingType.CLEAR };
    const lightGreenShading = { fill: "F0FFF0", type: ShadingType.CLEAR };

    // === HELPER FUNCTIONS ===
    const heading1 = (text) => new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      border: { bottom: { color: "1B4F72", size: 12, style: BorderStyle.SINGLE } },
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 32, color: "1B4F72" })]
    });

    const heading2 = (text) => new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
      children: [new TextRun({ text, bold: true, size: 26, color: "2E86AB" })]
    });

    const para = (text, options = {}) => new Paragraph({
      spacing: { after: 200 },
      alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text, size: 22, ...options })]
    });

    const boldPara = (label, value) => new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: label, bold: true, size: 22 }),
        new TextRun({ text: value, size: 22 })
      ]
    });

    const actionRequired = (text) => new Paragraph({
      spacing: { after: 200 },
      shading: { fill: "FFF3CD", type: ShadingType.CLEAR },
      children: [new TextRun({ text: `⚠️ ACTION REQUIRED: ${text}`, bold: true, size: 22, color: "856404" })]
    });

    const bulletPoint = (text, ref = "bullet-list") => new Paragraph({
      numbering: { reference: ref, level: 0 },
      spacing: { after: 100 },
      children: [new TextRun({ text, size: 22 })]
    });

    // === BUILD DOCUMENT ===
    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 32, bold: true, color: "1B4F72", font: "Arial" },
            paragraph: { spacing: { before: 400, after: 200 } } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 26, bold: true, color: "2E86AB", font: "Arial" },
            paragraph: { spacing: { before: 300, after: 150 } } }
        ]
      },
      numbering: {
        config: [
          { reference: "bullet-list",
            levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
          { reference: "numbered-list",
            levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
        ]
      },
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "SINGH AUTOMATION LLC", bold: true, size: 18, color: "1B4F72" }),
                new TextRun({ text: "  |  CAGE: 86VF7  |  UEI: GJ1DPYQ3X8K5", size: 18, color: "666666" })
              ]
            })]
          })
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${title} - ${solicitation}`, size: 18, color: "666666" }),
                new TextRun({ text: "  |  Page ", size: 18, color: "666666" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                new TextRun({ text: " of ", size: 18, color: "666666" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })
              ]
            })]
          })
        },
        children: [
          // ============ COVER PAGE ============
          // Top green accent bar
          new Paragraph({
            shading: singhGreenShading,
            spacing: { after: 0 },
            children: [new TextRun({ text: " ", size: 8 })]
          }),
          new Paragraph({
            shading: singhGreenShading,
            spacing: { after: 0 },
            children: [new TextRun({ text: " ", size: 8 })]
          }),
          
          new Paragraph({ spacing: { before: 1500 } }),
          
          // Document type
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "TECHNICAL AND MANAGEMENT PROPOSAL", bold: true, size: 40, color: "1B4F72", allCaps: true })]
          }),
          
          // Green divider line
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 24, color: singhGreen })]
          }),
          
          // Project title
          new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: title, bold: true, size: 36, color: "333333" })]
          }),
          
          // Solicitation info
          new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Solicitation: ${solicitation}`, size: 24, color: "666666" })]
          }),
          new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Submitted to: ${agency}`, size: 24, color: "666666" })]
          }),
          new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Estimated Value: ${value}`, size: 24, color: "666666", bold: true })]
          }),
          
          // Green divider
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400 },
            children: [new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 24, color: singhGreen })]
          }),
          
          // Submitted by
          new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Submitted by:", size: 22, color: "666666", italics: true })]
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
            children: [new TextRun({ text: "SINGH AUTOMATION LLC", bold: true, size: 36, color: "1B4F72" })]
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
            children: [new TextRun({ text: "Industrial Automation & Robotics Integration", size: 20, italics: true, color: "666666" })]
          }),
          
          // Company info box
          new Table({
            columnWidths: [3120, 3120, 3120],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CAGE Code", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "UEI", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Business Size", bold: true, color: "FFFFFF", size: 18 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: company.cage, size: 22, bold: true })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: company.uei, size: 22, bold: true })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Small Business", size: 22, bold: true })] })] })
              ]})
            ]
          }),
          
          // Address and contact
          new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Headquarters: ", size: 20, bold: true }), new TextRun({ text: company.hq, size: 20 })]
          }),
          new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "California Office: ", size: 20, bold: true }), new TextRun({ text: company.california, size: 20 })]
          }),
          new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Contact: ${company.email}  |  ${company.website}`, size: 20, color: "2E86AB" })]
          }),
          new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Submission Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, size: 20, italics: true })]
          }),
          new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Proposal Valid for 90 Days", size: 18, color: "666666" })]
          }),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ TABLE OF CONTENTS ============
          heading1("TABLE OF CONTENTS"),
          new Paragraph({ spacing: { before: 300 } }),
          
          // TOC entries with dot leaders
          para("1.0    Executive Summary ................................................................ 3"),
          para("2.0    Technical Approach ............................................................... 4"),
          para("3.0    Management Approach ........................................................... 6"),
          para("4.0    Key Personnel ....................................................................... 7"),
          para("5.0    Past Performance .................................................................. 8"),
          para("6.0    Quality Assurance Plan .......................................................... 9"),
          para("7.0    Risk Management ................................................................. 10"),
          para("        Attachments Checklist ........................................................ 11"),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 1.0 EXECUTIVE SUMMARY ============
          heading1("1.0 EXECUTIVE SUMMARY"),
          
          // Highlight box
          new Paragraph({
            shading: lightGreenShading,
            spacing: { before: 200, after: 200 },
            border: { left: { color: singhGreen, size: 24, style: BorderStyle.SINGLE } },
            children: [
              new TextRun({ text: "Singh Automation LLC", bold: true, size: 22 }),
              new TextRun({ text: ` is pleased to submit this proposal in response to Solicitation `, size: 22 }),
              new TextRun({ text: solicitation, bold: true, size: 22 }),
              new TextRun({ text: ` for `, size: 22 }),
              new TextRun({ text: title, bold: true, size: 22 }),
              new TextRun({ text: `. As a `, size: 22 }),
              new TextRun({ text: "FANUC Authorized System Integrator", bold: true, size: 22, color: "1B4F72" }),
              new TextRun({ text: " and ", size: 22 }),
              new TextRun({ text: "Universal Robots Certified Systems Partner", bold: true, size: 22, color: "1B4F72" }),
              new TextRun({ text: ", Singh Automation offers a proven, technically excellent solution backed by direct OEM relationships.", size: 22 })
            ]
          }),
          
          heading2("1.1 Understanding of Requirements"),
          para(`${agency} requires ${description || 'automation and robotics solutions to modernize operations, improve efficiency, and reduce manual processing risks'}. Singh Automation understands the critical need for reliable, high-performance automated systems that integrate seamlessly with existing operations while minimizing disruption during installation and commissioning.`),
          
          heading2("1.2 Proposed Solution Overview"),
          para("Singh Automation will deliver a turnkey robotic automation solution featuring:"),
          bulletPoint("FANUC industrial robots with integrated controls and safety systems"),
          bulletPoint("Complete PLC/HMI integration with existing facility infrastructure"),
          bulletPoint("Comprehensive FAT (Factory Acceptance Test) prior to delivery"),
          bulletPoint("On-site SAT (Site Acceptance Test) with Government witness"),
          bulletPoint("Full operator training and maintenance documentation"),
          bulletPoint("12-month warranty with rapid response support"),
          
          heading2("1.3 Why Singh Automation"),
          
          // Value props in a nice table
          new Table({
            columnWidths: [2800, 6560],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2800, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Differentiator", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 6560, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Value to Government", bold: true, color: "FFFFFF", size: 18 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [para("FANUC ASI")] }),
                new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [para("Direct OEM support, factory-trained technicians, genuine parts")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2800, type: WidthType.DXA }, children: [para("Small Business")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 6560, type: WidthType.DXA }, children: [para("Agile response, competitive pricing, direct access to leadership")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [para("Dual-Coast")] }),
                new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [para("Michigan HQ + California office = nationwide rapid deployment")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2800, type: WidthType.DXA }, children: [para("Turnkey")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 6560, type: WidthType.DXA }, children: [para("Single point of responsibility from design through commissioning")] })
              ]})
            ]
          }),
          
          heading2("1.4 Commitment Statement"),
          new Paragraph({
            shading: lightGreenShading,
            spacing: { before: 200, after: 200 },
            border: { left: { color: singhGreen, size: 24, style: BorderStyle.SINGLE } },
            children: [new TextRun({ text: "Singh Automation is fully committed to delivering a high-quality automation solution on schedule and within budget. Our team is prepared to begin work immediately upon contract award.", size: 22, italics: true })]
          }),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 2.0 TECHNICAL APPROACH ============
          heading1("2.0 TECHNICAL APPROACH"),
          
          heading2("2.1 Technical Understanding"),
          para(`Based on the solicitation requirements, ${agency} requires an automated system capable of high-precision, repeatable operations. The system must integrate with existing facility infrastructure, meet applicable safety standards, and include comprehensive training and documentation.`),
          
          heading2("2.2 Proposed Equipment"),
          new Table({
            columnWidths: [3120, 6240],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Component", bold: true, color: "FFFFFF", size: 20 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 6240, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Specification", bold: true, color: "FFFFFF", size: 20 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Robot")] }),
                new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [para("FANUC robot (model based on final requirements)")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para("Controller")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 6240, type: WidthType.DXA }, children: [para("FANUC R-30iB Plus controller")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Safety System")] }),
                new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [para("Category-rated guarding per OSHA/NFPA 79")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para("Controls")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 6240, type: WidthType.DXA }, children: [para("Allen-Bradley PLC interface to facility systems")] })
              ]})
            ]
          }),
          
          heading2("2.3 Implementation Phases"),
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "Phase 1: Design & Engineering (Weeks 1-4)", bold: true, size: 22, color: "1B4F72" })] }),
          para("Site survey, requirements validation, design package development, customer design review."),
          
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "Phase 2: Fabrication & FAT (Weeks 5-10)", bold: true, size: 22, color: "1B4F72" })] }),
          para("Component procurement, cell fabrication, integration, programming, Factory Acceptance Test."),
          
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "Phase 3: Installation & SAT (Weeks 11-14)", bold: true, size: 22, color: "1B4F72" })] }),
          para("Delivery, installation, commissioning, Site Acceptance Test, punch list resolution."),
          
          new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "Phase 4: Training & Closeout (Weeks 15-16)", bold: true, size: 22, color: "1B4F72" })] }),
          para("Operator and maintenance training, as-built documentation, warranty period begins."),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 3.0 MANAGEMENT APPROACH ============
          heading1("3.0 MANAGEMENT APPROACH"),
          
          heading2("3.1 Organization Structure"),
          para(`Singh Automation will assign a dedicated project team led by Program Manager ${personnel.pm.name}. The organization provides clear lines of authority and communication.`),
          
          new Table({
            columnWidths: [3120, 3120, 3120],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Role", bold: true, color: "FFFFFF", size: 20 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Name", bold: true, color: "FFFFFF", size: 20 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3120, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Responsibility", bold: true, color: "FFFFFF", size: 20 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Executive Sponsor")] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para(personnel.executive.name)] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Strategic oversight")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para("Program Manager")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para(personnel.pm.name)] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para("Day-to-day management")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Technical Lead")] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para(personnel.techLead.name)] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Controls & programming")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para("Operations Lead")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para(personnel.opsLead.name)] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3120, type: WidthType.DXA }, children: [para("Fabrication & install")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("QA Manager")] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para(personnel.qa.name)] }),
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [para("Quality & compliance")] })
              ]})
            ]
          }),
          
          heading2("3.2 Communication Plan"),
          new Table({
            columnWidths: [2340, 2340, 2340, 2340],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2340, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Meeting", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2340, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Frequency", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2340, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Attendees", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2340, type: WidthType.DXA },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Output", bold: true, color: "FFFFFF", size: 18 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Kickoff")] }),
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Once")] }),
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("All stakeholders")] }),
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Project plan")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2340, type: WidthType.DXA }, children: [para("Status")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2340, type: WidthType.DXA }, children: [para("Weekly")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2340, type: WidthType.DXA }, children: [para("PM + COR")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2340, type: WidthType.DXA }, children: [para("Status report")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Design Review")] }),
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Per milestone")] }),
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Technical teams")] }),
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Design approval")] })
              ]})
            ]
          }),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 4.0 KEY PERSONNEL ============
          heading1("4.0 KEY PERSONNEL"),
          
          heading2(`4.1 Program Manager: ${personnel.pm.name}`),
          boldPara("Current Position: ", `${personnel.pm.title}, Singh Automation LLC`),
          boldPara("Responsibilities: ", "Day-to-day program oversight, schedule management, budget control, customer communication."),
          actionRequired("Add years of experience, certifications, education. Attach resume."),
          
          heading2(`4.2 Technical Lead: ${personnel.techLead.name}`),
          boldPara("Current Position: ", `${personnel.techLead.title}, Singh Automation`),
          boldPara("Responsibilities: ", "Controls engineering, robot programming, PLC integration, system commissioning."),
          actionRequired("Add years of experience, FANUC certifications. Attach resume."),
          
          heading2(`4.3 Operations Lead: ${personnel.opsLead.name}`),
          boldPara("Current Position: ", `${personnel.opsLead.title}, Singh Automation`),
          boldPara("Responsibilities: ", "Mechanical fabrication, system assembly, FAT/SAT execution, field installation."),
          actionRequired("Add years of experience and qualifications. Attach resume."),
          
          heading2(`4.4 QA/Compliance Manager: ${personnel.qa.name}`),
          boldPara("Current Position: ", `${personnel.qa.title}, Singh Automation`),
          boldPara("Responsibilities: ", "Quality control, documentation compliance, test procedures, customer acceptance."),
          actionRequired("Add years of experience and qualifications. Attach resume."),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 5.0 PAST PERFORMANCE ============
          heading1("5.0 PAST PERFORMANCE"),
          
          para("Singh Automation has delivered robotics and automation solutions for industrial clients. Representative project references are provided below."),
          
          heading2("5.1 Reference 1"),
          actionRequired("Complete with actual project information"),
          boldPara("Project Name: ", "[Insert project name]"),
          boldPara("Customer: ", "[Insert customer name]"),
          boldPara("Contract Value: ", "[Insert value]"),
          boldPara("Period of Performance: ", "[Insert dates]"),
          boldPara("Scope of Work: ", "[Describe work performed]"),
          boldPara("Relevance: ", "[Explain similarity to current requirement]"),
          boldPara("Point of Contact: ", "[Name, Title, Phone, Email]"),
          
          heading2("5.2 Reference 2"),
          actionRequired("Complete with second project reference"),
          boldPara("Project Name: ", "[Insert project name]"),
          boldPara("Customer: ", "[Insert customer name]"),
          boldPara("Contract Value: ", "[Insert value]"),
          boldPara("Period of Performance: ", "[Insert dates]"),
          boldPara("Scope of Work: ", "[Describe work performed]"),
          boldPara("Relevance: ", "[Explain similarity]"),
          boldPara("Point of Contact: ", "[Name, Title, Phone, Email]"),
          
          heading2("5.3 Reference 3"),
          actionRequired("Complete with third project reference"),
          boldPara("Project Name: ", "[Insert project name]"),
          boldPara("Customer: ", "[Insert customer name]"),
          boldPara("Contract Value: ", "[Insert value]"),
          boldPara("Period of Performance: ", "[Insert dates]"),
          boldPara("Scope of Work: ", "[Describe work performed]"),
          boldPara("Relevance: ", "[Explain similarity]"),
          boldPara("Point of Contact: ", "[Name, Title, Phone, Email]"),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 6.0 QUALITY ASSURANCE ============
          heading1("6.0 QUALITY ASSURANCE PLAN"),
          
          heading2("6.1 Quality Management Approach"),
          para(`Singh Automation maintains rigorous quality control throughout the project lifecycle. ${personnel.qa.name} oversees all quality processes.`),
          
          heading2("6.2 Quality Control Checkpoints"),
          new Table({
            columnWidths: [2340, 3500, 3500],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2340, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Milestone", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3500, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Inspection/Test", bold: true, color: "FFFFFF", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 3500, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Acceptance Criteria", bold: true, color: "FFFFFF", size: 18 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("Design Review")] }),
                new TableCell({ borders: cellBorders, width: { size: 3500, type: WidthType.DXA }, children: [para("100% requirements review")] }),
                new TableCell({ borders: cellBorders, width: { size: 3500, type: WidthType.DXA }, children: [para("All requirements addressed")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2340, type: WidthType.DXA }, children: [para("FAT")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3500, type: WidthType.DXA }, children: [para("Functional test all modes")] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 3500, type: WidthType.DXA }, children: [para("All tests pass")] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2340, type: WidthType.DXA }, children: [para("SAT")] }),
                new TableCell({ borders: cellBorders, width: { size: 3500, type: WidthType.DXA }, children: [para("On-site verification")] }),
                new TableCell({ borders: cellBorders, width: { size: 3500, type: WidthType.DXA }, children: [para("Meets requirements")] })
              ]})
            ]
          }),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ 7.0 RISK MANAGEMENT ============
          heading1("7.0 RISK MANAGEMENT"),
          
          heading2("7.1 Risk Management Approach"),
          para("Singh Automation proactively identifies and mitigates project risks. The Program Manager maintains a risk register reviewed weekly."),
          
          heading2("7.2 Identified Risks"),
          new Table({
            columnWidths: [2000, 1200, 1200, 2480, 2480],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2000, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Risk", bold: true, color: "FFFFFF", size: 16 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 1200, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Prob", bold: true, color: "FFFFFF", size: 16 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 1200, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Impact", bold: true, color: "FFFFFF", size: 16 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2480, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Mitigation", bold: true, color: "FFFFFF", size: 16 })] })] }),
                new TableCell({ borders: cellBorders, shading: headerShading, width: { size: 2480, type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: "Contingency", bold: true, color: "FFFFFF", size: 16 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Equipment lead time", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Med", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "High", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 2480, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Early ordering", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 2480, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Expedite shipping", size: 18 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Site integration", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Med", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Med", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2480, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Site survey; ICD", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, shading: altRowShading, width: { size: 2480, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "On-site support", size: 18 })] })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ borders: cellBorders, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Scope changes", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Med", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Med", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 2480, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Change control", size: 18 })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 2480, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Change order", size: 18 })] })] })
              ]})
            ]
          }),
          
          new Paragraph({ children: [new PageBreak()] }),
          
          // ============ ATTACHMENTS CHECKLIST ============
          heading1("ATTACHMENTS CHECKLIST"),
          
          para("The following attachments are required:"),
          
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "☐  Key Personnel Resumes", size: 22 })] }),
          actionRequired("Attach resumes for David Mih, Soorya Sridhar, Sonny Singh, Ricardo del Olmo Parrado"),
          
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "☐  FANUC ASI Certificate", size: 22 })] }),
          actionRequired("Attach current FANUC Authorized System Integrator certificate"),
          
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "☐  Universal Robots CSP Certificate", size: 22 })] }),
          actionRequired("Attach current UR Certified Systems Partner certificate"),
          
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "☐  SAM.gov Registration", size: 22 })] }),
          para("     Verify registration is current and active"),
          
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "☐  W-9 Form", size: 22 })] }),
          para("     Available at: singhautomation.com/wp-content/uploads/2023/07/SINGH-AUTOMATION-LLC-W9-.pdf"),
          
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "☐  Certificate of Insurance", size: 22 })] }),
          actionRequired("Obtain current COI with required coverage"),
          
          new Paragraph({ spacing: { before: 400 } }),
          new Paragraph({
            shading: { fill: "E8F5E9", type: ShadingType.CLEAR },
            spacing: { before: 200, after: 200 },
            children: [new TextRun({ text: "✓ Review all ACTION REQUIRED items before submission", bold: true, size: 22, color: "2E7D32" })]
          })
        ]
      }]
    });

    // Generate document buffer
    const buffer = await Packer.toBuffer(doc);
    
    // Set response headers for file download
    const filename = `Singh_Proposal_${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('Error generating proposal:', error);
    return res.status(500).json({ error: error.message });
  }
}
