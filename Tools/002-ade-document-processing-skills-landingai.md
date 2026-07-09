<strong>Reference:</strong> <a href="https://github.com/landing-ai/ade-document-processing-skills">https://github.com/landing-ai/ade-document-processing-skills</a>


<h2><span ><strong>What it is</strong></span></h2>


Agent skills that teach coding assistants like Claude Code, Cursor, and Roo Code how to write Python scripts using LandingAI's Agentic Document Extraction (ADE) — a vision-first document AI that parses complex, real-world documents into structured, auditable data without templates or ML training.


<h2><span ><strong>Use case</strong></span></h2>


Instead of hand-rolling document parsing logic, you install the skill (via a Claude Code plugin marketplace command or manual copy into <code>.claude/skills/</code>), and your agent gains two capabilities: <strong>document-extraction</strong> (parse PDFs/images/spreadsheets into structured Markdown/JSON, extract fields via Pydantic/JSON schemas, split and classify multi-doc batches, handle files up to 1GB/6,000 pages async) and <strong>document-workflows</strong> (batch pipelines, classify-then-extract flows, RAG prep with chunking + ChromaDB/FAISS ingestion, exports to CSV/Snowflake, Streamlit UIs). <em>You literally just prompt the agent — e.g., "extract line items from all invoices in this folder as CSV" — and it writes and runs the script.</em>


<h2><span ><strong>Benefit</strong></span></h2>

<ul>
 	<li><strong>No templates, no training</strong> — vision-first models handle dense tables, multi-column layouts, and scanned docs directly</li>
 	<li><strong>Full traceability</strong> — every extracted value carries bounding boxes, page coordinates, and confidence scores back to source</li>
 	<li><strong>RAG-ready out of the box</strong> — built-in semantic chunking + vector DB ingestion patterns, directly relevant if you're feeding extracted docs into a retrieval pipeline</li>
 	<li><strong>Agent-native install</strong> — ships as a proper Claude Code plugin, so setup is a couple of slash commands rather than manual wiring</li>
</ul>


Happy Learning!!