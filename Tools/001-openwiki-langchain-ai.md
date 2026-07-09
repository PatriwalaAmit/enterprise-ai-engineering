<strong>Reference</strong> - <a href="https://github.com/langchain-ai/openwiki">https://github.com/langchain-ai/openwiki</a>

<h2><span><strong>What it is</strong></span></h2>

<p>OpenWiki is a CLI that writes and maintains documentation for your codebase, built specifically for AI coding agents.</p>

<h2><span ><strong>Use case</strong></span></h2>

<p>If you're working with coding agents (Claude Code, Copilot, etc.) that need context on a codebase, OpenWiki auto-generates a structured <code>openwiki/</code> docs folder from your repo and keeps it fresh. You install it globally via npm, then run <code>openwiki --init</code> to configure your model/API key and generate the initial docs. It also ships a GitHub Action you can drop into your workflows to automatically open a PR once a day updating the documentation as the code changes.</p>

<h2><span ><strong>Benefit</strong></span></h2>

<ul>
 	<li><span ><strong>Agent-ready context, not human-only docs</strong></span> — it automatically appends prompting to your <code>AGENTS.md</code> and/or <code>CLAUDE.md</code> files so your coding agent knows to reference the generated wiki when searching for context, closing the gap between "docs exist" and "agent actually uses them."</li>
 	<li><span ><strong>Zero manual upkeep</strong></span> — the daily-PR GitHub Action means documentation drift (a constant pain point in fast-moving repos) gets caught automatically instead of relying on someone remembering to update a README.</li>
 	<li><span ><strong>Flexible model choice</strong> </span>— it supports OpenRouter, Fireworks, Baseten, OpenAI, and Anthropic out of the box, with a few pre-defined models and the option to specify custom model IDs, so you're not locked into one provider.</li>
 	<li><span ><strong>Two usage modes</strong></span> — interactive CLI for exploration/follow-ups, or a <code>-p</code>/<code>--print</code> one-shot mode for CI pipelines and scripted runs.</li>
</ul>


Happy Learning!!