# Platform Metrics Framework — Fraud Detection Decisioning Platform

Comprehensive monitoring metrics across all layers and microservices. Each layer defines a **North Star** metric (the single most important indicator), a **Counter** metric (guardrail that prevents optimizing the North Star at the expense of something else), and **Primary/Secondary** operational metrics.

---

## Layer 1: Business / Product

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Fraud Detection Accuracy (F1)** | Harmonic mean of precision and recall for fraud decisions | > 0.92 | `2 * (precision * recall) / (precision + recall)` over confirmed outcomes |
| **Counter** | False Positive Rate | % of legitimate sellers incorrectly rejected | < 5% | Rejected sellers later confirmed legitimate / total rejections |
| **Primary** | Precision (Fraud) | Of all REJECT decisions, how many were actual fraud | > 0.90 | True positives / (true positives + false positives) |
| **Primary** | Recall (Fraud) | Of all actual fraud, how many did we catch | > 0.85 | True positives / (true positives + false negatives) |
| **Primary** | Decision Distribution | Ratio of APPROVE / REVIEW / REJECT | Track trend | Count per decision type per day |
| **Primary** | Time to Decision | End-to-end from seller submission to decision | < 30s | Timestamp diff (submission → decision event) |
| **Secondary** | Fraud Escape Rate | Approved sellers later confirmed as fraud | < 2% | Post-approval fraud confirmations / total approvals |
| **Secondary** | Manual Review Rate | % of decisions requiring human review | < 15% | REVIEW decisions / total decisions |
| **Secondary** | Decision Overturn Rate | % of agent decisions overturned by humans | < 10% | Analyst overrides / total decisions reviewed |
| **Secondary** | Revenue Impact | Estimated GMV protected by fraud blocks | $ value | Blocked transaction volume × avg fraud loss |

---

## Layer 2: Agent Reasoning (TPAOR Loop)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Decision Quality Score** | Composite of TruLens + RAGAS eval scores | > 0.85 | Weighted avg: 0.3×groundedness + 0.3×faithfulness + 0.2×relevance + 0.2×coherence |
| **Counter** | Agent Latency (p95) | 95th percentile end-to-end reasoning time | < 45s | Trace duration from `agent:action:start` → `agent:decision:complete` |
| **Primary** | Confidence Calibration Error | Gap between predicted confidence and actual accuracy | < 0.10 | `\|avg_confidence - actual_accuracy\|` over rolling window |
| **Primary** | Multi-Turn Investigation Rate | % of decisions requiring deeper investigation | 10-30% | Investigation round 2 triggered / total decisions |
| **Primary** | Tool Utilization Rate | Avg tools executed per decision | 5-8 | Total tool executions / total decisions |
| **Primary** | Reflection Revision Rate | % of decisions revised by the REFLECT step | 5-15% | `shouldRevise=true` count / total decisions |
| **Secondary** | Policy Override Rate | % of decisions overridden by hard policy rules | Track trend | Policy violations / total decisions |
| **Secondary** | Re-Plan Rate | % of action plans that required re-planning | < 20% | Re-plan events / total decisions |
| **Secondary** | Chain-of-Thought Depth | Avg number of reasoning steps per decision | 6-12 | Chain of thought entries per decision |
| **Secondary** | Pattern Match Hit Rate | % of cases with prior pattern matches | Track trend | Decisions with pattern matches / total |

---

## Layer 3: LLM Service (OpenAI GPT)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **LLM Value Efficiency** | Decision quality improvement per dollar spent | > 15% lift per $0.01 | `(llm_quality - fallback_quality) / llm_cost_usd` |
| **Counter** | LLM Dependency Rate | % of decisions that fail without LLM | < 5% failure | Decisions where fallback logic differs significantly from LLM |
| **Primary** | Token Cost per Decision | Average USD spent on LLM per onboarding decision | < $0.05 | Sum(input_tokens × rate + output_tokens × rate) per decision |
| **Primary** | LLM Latency (p50 / p95) | Response time from LLM provider | p50 < 2s, p95 < 5s | Measured per `llm-client.js` call |
| **Primary** | Cache Hit Rate | % of LLM calls served from Redis cache | > 20% | Cache hits / total LLM calls |
| **Primary** | LLM Error Rate | % of LLM calls that fail (timeout, rate limit, 5xx) | < 2% | Failed calls / total calls |
| **Secondary** | JSON Parse Success Rate | % of LLM responses that parse as valid JSON | > 95% | Successful parses / total parse attempts |
| **Secondary** | Fallback Activation Rate | % of decisions using hardcoded logic instead of LLM | Track trend | Fallback executions / total decisions |
| **Secondary** | Token Efficiency | Avg output tokens per decision (verbosity control) | < 500 | Output tokens per reasoning call |
| **Secondary** | Retry Rate | % of LLM calls requiring retries | < 5% | Retried calls / total calls |

---

## Layer 4: RAG / Vector Search (Qdrant, Pinecone)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Retrieval Precision@5** | Of top 5 retrieved documents, how many are relevant | > 0.80 | RAGAS `context_precision` metric |
| **Counter** | Retrieval Latency (p95) | Time to search + return vector results | < 500ms | Measured at `vector-backend.js` |
| **Primary** | Context Recall | % of ground-truth info covered by retrieved docs | > 0.75 | RAGAS `context_recall` (requires labeled data) |
| **Primary** | Retrieval Hit Rate | % of queries that return ≥1 relevant result (score > 0.7) | > 85% | Queries with top score > 0.7 / total queries |
| **Primary** | Collection Size | Total vectors stored per namespace | Track growth | `describe-index-stats` per collection |
| **Primary** | Embedding Throughput | Documents ingested per minute | > 50/min | Ingest count / time window |
| **Secondary** | Similarity Score Distribution | Avg/p50/p95 of top-k similarity scores | Avg > 0.75 | Score stats from search results |
| **Secondary** | Stale Document Rate | % of documents older than 30 days without update | < 40% | Docs with `updatedAt > 30d` / total docs |
| **Secondary** | Namespace Balance | Document count variance across namespaces | Low variance | Std dev of counts across fraud-cases, onboarding-knowledge, etc. |
| **Secondary** | Duplicate Detection Rate | % of ingestions flagged as near-duplicates | Track trend | Duplicate count / total ingestions |

---

## Layer 5: Memory (Mem0 + Letta)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Memory Utilization Rate** | % of decisions where retrieved memories influenced the outcome | > 30% | Decisions with memory-sourced evidence / total |
| **Counter** | Memory Staleness | Avg age of memories retrieved at decision time | < 7 days for recent, historical OK | Avg `(now - memory.createdAt)` for retrieved memories |
| **Primary** | Memory Write Success Rate | % of memory saves that succeed | > 95% | Successful saves / attempted saves |
| **Primary** | Memory Search Latency (p95) | Time to query + return semantic results | < 1s | HTTP round-trip to eval service `/memory/search` |
| **Primary** | Memory Relevance Score | Avg similarity score of retrieved memories | > 0.70 | Mean score from Mem0 search results |
| **Primary** | Unique Memory Count | Total distinct memories per agent | Track growth | Mem0 collection stats |
| **Secondary** | Memory Dedup Rate | % of save attempts that merge with existing | Track trend | Mem0 internal dedup / total saves |
| **Secondary** | Memory Read/Write Ratio | Queries vs saves | > 3:1 | Reads / writes per time window |
| **Secondary** | Fallback to SQLite Rate | % of memory operations hitting SQLite | < 10% | SQLite fallback count / total operations |
| **Secondary** | Cross-Agent Memory Sharing | Memories accessed by agents other than the creator | Track trend | Queries with different agentId than creator |

---

## Layer 6: Temporal Memory (Zep)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Temporal Insight Rate** | % of decisions enriched by temporal entity history | > 20% | Decisions with Zep-sourced facts / total |
| **Counter** | Session Bloat | Avg messages per Zep session | < 200 | Zep session stats |
| **Primary** | Fact Save Success Rate | % of temporal fact saves that succeed | > 95% | `zepWrites / (zepWrites + zepErrors)` |
| **Primary** | Temporal Query Latency (p95) | Time to search entity history | < 800ms | HTTP round-trip to Zep `/search` |
| **Primary** | Entity Coverage | % of evaluated sellers with a Zep session | Track growth | Sessions created / total sellers evaluated |
| **Secondary** | Summary Generation Rate | % of sessions with auto-generated summaries | > 50% | Sessions with non-null summary / total |
| **Secondary** | Repeat Entity Detection | % of entities seen more than once | Track trend | Entities with > 1 session message / total entities |
| **Secondary** | Zep Error Rate | % of Zep API calls that fail | < 5% | `zepErrors / (zepWrites + zepReads + zepErrors)` |

---

## Layer 7: Graph Database (Neo4j)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Fraud Ring Detection Rate** | Number of fraud rings identified per week | Track trend, > 0 | `findRings()` results per time window |
| **Counter** | Graph Query Latency (p95) | Cypher query response time | < 2s | Neo4j driver timing |
| **Primary** | Risk Propagation Reach | Avg entities affected per fraud confirmation | 3-10 | Nodes returned by `riskPropagation()` |
| **Primary** | Graph Density | Avg edges per entity node | 2-5 | Total edges / total nodes |
| **Primary** | Connection Discovery Rate | % of sellers with ≥1 graph connection to existing entities | > 30% | Sellers with connections / total sellers |
| **Secondary** | Node Growth Rate | New entity nodes per day | Track trend | Daily node count delta |
| **Secondary** | Cross-Entity Link Rate | % of sellers sharing email/device/payment with another seller | Track trend | Shared-attribute edges / total sellers |
| **Secondary** | Query Pool Utilization | Neo4j connection pool usage | < 70% | Active connections / max pool size (50) |
| **Secondary** | Graph Staleness | % of nodes not updated in 30+ days | < 60% | Old nodes / total nodes |

---

## Layer 8: Cache (Redis)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Cost Savings Rate** | LLM cost avoided via cache hits | > 20% of LLM spend | Cache hits × avg LLM cost per call |
| **Counter** | Cache Pollution Rate | % of cache entries never read before expiry | < 40% | Entries with 0 hits at TTL expiry |
| **Primary** | Overall Cache Hit Rate | % of cache lookups that return a result | > 25% | Hits / (hits + misses) |
| **Primary** | Redis Latency (p95) | GET/SET response time | < 5ms | Redis command timing |
| **Primary** | Memory Usage | Redis memory consumption | < 80% of max | `INFO memory` |
| **Primary** | Pattern Match Accuracy | Precision of Redis pattern recommendations | > 0.75 | Pattern-recommended outcomes vs actual |
| **Secondary** | Key Count | Total keys in Redis | Track trend | `DBSIZE` |
| **Secondary** | Eviction Rate | Keys evicted due to memory pressure | 0 (ideally) | `INFO stats` evicted_keys |
| **Secondary** | TTL Distribution | Spread of key expiration times | Uniform | Histogram of TTL values |

---

## Layer 9: Observability (Langfuse + Phoenix)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Trace Completeness** | % of agent decisions with full end-to-end traces | > 98% | Complete traces / total decisions |
| **Counter** | Observability Overhead | Added latency from tracing instrumentation | < 50ms per decision | Trace timing overhead vs uninstrumented |
| **Primary** | Span Coverage | Avg spans per trace (each tool = 1 span) | 8-15 | Spans count from Langfuse traces |
| **Primary** | Cost Tracking Accuracy | % of LLM calls with cost data recorded | > 95% | Generations with cost / total LLM calls |
| **Primary** | Trace Ingest Success Rate | % of traces successfully sent to Langfuse | > 99% | Successful flushes / total flushes |
| **Secondary** | Phoenix Trace Rate | % of traces also forwarded to Phoenix | Track trend | Phoenix traces / total traces |
| **Secondary** | Avg Trace Duration | Mean time across all agent traces | Track trend | Langfuse aggregate |
| **Secondary** | Dashboard Staleness | Time since last trace visible in Langfuse UI | < 30s | UI refresh lag |

---

## Layer 10: Evaluation (TruLens + RAGAS + DeepEval + BrainTrust)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Eval Coverage** | % of decisions that receive quality evaluation | > 20% | Evaluated decisions / total decisions |
| **Counter** | Eval Service Latency | Time to run full eval suite | < 15s | Endpoint response time for `/evaluate` |
| **Primary** | Groundedness Score (rolling avg) | Are decisions supported by evidence? | > 0.85 | TruLens `groundedness` 30-day rolling avg |
| **Primary** | Faithfulness Score (rolling avg) | Are claims grounded in retrieved context? | > 0.85 | RAGAS `faithfulness` 30-day rolling avg |
| **Primary** | Answer Relevance (rolling avg) | Does the decision address the query? | > 0.90 | TruLens `answer_relevance` 30-day rolling avg |
| **Primary** | Context Precision (rolling avg) | Are retrieved contexts relevant? | > 0.80 | RAGAS `context_precision` 30-day rolling avg |
| **Secondary** | Regression Alert Count | Evals that trigger regression detection | 0 per week | `checkForRegression()` alerts |
| **Secondary** | Eval Error Rate | % of eval calls that fail | < 10% | Failed evals / attempted evals |
| **Secondary** | Score Variance | Std dev of eval scores within an agent | Low (< 0.15) | Std dev per metric over window |
| **Secondary** | Ground Truth Coverage | % of evals with labeled ground truth | Track toward > 50% | Evals with non-null ground_truth / total |

---

## Layer 11: Database (Postgres + SQLite)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Query Reliability** | % of DB operations that succeed | > 99.9% | Successful ops / total ops |
| **Counter** | Query Latency (p95) | Slowest 5% of queries | < 100ms | DB query timing |
| **Primary** | Connection Pool Usage | Active Postgres connections vs max | < 80% | `pg_stat_activity` |
| **Primary** | Table Growth Rate | Rows inserted per hour for key tables | Track trend | `sellers`, `agent_decisions`, `agent_traces` row counts |
| **Primary** | Write Success Rate | % of INSERT/UPDATE operations succeeding | > 99.9% | Error count from `db_ops` |
| **Secondary** | SQLite DB File Size | Size of fraud_detection.db | < 1GB | File system check |
| **Secondary** | Migration Status | Are all migrations applied? | All applied | Migration version check |
| **Secondary** | Dead Row Ratio (Postgres) | Table bloat from unvacuumed rows | < 20% | `pg_stat_user_tables` dead tuple ratio |

---

## Layer 12: API Gateway (Express + WebSocket)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **API Availability** | % of requests that return non-5xx response | > 99.9% | `(total - 5xx) / total` |
| **Counter** | API Latency (p95) | 95th percentile response time across all endpoints | < 5s | Express middleware timing |
| **Primary** | Request Throughput | Requests per second across all endpoints | Track trend | Request count / time window |
| **Primary** | Error Rate by Endpoint | 4xx + 5xx rate per route | < 1% for 5xx | Error count per route |
| **Primary** | WebSocket Connection Count | Active WS connections | Track trend | `ws.clients.size` |
| **Primary** | Event Delivery Latency | Time from event emission to WS client receipt | < 500ms | Timestamp diff |
| **Secondary** | Endpoint Hit Distribution | Most/least used endpoints | Track trend | Request count per route |
| **Secondary** | Payload Size (p95) | Response body size | < 500KB | Content-Length tracking |
| **Secondary** | WS Reconnection Rate | WS disconnects + reconnects per hour | < 5/hr | Connection churn count |

---

## Layer 13: Frontend (React + Vite)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Task Completion Rate** | % of started onboarding evaluations that show final result | > 95% | Decisions displayed / submissions started |
| **Counter** | UI Error Rate | Uncaught JS exceptions per session | < 0.1/session | Error boundary catches + window.onerror |
| **Primary** | Time to First Decision Display | From submit click to decision rendered | < 35s | Frontend timestamp diff |
| **Primary** | Agent Flow Viewer Completeness | % of steps rendered vs steps emitted by backend | 100% | Rendered steps / emitted step events |
| **Primary** | Polling Success Rate | % of event polls returning new data | > 80% when agent active | Non-empty polls / total polls |
| **Secondary** | Page Load Time (LCP) | Largest Contentful Paint | < 2.5s | Web Vitals |
| **Secondary** | Bundle Size | JS bundle delivered to browser | < 1MB gzipped | Vite build output |
| **Secondary** | Component Render Count | Re-renders per AgentFlowViewer update | < 3 per event | React DevTools profiler |

---

## Layer 14: Infrastructure (Docker + Host)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Service Health Rate** | % of Docker services in healthy state | 100% | `docker compose ps` healthy count / total |
| **Counter** | Resource Saturation | Any container hitting CPU/memory limits | 0 containers | `docker stats` |
| **Primary** | Container Restart Count | Unexpected container restarts per day | 0 | `docker inspect` RestartCount |
| **Primary** | Disk Usage | Host disk consumption | < 80% | `df -h` |
| **Primary** | Memory Usage per Container | RAM consumed per service | Track, alert at 80% | `docker stats` MEM USAGE |
| **Primary** | CPU Usage per Container | CPU consumed per service | < 70% sustained | `docker stats` CPU % |
| **Secondary** | Container Uptime | Time since last restart per service | > 7 days | `docker inspect` StartedAt |
| **Secondary** | Network I/O | Inter-container traffic volume | Track trend | `docker stats` NET I/O |
| **Secondary** | Volume Size | Persistent volume disk usage | Track growth | Docker volume inspect |

---

## Layer 15: Data Quality

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Data Completeness Rate** | % of seller records with all required fields populated | > 95% | Non-null count for required fields (businessName, email, country, category, taxId) / total records |
| **Counter** | Data Collection Overhead | Added latency from validation/enrichment at ingestion | < 200ms | Time spent in input validation before agent starts |
| **Primary** | Field-Level Completeness | Per-field null/empty rate across all sellers | < 5% nulls per required field | `COUNT(NULL) / COUNT(*)` per column |
| **Primary** | Data Accuracy Rate | % of seller-provided data that matches external verification | > 80% | Verified fields (email valid, address real, business registered) / total verifiable fields |
| **Primary** | Schema Conformance Rate | % of API payloads that pass schema validation without coercion | > 98% | Payloads passing `output-validator.js` / total payloads |
| **Primary** | Duplicate Record Rate | % of sellers that are near-duplicates of existing records | < 3% | `check_duplicates` tool matches / total submissions |
| **Secondary** | Data Freshness (input) | Avg age of external data used in decisions (IP reputation, watchlists) | < 24h | Timestamp of last external API refresh vs decision time |
| **Secondary** | Enum Validity Rate | % of categorical fields with valid values (country codes, categories) | > 99% | Valid enum values / total categorical field values |
| **Secondary** | PII Exposure Score | Count of PII fields stored unmasked across all systems | 0 in logs/traces | Scan traces, logs, and vector payloads for raw PII |
| **Secondary** | Cross-Field Consistency | % of records where related fields are logically consistent | > 95% | e.g., country matches phone prefix, bank routing matches country |

---

## Layer 16: Data Pipeline & Ingestion

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Pipeline Throughput** | End-to-end records processed per minute across all pipelines | Track trend, no degradation | Records ingested (API → DB → Vector → Graph) per minute |
| **Counter** | Pipeline Failure Rate | % of ingestion attempts that fail at any stage | < 1% | Failed writes across all stores / total write attempts |
| **Primary** | Ingestion-to-Searchable Latency | Time from seller submission to searchable in vector DB | < 60s | Timestamp diff: API insert → Qdrant upsert confirmation |
| **Primary** | Graph Sync Lag | Time from seller creation to Neo4j node + edges created | < 30s | Timestamp diff: DB insert → Neo4j MERGE confirmation |
| **Primary** | Memory Sync Lag | Time from decision to Mem0/Zep write confirmation | < 10s | Timestamp diff: decision event → memory write success |
| **Primary** | Cross-Store Consistency | % of sellers present in all expected stores (DB + Vector + Graph) | > 95% | Sellers in Postgres ∩ Qdrant ∩ Neo4j / sellers in Postgres |
| **Secondary** | Bulk Ingest Success Rate | % of batch ingestion jobs completing without error | > 99% | Successful bulk jobs / total bulk jobs |
| **Secondary** | Dead Letter Queue Size | Records that failed ingestion and are pending retry | 0 (ideally) | Count of unprocessed failed records |
| **Secondary** | Backfill Completion Rate | % of historical data successfully backfilled to new stores | 100% when triggered | Backfilled records / total historical records |
| **Secondary** | Synthetic Data Quality | % of Faker-generated records that pass same validation as real data | > 99% | Synthetic records passing schema validation |

---

## Layer 17: Data Consistency & Integrity (Cross-Store)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Cross-Store Agreement Rate** | % of sellers where decision stored in DB matches decision in Vector + Graph + Memory | 100% | Compare decision field across Postgres, Qdrant metadata, Neo4j node properties, Mem0 content |
| **Counter** | Reconciliation Latency | Time to detect and report cross-store inconsistencies | < 5 min | Periodic reconciliation job cycle time |
| **Primary** | Orphan Record Rate (Vector) | Vectors in Qdrant with no matching Postgres record | 0% | Vector IDs not found in sellers table / total vectors |
| **Primary** | Orphan Record Rate (Graph) | Neo4j nodes with no matching Postgres record | 0% | Graph node IDs not found in sellers table / total nodes |
| **Primary** | Stale Decision Rate | % of sellers where DB decision is newer than vector/graph | < 2% | Sellers with DB `updatedAt` > vector `updatedAt` |
| **Primary** | Write Fanout Success | % of writes where all downstream stores updated | > 98% | All-stores-confirmed writes / total writes |
| **Secondary** | Ghost Session Rate (Zep) | Zep sessions with no matching seller entity | < 1% | Zep sessions not found in sellers table |
| **Secondary** | Cache-DB Drift | % of cached patterns where outcome differs from DB | < 5% | Redis pattern outcomes vs DB confirmed outcomes |
| **Secondary** | Embedding Version Consistency | % of vectors using the current embedding model version | > 95% | Vectors with current model / total vectors |

---

## Layer 18: Data Drift & Distribution

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Feature Distribution Stability** | Statistical distance between current and baseline feature distributions | PSI < 0.2 | Population Stability Index on key features (country, category, riskScore) per week |
| **Counter** | Alert Fatigue Rate | % of drift alerts that are false positives (no actual performance impact) | < 30% | Drift alerts where decision quality didn't change / total drift alerts |
| **Primary** | Country Distribution Shift | Change in top-10 country distribution vs baseline | < 15% KL divergence | Weekly KL divergence on country field |
| **Primary** | Risk Score Distribution Shift | Change in riskScore mean/std vs 30-day baseline | Mean shift < 10 points | Rolling 7d mean vs 30d mean |
| **Primary** | Category Distribution Shift | New or shifting business category proportions | Track trend | Chi-squared test on category frequencies |
| **Primary** | Decision Distribution Shift | Change in APPROVE/REVIEW/REJECT ratios vs baseline | < 10% shift | Weekly ratio comparison |
| **Secondary** | Label Drift | Change in confirmed fraud rate over time | Track trend | Confirmed fraud / total confirmed outcomes per week |
| **Secondary** | Input Volume Anomaly | Unusual spikes or drops in submission volume | Within 2σ of 30d average | Z-score of daily submission count |
| **Secondary** | New Category Rate | % of submissions with previously unseen business categories | < 5% | New categories this week / total submissions |
| **Secondary** | Missing Field Trend | Increasing null rates for specific fields over time | No upward trend | Slope of null rate per field over 30d |

---

## Layer 19: Data Governance & Lineage

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Decision Traceability** | % of decisions where full data lineage can be reconstructed (input → tools → evidence → decision) | 100% | Decisions with complete chain-of-thought + tool results / total |
| **Counter** | Governance Overhead | Added processing time from lineage tracking and audit logging | < 100ms | Time in decision-logger + trace-collector per decision |
| **Primary** | Audit Trail Completeness | % of decisions with full audit record (who, what, when, why, evidence) | 100% | Records in `agent_decisions` with all required fields / total |
| **Primary** | Data Retention Compliance | % of data stores adhering to retention policy | 100% | Stores with data older than retention limit / total stores |
| **Primary** | Evidence Attribution Rate | % of risk factors in decisions linked to a specific tool result | > 90% | Attributed risk factors / total risk factors cited |
| **Primary** | PII Access Logging | % of PII field accesses that are logged | 100% | Logged PII accesses / total PII reads |
| **Secondary** | Schema Version Tracking | All stores running on documented schema version | 100% aligned | Schema version check across Postgres, SQLite, vector collections |
| **Secondary** | Data Deletion Compliance | Time to honor data deletion requests across all stores | < 24h | Request timestamp → confirmed deletion from all stores |
| **Secondary** | Cross-Store Lineage Coverage | % of data flows with documented source → destination mapping | > 90% | Documented flows / total identified flows |

---

## Layer 20: Ground Truth & Label Quality

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Label Coverage** | % of past decisions with confirmed outcome labels (actual fraud/legitimate) | > 50% over time | Sellers with confirmed outcome / total evaluated sellers |
| **Counter** | Label Latency | Avg time from decision to confirmed outcome label | < 30 days | Avg `(label_timestamp - decision_timestamp)` |
| **Primary** | Label Agreement Rate | % of human labels that agree with agent decision | > 85% | Matching labels / total labeled records |
| **Primary** | Inter-Annotator Agreement | Cohen's kappa between different human reviewers | > 0.80 | Kappa statistic on overlapping reviews |
| **Primary** | Ground Truth Propagation | % of confirmed outcomes fed back to eval service | > 90% | Evals with non-null `ground_truth` / total evals with available labels |
| **Primary** | Feedback Loop Latency | Time from confirmed outcome to pattern memory update | < 1h | Label confirmation → `patternMemory.reinforce()` timestamp diff |
| **Secondary** | Label Distribution Balance | Ratio of fraud vs legitimate labels | Track trend | fraud_labels / legitimate_labels per month |
| **Secondary** | Unresolved Decisions | % of decisions older than 60 days with no confirmed outcome | < 30% | Unlabeled decisions older than 60d / total decisions older than 60d |
| **Secondary** | Self-Correction Rate | % of outcomes where agent confidence was wrong by > 30% | < 15% | `|predicted_confidence - actual_accuracy| > 0.3` / total labeled |

---

## Layer 21: ML Models & Risk Scoring (TensorFlow.js + Pattern Memory)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Model Lift over Rules** | Incremental fraud detection from ML models vs rule-only baseline | > 20% lift in recall | `(ml_recall - rules_only_recall) / rules_only_recall` on holdout set |
| **Counter** | Model Latency (p95) | Inference time for risk scoring | < 100ms | TensorFlow.js predict() timing |
| **Primary** | Model AUC-ROC | Area under ROC curve for fraud classification | > 0.90 | Sklearn/TF metrics on labeled test set |
| **Primary** | Model AUC-PR | Area under Precision-Recall curve (better for imbalanced fraud data) | > 0.70 | Precision-Recall curve on labeled test set |
| **Primary** | Risk Score Discrimination | KS statistic — separation between fraud and legitimate score distributions | > 0.40 | Kolmogorov-Smirnov test on risk scores |
| **Primary** | Feature Importance Stability | Top-10 features remain consistent across retraining windows | > 80% overlap | Jaccard similarity of top-10 feature sets between model versions |
| **Secondary** | Prediction Confidence Distribution | Spread of model confidence scores (avoid clustering at extremes) | Bimodal with clear separation | Histogram of confidence scores |
| **Secondary** | Model Staleness | Time since last model retrain or pattern memory refresh | < 7 days for patterns, < 30 days for model | `(now - last_retrain_timestamp)` |
| **Secondary** | Pattern Reinforcement Rate | % of patterns reinforced (confirmed) vs created | > 40% | `reinforcements / totalValidations` in pattern-memory |
| **Secondary** | Pattern Decay Rate | % of patterns with declining confidence over time | Track trend | Patterns with decreasing confidence / total active patterns |
| **Secondary** | Adversarial Robustness | Model accuracy under perturbed inputs | < 5% accuracy drop | Accuracy on adversarial test set vs clean test set |
| **Secondary** | Model Size / Memory Footprint | RAM consumed by loaded models | < 200MB | Process memory with model loaded |

---

## Layer 22: Decisioning Engine (Policy + Threshold + Confidence)

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Automated Decision Rate** | % of decisions made autonomously without human escalation | > 85% | (APPROVE + REJECT) / total decisions (excludes REVIEW) |
| **Counter** | High-Confidence Error Rate | % of high-confidence (>0.85) decisions that were wrong | < 2% | Wrong high-confidence decisions / total high-confidence decisions |
| **Primary** | Decision Consistency | % of identical inputs producing identical decisions within 24h | > 95% | Same-input pair agreement rate |
| **Primary** | Threshold Effectiveness | % of threshold-driven decisions that align with confirmed outcomes | > 85% | Threshold decisions matching labels / total threshold decisions |
| **Primary** | Policy Violation Rate | % of proposed decisions that violate hard policies | < 10% | Policy violations / total proposals |
| **Primary** | Confidence-Accuracy Alignment | Correlation between decision confidence and actual correctness | r > 0.70 | Pearson correlation of confidence vs binary correctness |
| **Primary** | Decision Boundary Precision | Accuracy within ±5 points of APPROVE/REJECT threshold | > 80% | Correct decisions for riskScore in [threshold-5, threshold+5] |
| **Secondary** | Threshold Adaptation Rate | How often adaptive thresholds adjust per week | 1-5 adjustments/week | Threshold changes logged by `threshold-manager.js` |
| **Secondary** | Policy Rule Coverage | % of input scenarios covered by at least one policy rule | > 95% | Inputs triggering ≥1 policy check / total inputs |
| **Secondary** | Decision Reversal Rate | % of decisions reversed within 24h due to new evidence | < 5% | Reversed decisions / total decisions |
| **Secondary** | Edge Case Rate | % of decisions where risk score is within 5 points of any threshold | < 15% | Scores in threshold boundary zone / total |
| **Secondary** | Explanation Completeness | % of decisions with ≥3 cited evidence factors | > 90% | Decisions with 3+ risk factors / total decisions |
| **Secondary** | Multi-Signal Agreement | % of decisions where ≥3 tools agree on risk direction | > 70% | Decisions with tool consensus / total decisions |

---

## Layer 23: Experimentation & Simulation

| | Metric | Definition | Target | How to Measure |
|---|---|---|---|---|
| **North Star** | **Experiment Velocity** | Number of completed A/B tests or simulation runs per month | > 4/month | Completed experiments logged in BrainTrust / calendar month |
| **Counter** | Experiment Contamination Rate | % of experiments with control/treatment leakage | 0% | Sellers exposed to both variants / total experiment participants |
| **Primary** | Simulation Accuracy | Correlation between simulated outcomes and actual outcomes | r > 0.75 | `outcome-simulator.js` predictions vs confirmed outcomes |
| **Primary** | Outcome Simulation Coverage | % of decisions with a scheduled simulated outcome | > 80% | Decisions with scheduled simulation / total decisions |
| **Primary** | A/B Test Statistical Power | % of experiments reaching statistical significance (p < 0.05) | > 70% | Significant experiments / total completed experiments |
| **Primary** | Experiment Lead Time | Time from hypothesis to experiment launch | < 5 days | Timestamp diff: experiment created → first participant |
| **Secondary** | Simulation Feedback Loop Latency | Time from simulation result to pattern memory update | < 2h | Simulation complete → `self-correction.js` update |
| **Secondary** | Shadow Mode Comparison Rate | % of decisions with shadow model comparison (candidate vs production) | > 10% | Shadow evaluations / total decisions |
| **Secondary** | Prompt Variant Test Rate | % of prompt templates with active A/B variants | > 1 active at any time | Active prompt experiments in `prompt-registry` |
| **Secondary** | Rollback Rate | % of experiments rolled back due to regression | < 20% | Rolled-back experiments / total launched |
| **Secondary** | Counterfactual Analysis Rate | % of REJECT decisions with "what-if APPROVE" simulation | > 30% | Counterfactual runs / total REJECT decisions |
| **Secondary** | Confidence Interval Width | Avg 95% CI width on experiment effect sizes | < 10% of baseline metric | CI width from experiment analysis |

---

## North Star & Counter Metrics Summary

| # | Layer | North Star | Target | Counter Metric | Target | Tension |
|---|---|---|---|---|---|---|
| 1 | **Business** | Fraud Detection F1 | > 0.92 | False Positive Rate | < 5% | Catching more fraud shouldn't block legitimate sellers |
| 2 | **Agent Reasoning** | Decision Quality Score | > 0.85 | Agent Latency p95 | < 45s | Better reasoning shouldn't mean slower decisions |
| 3 | **LLM** | Value Efficiency (lift/$) | > 15%/$0.01 | LLM Dependency Rate | < 5% | LLM value shouldn't create a hard dependency |
| 4 | **RAG/Vector** | Retrieval Precision@5 | > 0.80 | Retrieval Latency p95 | < 500ms | Better retrieval shouldn't slow the pipeline |
| 5 | **Memory** | Memory Utilization Rate | > 30% | Memory Staleness | < 7d avg | Using memory shouldn't mean using stale memory |
| 6 | **Temporal** | Temporal Insight Rate | > 20% | Session Bloat | < 200 msgs | Tracking history shouldn't create unbounded growth |
| 7 | **Graph** | Fraud Ring Detection | > 0/week | Query Latency p95 | < 2s | Deep graph traversals shouldn't slow decisions |
| 8 | **Cache** | Cost Savings Rate | > 20% of LLM spend | Cache Pollution | < 40% | Caching shouldn't waste memory on useless entries |
| 9 | **Observability** | Trace Completeness | > 98% | Observability Overhead | < 50ms | Full visibility shouldn't slow the system |
| 10 | **Evaluation** | Eval Coverage | > 20% | Eval Latency | < 15s | Evaluating more shouldn't bottleneck the service |
| 11 | **Database** | Query Reliability | > 99.9% | Query Latency p95 | < 100ms | Reliability shouldn't come from slow retries |
| 12 | **API Gateway** | Availability | > 99.9% | API Latency p95 | < 5s | Staying up shouldn't mean being slow |
| 13 | **Frontend** | Task Completion Rate | > 95% | UI Error Rate | < 0.1/session | Showing results shouldn't crash the UI |
| 14 | **Infrastructure** | Service Health Rate | 100% | Resource Saturation | 0 | All services healthy shouldn't require maxed-out resources |
| 15 | **Data Quality** | Data Completeness Rate | > 95% | Collection Overhead | < 200ms | Thorough validation shouldn't slow ingestion |
| 16 | **Data Pipeline** | Pipeline Throughput | No degradation | Pipeline Failure Rate | < 1% | High throughput shouldn't sacrifice reliability |
| 17 | **Data Consistency** | Cross-Store Agreement | 100% | Reconciliation Latency | < 5 min | Perfect consistency shouldn't require expensive constant checks |
| 18 | **Data Drift** | Feature Distribution Stability | PSI < 0.2 | Alert Fatigue Rate | < 30% | Catching drift shouldn't generate noise |
| 19 | **Data Governance** | Decision Traceability | 100% | Governance Overhead | < 100ms | Full auditability shouldn't slow decisions |
| 20 | **Ground Truth** | Label Coverage | > 50% | Label Latency | < 30 days | More labels shouldn't mean waiting forever for outcomes |
| 21 | **ML Models** | Model Lift over Rules | > 20% recall lift | Model Latency p95 | < 100ms | Better models shouldn't slow inference |
| 22 | **Decisioning Engine** | Automated Decision Rate | > 85% | High-Confidence Error Rate | < 2% | Automating more shouldn't mean more high-confidence mistakes |
| 23 | **Experimentation** | Experiment Velocity | > 4/month | Contamination Rate | 0% | Running more experiments shouldn't compromise their validity |

---

## Metric Collection Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        COLLECTION POINTS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Frontend          API Gateway         Agent Framework              │
│  ┌──────────┐      ┌──────────┐       ┌──────────────┐             │
│  │ Web Vitals│      │ Express  │       │ metrics-     │             │
│  │ Error     │      │ middleware│       │ collector.js │             │
│  │ Boundary  │      │ ws.clients│       │ trace-       │             │
│  └────┬─────┘      └────┬─────┘       │ collector.js │             │
│       │                  │             │ eval-        │             │
│       │                  │             │ tracker.js   │             │
│       │                  │             └──────┬───────┘             │
│       │                  │                    │                     │
│       ▼                  ▼                    ▼                     │
│  ┌──────────────────────────────────────────────┐                  │
│  │              Langfuse (Primary Sink)          │                  │
│  │  Traces, Spans, Generations, Scores, Cost     │                  │
│  │  localhost:3100                                │                  │
│  └──────────────────────────────────────────────┘                  │
│       │                                                            │
│       ▼                                                            │
│  ┌──────────────────────────────────────────────┐                  │
│  │         Phoenix / Arize (Secondary Sink)      │                  │
│  │  OTLP traces, time-series visualization       │                  │
│  │  localhost:6006                                │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                     │
│  External Services        Eval Service           Infrastructure    │
│  ┌──────────┐            ┌──────────────┐       ┌──────────┐      │
│  │ Redis    │            │ TruLens      │       │ docker   │      │
│  │  INFO    │            │ RAGAS        │       │  stats   │      │
│  │ Neo4j   │            │ DeepEval     │       │ docker   │      │
│  │  status  │            │ BrainTrust   │       │  inspect │      │
│  │ Qdrant  │            │ eval_scores  │       │ df -h    │      │
│  │  /healthz│            │ SQLite table │       └──────────┘      │
│  └──────────┘            └──────────────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Alert Thresholds

| Severity | Condition | Action |
|---|---|---|
| **P0 — Critical** | Service Health < 100% (any container down) | Page on-call, auto-restart |
| **P0 — Critical** | API Availability < 99% over 5 min | Page on-call |
| **P0 — Critical** | Fraud Escape Rate > 5% over 24h | Page fraud ops + engineering |
| **P1 — High** | Decision Quality Score < 0.70 over 1h | Alert engineering Slack |
| **P1 — High** | LLM Error Rate > 10% over 10 min | Alert engineering, check provider status |
| **P1 — High** | Agent Latency p95 > 60s over 15 min | Alert engineering |
| **P1 — High** | False Positive Rate > 10% over 24h | Alert fraud ops |
| **P2 — Medium** | Cache Hit Rate < 10% over 1h | Alert engineering |
| **P2 — Medium** | Eval Regression detected | Alert ML team |
| **P2 — Medium** | Redis Memory > 80% | Alert infrastructure |
| **P2 — Medium** | Postgres Connection Pool > 80% | Alert infrastructure |
| **P1 — High** | Cross-Store Agreement < 95% over 1h | Alert data engineering |
| **P1 — High** | Model AUC-ROC < 0.80 on validation set | Alert ML team |
| **P1 — High** | Feature Distribution PSI > 0.25 | Alert ML + data team |
| **P1 — High** | Automated Decision Rate < 70% over 24h | Alert fraud ops |
| **P2 — Medium** | Pipeline Failure Rate > 2% over 1h | Alert data engineering |
| **P2 — Medium** | Label Coverage < 30% over 30d | Alert ML team (weekly) |
| **P2 — Medium** | High-Confidence Error Rate > 5% over 7d | Alert fraud ops + ML |
| **P2 — Medium** | Confidence Calibration Error > 0.15 | Alert ML team |
| **P3 — Low** | Container Restart Count > 0 | Log for review |
| **P3 — Low** | Disk Usage > 70% | Alert infrastructure (weekly digest) |
| **P3 — Low** | Stale Document Rate > 50% | Log for review |
| **P3 — Low** | Experiment Velocity < 2/month | Flag in monthly review |
| **P3 — Low** | Pattern Reinforcement Rate < 20% | Flag in weekly ML review |

---

## Total Metric Count

| Category | Layers | Metrics |
|---|---|---|
| Product & Agent | 1-2 | 20 |
| AI/ML Services | 3-4, 10, 21 | 40 |
| Data Stores | 5-8, 11 | 39 |
| Observability & Eval | 9-10 | 16 |
| Platform Services | 12-14 | 24 |
| Data Platform | 15-20 | 57 |
| Decisioning & Experimentation | 22-23 | 24 |
| **Total** | **23 layers** | **~220 metrics** |

---

*Last updated: 2026-03-09*
