# What Is Continuous Batching, and Why Is It Faster Than Traditional Batching?

> **Enterprise AI Engineering – Daily Challenges**
>
> **Challenge #005**
>
> **Category:** LLM Infrastructure
>
> **Difficulty:** Intermediate
>
> **Estimated Reading Time:** 10–12 minutes

---

# 🎯 The Challenge

Imagine you're serving an LLM for hundreds of users.

Requests arrive continuously.

```
09:00:01 → User A

09:00:02 → User B

09:00:03 → User C

09:00:04 → User D
```

A traditional inference engine processes requests in fixed batches.

But what happens when one request finishes early?

Does the GPU immediately start serving another request?

Surprisingly...

**Usually not.**

So how does **vLLM** keep GPUs busy almost all the time?

---

# 🤔 Think Before Reading

Imagine an elevator.

Traditional batching works like this:

The elevator waits until everyone gets off before letting new people enter.

Even if someone is waiting outside...

They must wait for the next trip.

Would that be efficient during rush hour?

Probably not.

---

# ✅ Short Answer

**Continuous Batching** allows new requests to join an existing batch as soon as GPU resources become available.

Instead of waiting for an entire batch to finish, the inference engine continuously schedules new work.

The result is:

- Higher GPU utilization
- Better throughput
- Lower latency
- More concurrent users

---

# Traditional Static Batching

Suppose four requests arrive.

```
Batch 1

User A

User B

User C

User D
```

The GPU processes them together.

Now imagine:

```
User A finishes

User B finishes

User C continues

User D continues
```

Even though GPU resources are now available...

The inference engine often waits until **every request** finishes before accepting another batch.

This creates idle GPU time.

---

# The Problem

Imagine User E arrives while User C is still generating.

```
Current Batch

A ✓

B ✓

C Running

D Running

User E Waiting...
```

Even though the GPU has available capacity,

User E waits.

Those idle GPU cycles are wasted.

---

# Continuous Batching

Continuous Batching works differently.

As soon as User A finishes:

```
User A ✓

↓

GPU Slot Available

↓

User E Joins Immediately
```

The batch never stops.

Instead, requests continuously enter and leave.

```
A → Finished

↓

E Joins

↓

B → Finished

↓

F Joins

↓

C → Finished

↓

G Joins
```

The GPU stays busy.

---

# Why Is This Faster?

Think of an airport security checkpoint.

Traditional batching:

```
Wait until everyone finishes.

↓

Start next group.
```

Continuous batching:

```
One passenger leaves.

↓

Next passenger enters immediately.
```

No waiting.

Higher throughput.

---

# Why PagedAttention Matters

Continuous Batching wouldn't work efficiently without flexible memory management.

Every request has:

- Different prompt lengths
- Different response lengths
- Different KV Cache sizes

Traditional memory allocation struggles with this.

PagedAttention solves it by allocating memory in reusable pages.

That's why **PagedAttention** and **Continuous Batching** work together.

---

# GPU Utilization

Traditional batching:

```
GPU

████████░░░░░░
```

Continuous batching:

```
GPU

██████████████
```

Higher utilization means:

- More tokens per second
- Better hardware efficiency
- Lower infrastructure cost

---

# Real Production Example

Imagine your GPU serves:

```
100 Users
```

Traditional batching might process:

```
20 Requests

↓

Wait

↓

Next 20 Requests
```

Continuous batching:

```
20 Requests

↓

18 Running

↓

2 Finish

↓

2 New Requests Join

↓

17 Running

↓

3 Finish

↓

3 New Requests Join
```

The GPU remains active almost continuously.

---

# Production Benefits

Continuous Batching provides:

- Higher throughput
- Lower latency
- Better GPU utilization
- Increased concurrency
- Lower cost per request

These improvements become even more significant under heavy production workloads.

---

# Common Misconceptions

## ❌ Continuous Batching Makes the GPU Faster

No.

The GPU hardware doesn't become faster.

Continuous Batching simply keeps it busy more efficiently.

---

## ❌ Continuous Batching Reduces Model Size

No.

The model remains unchanged.

Only the scheduling strategy changes.

---

## ❌ Continuous Batching Eliminates Queueing

No.

Requests can still queue under heavy load.

However, GPU resources are utilized much more efficiently.

---

# Traditional vs Continuous Batching

| Feature | Traditional Batching | Continuous Batching |
|----------|---------------------|---------------------|
| Fixed Batch | ✅ | ❌ |
| Dynamic Scheduling | ❌ | ✅ |
| GPU Utilization | Medium | High |
| Throughput | Good | Excellent |
| Latency | Higher | Lower |
| Production Efficiency | Moderate | Excellent |

---

# Key Takeaways

- Traditional batching waits for the entire batch to finish.
- Continuous Batching continuously schedules new requests.
- Better scheduling increases GPU utilization.
- Higher GPU utilization improves throughput.
- Continuous Batching works hand-in-hand with PagedAttention.
- Efficient scheduling reduces infrastructure costs.

---

# Think Like an AI Infrastructure Engineer

Modern LLM serving isn't only about faster GPUs.

It's about making better use of the GPUs you already have.

Before buying more hardware, ask:

- Is my GPU fully utilized?
- Am I wasting compute waiting for batches to finish?
- Can smarter scheduling increase throughput?

Often, the biggest performance gains come from better infrastructure design—not bigger hardware.

---

# What's Next?

In **Challenge #006**, we'll answer another important question:

> **Why Is vLLM Significantly Faster Than Traditional LLM Inference Engines?**

We'll bring together everything you've learned so far—KV Cache, PagedAttention, and Continuous Batching—to understand why modern inference engines dramatically outperform traditional approaches.

---

## Enterprise AI Engineering – Daily Challenges

This article is part of the **Enterprise AI Engineering – Daily Challenges** series, where we explore practical AI infrastructure, cloud architecture, enterprise software engineering, and production-ready AI systems—one engineering challenge at a time.