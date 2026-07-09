<strong>Reference</strong>: <a href="https://github.com/HKUDS/RAG-Anything">https://github.com/HKUDS/RAG-Anything</a>


<h2><span><strong>What it is</strong></span></h2>


An all-in-one multimodal RAG framework built on top of LightRAG (also from HKUDS) that handles text, images, tables, and mathematical equations within a single unified pipeline — instead of needing separate tools for each content type. 15.1k stars, actively maintained, with a technical report on arXiv.


<h2><span><strong>Use case</strong></span></h2>


For documents that aren't just plain text — research papers, financial reports, technical docs with charts/tables/formulas — RAG-Anything parses them via MinerU/Docling/PaddleOCR, routes each content type (text, image, table, equation) through specialized processors, and builds a <strong>multimodal knowledge graph</strong> that captures cross-modal relationships (e.g., a table linked to the paragraph that references it). You can then query with pure text, VLM-enhanced queries (where retrieved images are sent directly to a vision model), or multimodal queries (pass a specific table/equation alongside your question). It also supports direct content-list insertion if you already have pre-parsed output from another tool.


<h2><span><strong>Benefit</strong></span></h2>

<ul>
 	<li><strong>One pipeline instead of five</strong> — eliminates stitching together separate OCR, table-extraction, and image-captioning tools before you even get to retrieval</li>
 	<li><strong>Relationship-aware retrieval</strong> — combines vector similarity with knowledge-graph traversal, so retrieval understands that a chart <em>belongs to</em> a specific section rather than treating every chunk as flat and independent</li>
 	<li><strong>VLM-in-the-loop</strong> — when a query touches on visual content, it automatically pulls in the actual images for the vision model to reason over, not just an image caption as a text proxy</li>
 	<li><strong>Flexible entry point</strong> — <code>process_document_complete()</code> for raw files, or <code>insert_content_list()</code> if you're feeding in output from something like ade-python/LandingAI, which means it could plug in downstream of the LandingAI tools you just covered</li>
</ul>


Happy Learning!!