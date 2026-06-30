# What Is Tensor Parallelism, and How Does It Enable LLMs to Run Across Multiple GPUs?

> **Enterprise AI Engineering – Daily Challenges**
>
> **Challenge #009**
>
> **Category:** LLM Infrastructure
>
> **Difficulty:** Intermediate → Advanced
>
> **Estimated Reading Time:** 10–12 minutes

---

# 🎯 The Challenge

You've optimized your inference engine.

- ✅ PagedAttention
- ✅ Continuous Batching
- ✅ FlashAttention
- ✅ Speculative Decoding

Everything is running efficiently.

Then your team wants to deploy a **70B parameter model**.

There's just one problem.

Your GPU has:

```
24 GB VRAM
```

The model requires:

```
140+ GB
```

The model simply doesn't fit.

So how can a model larger than a single GPU still run?

---

# 🤔 Think Before Reading

Imagine trying to move a huge dining table.

One person can't lift it.

Does that mean it can't be moved?

No.

Several people lift different parts of the table at the same time.

Tensor Parallelism follows the same idea.

---

# ✅ Short Answer

**Tensor Parallelism splits large mathematical operations across multiple GPUs.**

Instead of placing the entire model on one GPU,

the computation is shared.

```
One Large Matrix

↓

Split Across GPUs

↓

Each GPU Computes Part

↓

Results Combined

↓

Continue Inference
```

The model behaves exactly the same.

The work is simply distributed.

---

# Why Do We Need Tensor Parallelism?

Consider a 70B parameter model.

Even with FP16:

```
70 Billion Parameters

×

2 Bytes

≈140 GB
```

A single GPU cannot hold it.

Instead of buying a mythical 140 GB GPU...

We split the workload.

---

# A Simple Example

Suppose one layer contains a very large matrix.

Traditional inference:

```
GPU 1

Entire Matrix
```

Tensor Parallelism:

```
GPU 1

Left Half
```

```
GPU 2

Right Half
```

Both GPUs perform their calculations simultaneously.

The outputs are then combined.

---

# What Gets Split?

Tensor Parallelism doesn't divide the model layer-by-layer.

Instead,

it divides the **tensors inside each layer.**

For example,

a linear layer:

```
4096 × 4096
```

becomes:

```
GPU 1

4096 × 2048
```

```
GPU 2

4096 × 2048
```

Each GPU computes only its assigned portion.

---

# How Inference Works

```
Input

↓

GPU 1

Partial Computation
```

```
Input

↓

GPU 2

Partial Computation
```

↓

Communication

↓

Merged Output

↓

Next Layer
```

Every GPU contributes to every forward pass.

---

# Why Communication Matters

Splitting work isn't free.

The GPUs must exchange data after each operation.

```
GPU 1

↓

NCCL

↓

GPU 2
```

This communication introduces overhead.

Fast interconnects like:

- NVLink
- NVSwitch

help reduce this cost.

---

# An Analogy

Imagine four chefs preparing one meal.

Instead of each chef cooking a complete meal,

they work together.

```
Chef 1

Vegetables
```

```
Chef 2

Sauce
```

```
Chef 3

Protein
```

```
Chef 4

Plating
```

Together,

they finish much faster than one chef working alone.

Tensor Parallelism distributes mathematical work in a similar way.

---

# Advantages

Tensor Parallelism enables:

- Models larger than one GPU
- Higher memory capacity
- Better GPU utilization
- Faster computation for very large models

Without it,

many modern LLMs couldn't run at all.

---

# Challenges

Tensor Parallelism also introduces trade-offs.

Every layer requires communication.

Too many GPUs can increase communication overhead.

Performance depends on:

- GPU interconnect
- Network bandwidth
- Model architecture
- Batch size

Scaling isn't perfectly linear.

---

# Tensor Parallelism vs. Data Parallelism

| Feature | Tensor Parallelism | Data Parallelism |
|----------|-------------------|------------------|
| Splits | Model Computation | Input Data |
| Same Request on Multiple GPUs | ✅ | ❌ |
| Multiple Requests | ❌ | ✅ |
| Used for Large Models | ✅ | Sometimes |
| Communication Frequency | High | Low |

Tensor Parallelism is designed for models that **cannot fit on a single GPU**.

---

# Production Perspective

Most large-scale LLM deployments combine several techniques:

- Tensor Parallelism
- Pipeline Parallelism
- Continuous Batching
- PagedAttention

Each solves a different scaling challenge.

There is no single optimization that makes LLM inference fast.

High-performance systems combine multiple strategies.

---

# Common Misconceptions

## ❌ Tensor Parallelism makes models more accurate.

No.

The model architecture remains unchanged.

---

## ❌ Tensor Parallelism eliminates memory limitations.

No.

It distributes memory across GPUs.

---

## ❌ More GPUs always mean better performance.

Not necessarily.

Communication overhead eventually becomes a bottleneck.

Efficient scaling requires balancing computation and communication.

---

# Key Takeaways

- Tensor Parallelism splits tensors across multiple GPUs.
- It enables models larger than a single GPU.
- GPUs compute different parts of the same layer simultaneously.
- Results are combined after each operation.
- Communication overhead is the main trade-off.
- High-speed interconnects are essential for good performance.

---

# Think Like an AI Infrastructure Engineer

When deploying very large language models, ask yourself:

- Does the model fit on one GPU?
- How many GPUs are available?
- What interconnect do they use?
- Is communication overhead acceptable?
- Would Tensor Parallelism or another strategy be more appropriate?

Choosing the right parallelism strategy is just as important as choosing the right model.

---

# What's Next?

In **Challenge #010**, we'll explore another fundamental scaling technique:

> **What Is Pipeline Parallelism, and When Should You Use It Instead of Tensor Parallelism?**

You'll learn how modern LLM platforms combine both approaches to serve models with hundreds of billions of parameters.

---

## Enterprise AI Engineering – Daily Challenges

This article is part of the **Enterprise AI Engineering – Daily Challenges** series, where we explore AI infrastructure, cloud architecture, enterprise software engineering, and production-ready AI systems—one engineering challenge at a time.