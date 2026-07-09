<strong>Reference</strong>: <a href="https://github.com/landing-ai/ade-python">https://github.com/landing-ai/ade-python</a>


<h2><span><strong>What it is</strong></span></h2>


The official Python SDK for LandingAI's Agentic Document Extraction (ADE) REST API — a fully-typed library with Pydantic response models, sync and async clients, and support for pluggable HTTP backends (httpx or aiohttp). Install with <code>pip install landingai-ade</code>


<h2><span><strong>Use case</strong></span></h2>


This is the programmatic layer that powers what the <code>ade-document-processing-skills</code> repo teaches coding agents to use. Core methods: <code>parse()</code> (turn a PDF/image into structured Markdown + chunks), <code>split()</code> (classify and separate multi-document batches using custom rules), <code>extract()</code> (pull structured fields via a Pydantic-defined schema), and <code>parse_jobs</code> (async job handling for large documents). It also ships an MCP server so AI assistants like Cursor and VS Code can explore the API endpoints and test requests directly during integration.


<h2><span><strong>Benefit</strong></span></h2>

<ul>
 	<li><strong>Type-safe, editor-friendly</strong> — Pydantic models + typed requests mean autocomplete and validation out of the box, less guesswork wiring document data into downstream pipelines.</li>
 	<li><strong>Handles scale by default</strong> — built-in retries with exponential backoff and async job support for large document processing, so you're not writing your own retry/backoff logic.</li>
 	<li><strong>Schema-first extraction</strong> — define a Pydantic <code>BaseModel</code>, convert it to JSON schema, and extraction output snaps to it — clean for feeding into RAG pipelines or database ingestion.</li>
 	<li><strong>MCP-native</strong> — since it exposes an MCP server, you (or your coding agent) can explore and test the API interactively before writing integration code, shortening the "read docs → guess params → debug" loop.</li>
</ul>


Happy Learning!!