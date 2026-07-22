# 🔍 2. Retrieval, Search & RAG

> **Beyond Vector Search: The Next Evolution of AI Retrieval**

---

## Table of Contents

1. Introduction
2. Evolution of Retrieval
3. Modern RAG Architecture
4. Why Retrieval Matters
5. Featured Open-Source Projects
6. Choosing the Right Framework
7. Key Takeaways

---

# Introduction

If **LLMs are the brain**, then **Retrieval-Augmented Generation (RAG)** is their memory.

Without retrieval, an LLM relies solely on the knowledge captured during training—a snapshot frozen in time. It cannot access proprietary documents, recent events, or organization-specific knowledge.

That is why **RAG has become the foundation of modern enterprise AI systems.**

The first generation of RAG followed a simple pipeline:

```text
Documents
    │
Chunking
    │
Embeddings
    │
Vector Database
    │
Similarity Search
    │
LLM
```

While effective, this architecture introduced several limitations:

- Context is often split across chunks.
- Similarity search may miss relevant information.
- Tables, diagrams, and layouts are difficult to represent.
- Large-scale embedding pipelines are expensive.
- Retrieval quality decreases as collections grow.

This has led to the next generation of retrieval systems based on **reasoning, graphs, and multimodal understanding**.

---

# Evolution of Retrieval

```text
Keyword Search
      │
      ▼
Vector Search
      │
      ▼
Hybrid Search
      │
      ▼
Graph Retrieval
      │
      ▼
Reasoning Retrieval
      │
      ▼
Multimodal Retrieval
```

---

# Modern RAG Architecture

```text
Enterprise Knowledge
        │
 ┌──────┼──────────────┐
 │      │              │
PDFs Databases     Websites
        │
Document Processing
        │
 ┌──────┼──────────────┐
 │      │              │
Chunks OCR/Layout Graph Builder
        │
Retrieval Engine
        │
 ┌──────┼──────────────┐
 │      │              │
Vector Graph      Reasoning
        │
Context Builder
        │
LLM
```

---

# Why Retrieval Matters

A well-designed retrieval pipeline can often improve answer quality more than upgrading to a much larger language model.

Benefits include:

- Reduced hallucinations
- Better factual accuracy
- Lower token usage
- Access to enterprise knowledge
- Lower infrastructure cost

---

# Featured Open-Source Projects

## 1. PageIndex

**Category:** Reasoning-Based RAG

**What it is**

A reasoning-first retrieval approach that indexes and navigates documents without relying primarily on classic vector similarity—emphasizing structure and reasoning over dense embedding search alone.

**Why it matters**

Vector-only RAG struggles with long manuals and hierarchical docs. PageIndex targets lower storage/preprocessing cost and better reasoning over document structure.

**Best for**

- Enterprise documentation
- Technical manuals
- Reasoning-heavy Q&A over structured corpora
- Teams looking beyond pure vector search

**Key Features**

- Vectorless retrieval patterns
- Reasoning-first indexing
- Lower storage costs
- Reduced preprocessing overhead

**Official:** [https://github.com/VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex)

---

## 2. PixelRAG

**Category:** Multimodal Document Retrieval

**What it is**

A multimodal retrieval approach that works from rendered document images so layouts, charts, tables, and visual context are preserved instead of being flattened into text-only chunks.

**Why it matters**

Many enterprise PDFs lose meaning when OCR/chunking destroys layout. PixelRAG keeps visual structure in the retrieval loop.

**Best for**

- Complex PDFs
- Diagrams and figures
- Financial and technical reports
- Layout-sensitive document Q&A

**Key Features**

- Image-based document retrieval
- Layout and chart preservation
- Table and visual context retention
- Multimodal retrieval path for real-world PDFs

**Official:** [https://github.com/StarTrail-org/PixelRAG](https://github.com/StarTrail-org/PixelRAG)

---

## 3. Colibri

**Category:** Modern Retrieval Framework

**What it is**

A modern retrieval framework aimed at composing contemporary search and RAG pipelines with a cleaner developer experience than stitching many one-off libraries together.

**Why it matters**

Retrieval stacks grow complex quickly (ingest, index, retrieve, rerank). Purpose-built frameworks reduce glue code and make experiments repeatable.

**Best for**

- New RAG prototypes
- Teams standardizing a retrieval stack
- Search + generation pipelines
- Iteration on indexing and ranking strategies

**Key Features**

- Modern retrieval abstractions
- Pipeline-oriented design
- Extensible search components
- Fit for evolving RAG architectures

**Official:** [https://github.com/JustVugg/colibri](https://github.com/JustVugg/colibri)

---

## 4. LlamaIndex

**Category:** Enterprise Data Framework

**What it is**

A widely adopted data framework for connecting LLMs to enterprise data—covering ingestion, indexing, retrieval, and query workflows across many sources and storage backends.

**Why it matters**

LlamaIndex has become a default choice for production RAG because it covers the full data-to-query path with a large ecosystem of connectors and patterns.

**Best for**

- Enterprise RAG applications
- Multi-source data ingestion
- Structured + unstructured retrieval
- Teams that need a mature RAG framework ecosystem

**Key Features**

- Broad data connectors
- Flexible indexing and query engines
- Strong RAG workflow primitives
- Large community and integration surface

**Official:** [https://github.com/run-llama/llama_index](https://github.com/run-llama/llama_index)

---

## 5. Haystack

**Category:** Production Search Framework

**What it is**

deepset's production-oriented framework for building search and RAG pipelines with composable nodes for retrieval, ranking, generation, and evaluation.

**Why it matters**

Enterprise search/RAG needs pipelines you can test, monitor, and swap components in—not notebooks. Haystack is built around that production pipeline mindset.

**Best for**

- Production search systems
- Modular RAG pipelines
- Teams that want explicit pipeline graphs
- Evaluation-friendly retrieval stacks

**Key Features**

- Composable pipeline nodes
- Retrieval and ranking building blocks
- Production deployment patterns
- Strong search + RAG orientation

**Official:** [https://github.com/deepset-ai/haystack](https://github.com/deepset-ai/haystack)

---

## 6. GraphRAG

**Category:** Knowledge Graph Retrieval

**What it is**

Microsoft's approach to retrieval that builds and queries knowledge graphs over corpora so answers can use entity/relationship structure—not only vector similarity.

**Why it matters**

Some questions need global themes, entity links, and multi-hop reasoning that flat chunk search misses. GraphRAG targets that class of enterprise reasoning.

**Best for**

- Enterprise knowledge reasoning
- Multi-hop / relationship-heavy questions
- Corpora where entities and links matter
- Graph-enhanced RAG architectures

**Key Features**

- Knowledge graph construction over documents
- Graph-aware retrieval and summarization
- Strong fit for complex corpora
- Complements (not always replaces) vector RAG

**Official:** [https://github.com/microsoft/graphrag](https://github.com/microsoft/graphrag)

---

## 7. LightRAG

**Category:** Lightweight Graph Retrieval

**What it is**

A lighter-weight graph-enhanced RAG framework (from HKUDS) that aims to capture graph-style retrieval benefits with a simpler, more efficient footprint than heavy enterprise graph pipelines.

**Why it matters**

Full GraphRAG-style systems can be expensive to run. LightRAG offers a path to graph-aware retrieval when you need relationships without maximum graph infrastructure cost.

**Best for**

- Graph-aware RAG with lower overhead
- Research and product prototypes
- Teams already exploring HKUDS RAG tooling
- Relationship-sensitive retrieval without heavy ops

**Key Features**

- Lightweight graph retrieval
- Efficient indexing/query patterns
- Graph + vector hybrid style benefits
- Practical alternative to heavier graph RAG stacks

**Official:** [https://github.com/HKUDS/LightRAG](https://github.com/HKUDS/LightRAG)

---

## 8. EmbedAnything

**Category:** Embedding Pipeline

**What it is**

A fast embedding pipeline focused on turning content into vectors efficiently—so embedding generation is a first-class, optimized step rather than an afterthought in RAG.

**Why it matters**

Ingest latency and embedding cost often dominate RAG operations. Dedicated embedding pipelines improve throughput and make multimodal/text embedding workflows more consistent.

**Best for**

- High-throughput embedding jobs
- RAG ingest pipelines
- Teams optimizing embedding cost/latency
- Streaming or batch embedding workloads

**Key Features**

- Efficient embedding generation
- Pipeline-oriented design
- Fit for RAG preprocessing
- Practical performance focus

**Official:** [https://github.com/StarlightSearch/EmbedAnything](https://github.com/StarlightSearch/EmbedAnything)

---

## 9. DocLang

**Category:** AI-Native Document Format

**What it is**

An AI-native document format project aimed at representing documents in ways models and retrieval systems can use more reliably than legacy PDF/Word layouts alone.

**Why it matters**

If documents remain opaque blobs, every RAG system re-solves parsing. AI-native formats push structure upstream so retrieval and agents start from better representations.

**Best for**

- AI-first documentation workflows
- Structured document interchange
- Teams redesigning content for LLM consumption
- Reducing brittle PDF-centric parsing

**Key Features**

- AI-oriented document representation
- Structure-friendly authoring/interchange
- Better fit for retrieval and agents
- Complements layout-aware parsers when legacy docs remain

**Official:** [https://github.com/doclang-project/doclang](https://github.com/doclang-project/doclang)

---

## 10. ColPali

**Category:** Vision-Based Retrieval

**What it is**

A vision-based document retrieval approach that embeds document pages as images and retrieves with late-interaction / multimodal techniques—strong when text extraction fails or layout is the signal.

**Why it matters**

OCR-first pipelines lose charts, forms, and spatial cues. ColPali-style retrieval treats the page as a visual object, which is often closer to how humans search PDFs.

**Best for**

- Visual document retrieval
- Scanned or layout-heavy PDFs
- Chart/table-centric corpora
- Multimodal RAG experiments

**Key Features**

- Page-as-image retrieval
- Vision-language embedding patterns
- Strong on visual/layout signals
- Alternative to text-only chunk search

**Official:** [https://github.com/illuin-tech/colpali](https://github.com/illuin-tech/colpali)

---

# Choosing the Right Framework

| Scenario | Recommended Tool |
|----------|------------------|
| Enterprise RAG | LlamaIndex |
| Production Search | Haystack |
| Reasoning-Based Retrieval | PageIndex |
| Graph-Based Retrieval | GraphRAG |
| Complex PDFs | PixelRAG |
| Visual Retrieval | ColPali |
| Fast Embedding Pipeline | EmbedAnything |
| AI-Native Documents | DocLang |

---

# Key Takeaways

The future of retrieval is moving beyond vector databases toward:

- Reasoning-first retrieval
- Graph-enhanced search
- Multimodal document understanding
- AI-native document formats
- Efficient embedding pipelines

Modern AI systems increasingly rely on **retrieval engineering** as a core capability for building accurate, scalable, and cost-effective applications.
