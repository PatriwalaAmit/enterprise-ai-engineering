<strong>Reference</strong>: <a href="https://github.com/langchain-ai/deepagents">https://github.com/langchain-ai/deepagents</a>


<h2><span><strong>What it is</strong></span></h2>


An open-source, "batteries-included" agent harness built on LangGraph — an opinionated agent that runs out of the box, where every piece can be extended, overridden, or replaced. 25.1k stars, actively maintained (latest release June 2026).


<h2><span><strong>Use case</strong></span></h2>


Instead of building your own agent loop from scratch on raw LangGraph, you get planning, sub-agents, filesystem access, and context management pre-wired. Quickstart is literally:
<pre><code>from deepagents import create_deep_agent
agent = create_deep_agent(model="openai:gpt-5.5", tools=[my_custom_tool], system_prompt="...")</code></pre>


It's model-agnostic — works with any LLM that supports tool calling, including frontier, open-weight, or local models — so you can swap between Claude, GPT, or a self-hosted model without rewriting the harness. There's also a JS/TS version (deepagents.js) and a pre-built terminal coding agent called Deep Agents Code.


<h2><span><strong>Benefit</strong></span></h2>

<ul>
 	<li><strong>Long-horizon task handling out of the box</strong> — sub-agents let you delegate tasks to agents with isolated context windows, and built-in context management summarizes long threads and offloads tool outputs to disk, which is the exact failure mode (context blowup) that breaks naive single-loop agents on multi-step work.</li>
 	<li><strong>Production-grade from day one</strong> — built on LangGraph for streaming, persistence, and checkpointing, with tracing, evaluation, and deployment via LangSmith, so you're not bolting on observability after the fact.</li>
 	<li><strong>Human-in-the-loop is native</strong> — supports approving, editing, or rejecting tool calls before they run, useful when agents touch anything destructive or costly.</li>
 	<li><strong>Skills + pluggable filesystem</strong> — reusable behaviors the agent can load on demand, plus read/write/edit/search over pluggable local, sandboxed, or remote backends — this composes nicely with the Agent Skills pattern from OpenWiki and ADE skills you already covered.</li>
 	<li><strong>Clear positioning vs LangChain/LangGraph</strong> — LangGraph is the graph runtime, LangChain's create_agent is a minimal harness on top of it, and Deep Agents is a more opinionated harness bundling filesystem, sub-agents, context management, and skills on top of that — useful line for readers unsure which layer to reach for.</li>
</ul>


Happy Learning!!