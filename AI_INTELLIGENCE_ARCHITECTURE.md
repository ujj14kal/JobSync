# JobSync — AI Intelligence Layer Architecture
## Complete System Design for Proprietary AI Infrastructure

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     JOBSYNC INTELLIGENCE PLATFORM                    │
├────────────────┬────────────────┬───────────────┬───────────────────┤
│  INGESTION     │  INTELLIGENCE  │  PREDICTION   │  LEARNING         │
│  LAYER         │  LAYER         │  LAYER        │  LOOP             │
├────────────────┼────────────────┼───────────────┼───────────────────┤
│ • PDF/DOCX     │ • Multi-layer  │ • Recruiter   │ • Outcome         │
│   parsing      │   embedding    │   fit model   │   tracking        │
│ • Section      │ • Skill graph  │ • Interview   │ • Weight          │
│   chunking     │   traversal    │   probability │   adjustment      │
│ • Structured   │ • Hybrid       │ • Company-fit │ • Cohort          │
│   extraction   │   search       │   prediction  │   benchmarking    │
│ • Entity NER   │ • Transferable │ • Role compat │ • Keyword         │
│                │   skills       │               │   performance     │
└────────────────┴────────────────┴───────────────┴───────────────────┘
         ↓                ↓               ↓                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    VECTOR INTELLIGENCE LAYER                          │
│  pgvector (384-dim)  ·  Hybrid BM25+Vector  ·  HNSW Index           │
│  resume_chunks  ·  job_chunks  ·  skill_vectors  ·  mentor_vecs      │
└─────────────────────────────────────────────────────────────────────┘
         ↓                ↓               ↓                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     FEEDBACK & MOAT LAYER                             │
│  application_events  ·  outcome_labels  ·  edit_deltas              │
│  keyword_performance  ·  recruiter_signals  ·  cohort_benchmarks    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. SEMANTIC MATCHING ENGINE

### Embedding Architecture

```
RESUME DOCUMENT
      │
      ▼
┌─────────────────────────────────────────────────────┐
│                  SECTION CHUNKER                     │
├──────────────┬──────────────┬───────────┬───────────┤
│   summary    │    skills    │ experience│  projects │
│  chunk (1)   │  chunk (1)   │ chunks(N) │ chunks(M) │
│  weight:0.05 │  weight:0.30 │ weight:0.40│ weight:0.15│
└──────┬───────┴──────┬───────┴─────┬─────┴─────┬─────┘
       │              │             │           │
       ▼              ▼             ▼           ▼
  embed(384)     embed(384)    embed(384)  embed(384)
       │              │             │           │
       └──────────────┴─────────────┴───────────┘
                            │
                    COMPOSITE RESUME VECTOR
                    (weighted mean pooling)

JOB DESCRIPTION
      │
      ▼
┌─────────────────────────────────────────────────────┐
│                  SECTION CHUNKER                     │
├──────────────┬──────────────┬───────────┬───────────┤
│    core_req  │responsibilities│preferred │  culture  │
│  weight:0.50 │  weight:0.30  │ weight:0.15│weight:0.05│
└──────────────┴──────────────┴───────────┴───────────┘
```

### Cross-Section Match Matrix

```
RESUME CHUNKS (rows) × JOB CHUNKS (cols)

              │ core_req │ respons. │ preferred │ culture │
──────────────┼──────────┼──────────┼───────────┼─────────┤
skills        │   0.35   │   0.10   │   0.10    │  0.00   │
experience    │   0.15   │   0.30   │   0.05    │  0.00   │
projects      │   0.15   │   0.05   │   0.05    │  0.00   │
summary       │   0.05   │   0.05   │   0.05    │  0.05   │
education     │   0.05   │   0.00   │   0.00    │  0.00   │

FINAL_SEMANTIC = Σ weight[i][j] × cosine_sim(resume_i, job_j)
```

### Transferable Skills Graph Traversal

```
CANDIDATE: has "React"
JOB REQUIRES: "Vue.js"

SKILL GRAPH LOOKUP:
  React ──IS_SIMILAR_TO(0.85)──▶ Vue.js
  
TRANSFER_SCORE = 1.0 - (1.0 - 0.85) × gap_penalty
              = 1.0 - 0.15 × 1.2
              = 0.82 (not zero — partial credit!)

vs. traditional keyword: React ≠ Vue.js → score = 0
```

---

## 2. PROPRIETARY ATS SCORING FORMULA

```
ATS_FINAL = Σ dimension_weight × dimension_score

DIMENSIONS:
  keyword_alignment      × 0.25   (TF-IDF weighted keyword overlap)
  semantic_coherence     × 0.20   (embedding cross-match score)
  impact_metrics         × 0.18   (% bullets with quantification)
  technical_depth        × 0.15   (skill density × skill level signals)
  formatting_quality     × 0.10   (ATS parse-ability heuristics)
  experience_relevance   × 0.07   (recency × role similarity)
  leadership_indicators  × 0.05   (promotion, team size, ownership signals)

CONFIDENCE_SCORE = min(1.0, data_completeness × signal_strength)

RECRUITER_LIKELIHOOD = sigmoid(ATS_FINAL × 0.06 - 3.0)
  → maps [0,100] → [~5%, ~95%] probability
```

---

## 3. RECRUITER-FIT PREDICTION ENGINE

### Feature Vector (cold-start → ML evolution)

```python
features = {
  # Structural (from parsing)
  "years_of_experience":        float,   # estimated from dates
  "education_tier":             0-3,     # none, associate, bachelor, masters+
  "career_progression":         -1..+1,  # ascending/flat/descending titles
  "company_tier_avg":           0-3,     # startup/mid/known/faang
  "has_relevant_projects":      0/1,
  "certification_count":        int,
  
  # Quality signals  
  "metric_density":             float,   # % bullets with numbers
  "verb_strength_score":        float,   # avg verb impact score
  "skill_overlap_ratio":        float,   # matched/required
  "keyword_coverage":           float,   # % job keywords present
  
  # Semantic signals
  "semantic_similarity":        float,   # embedding cosine sim
  "skill_embedding_distance":   float,   # euclidean dist in skill space
  "experience_semantic_fit":    float,   # experience vs responsibilities match
  
  # Behavioral (learned over time)
  "similar_profile_success_rate": float, # k-NN success rate
  "keyword_percentile":           float, # where does this profile rank
}

Phase 1 (cold-start):
  score = dot(features, hand_tuned_weights)
  p_interview = sigmoid(score - threshold)

Phase 2 (100+ outcomes):
  model = LogisticRegression().fit(feature_matrix, outcomes)
  p_interview = model.predict_proba(features)

Phase 3 (1000+ outcomes):
  model = XGBClassifier(n_estimators=100, max_depth=4)
  p_interview = model.predict_proba(features)
```

---

## 4. SKILL GAP INTELLIGENCE

### Skill Ontology (Proprietary Graph)

```
GRAPH STRUCTURE:
  Nodes: 300+ skills
  Edges: (skill_a → skill_b, relationship, weight)

RELATIONSHIPS:
  IS_PREREQUISITE_OF:  Python → Pandas (0.9)
  IS_SIMILAR_TO:       React → Vue.js (0.85), PyTorch → TensorFlow (0.80)
  COMPLEMENTS:         React + Node.js (0.75)
  ENABLES_ROLE:        Python → "Data Scientist" (0.95)
  TAUGHT_BY:           Python → "Python for Everybody / Coursera" 

GAP PRIORITY FORMULA:
  priority[skill] = gap_score × importance_weight × recency_factor
  
  gap_score:       0=have it, 0.5=have similar, 1.0=missing entirely
  importance:      job_listing frequency × salary_impact_coefficient
  recency_factor:  is this skill trending up or down in job market?
```

### Learning Roadmap Generation

```
INPUT: missing skills = ["Kubernetes", "Terraform", "AWS EKS"]

STEP 1: Build prerequisite chain
  Kubernetes requires: Docker, Linux, YAML, Networking
  Terraform requires: HCL, Cloud basics
  AWS EKS requires: Kubernetes, AWS

STEP 2: Find gaps in prerequisites
  Candidate has: Docker ✓, Linux ✓
  Missing prereqs: YAML (2 hrs), HCL (4 hrs)

STEP 3: Order by dependency + priority
  1. YAML (prereq for both, 2 hrs)
  2. HCL (prereq for Terraform, 4 hrs)  
  3. Terraform (10 hrs)
  4. Kubernetes (20 hrs)
  5. AWS EKS (15 hrs, needs both above)

STEP 4: Attach resources
  Each node → [free_resource, paid_resource, official_docs]

OUTPUT: ordered roadmap with time estimates + resources
```

---

## 5. FEEDBACK LEARNING LOOP

### Data Collection Pipeline

```
USER JOURNEY → EVENT CAPTURE:

Upload Resume         → resume_version_created
Run Analysis          → analysis_created (scores logged)
View Suggestions      → suggestion_viewed
Accept Suggestion     → suggestion_adopted (keyword/edit delta)
Apply to Job          → application_event(APPLIED)
Report Interview      → application_event(INTERVIEWED)  ← GOLD LABEL
Report Rejection      → application_event(REJECTED)     ← GOLD LABEL
Edit Resume           → edit_delta stored (diff)

WHAT WE LEARN:
  • Which keywords correlate with interview conversion
  • Which ATS score thresholds matter per company
  • Which resume edits actually helped vs. hurt
  • Company-specific hiring signal patterns
```

### Weight Adjustment Loop

```
WEEKLY RETRAINING:

1. Pull last 7 days of outcome events
2. Join with analysis scores at time of application
3. Build (features, outcome) pairs
4. Update keyword_performance table with new success rates
5. Recompute per-company ATS weight adjustments
6. A/B test new weights on 10% of users

ONLINE LEARNING (rolling):
  exponential_moving_avg = α × new_observation + (1-α) × historical_avg
  (α = 0.1 → slow, stable; α = 0.3 → fast, responsive)
```

---

## 6. VECTOR DATABASE ARCHITECTURE

### Schema Design

```sql
-- Multi-resolution embedding storage
resume_chunks:       (resume_id, chunk_type, text, embedding[384])
job_chunks:          (job_id, chunk_type, text, embedding[384])

-- Skill intelligence vectors  
skill_embeddings:    (skill_name, category, embedding[384], demand_score)

-- Outcome tracking (the MOAT)
application_events:  (user_id, job_id, resume_id, event_type, timestamp)
keyword_performance: (keyword, role_category, views, interviews, rate, updated_at)
edit_deltas:         (analysis_id, before_text, after_text, adopted_keywords)
cohort_benchmarks:   (role, career_stage, score_percentiles, updated_at)
```

### Hybrid Search Query

```sql
-- Find top jobs for a resume (hybrid BM25 + vector)
SELECT j.*, 
    (0.65 * (1 - (r.embedding <=> j.embedding))) +
    (0.35 * ts_rank(to_tsvector('english', j.raw_text), 
                    plainto_tsquery('english', $skills))) 
    AS hybrid_score
FROM job_descriptions j, resumes r
WHERE r.id = $resume_id
ORDER BY hybrid_score DESC
LIMIT 20;
```

### Index Strategy

```sql
-- HNSW for fast ANN search (better recall than IVFFlat)
CREATE INDEX ON resume_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- Filtered vector search (by role, career stage)
CREATE INDEX ON skill_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON skill_embeddings (category);  -- for filtered search
```

---

## 7. FULL AI PIPELINE FLOW

```
RESUME UPLOAD PIPELINE:
  ┌─────────────────────────────────────────────────────────┐
  │ raw_bytes → extract_text() → parse_resume()            │
  │         → chunk_resume()   → embed_chunks() (async)    │
  │         → store_chunks()   → compute_skill_graph_pos() │
  │         → update_cohort_benchmarks()                   │
  └─────────────────────────────────────────────────────────┘

ANALYSIS PIPELINE (when user submits job):
  ┌─────────────────────────────────────────────────────────┐
  │ job_text → parse_job() → chunk_job() → embed_job()      │
  │                                                          │
  │ PARALLEL:                                                │
  │   branch_1: semantic_matcher.score()                     │
  │   branch_2: ats_engine.compute_all_scores()              │
  │   branch_3: skill_gap_engine.analyze()                   │
  │   branch_4: recruiter_fit.predict()                      │
  │             ↓                                            │
  │   MERGE → aggregate_scores() → generate_ai_feedback()   │
  │         → store_analysis()  → track_event()             │
  └─────────────────────────────────────────────────────────┘
```

---

## 8. AI MOAT STRATEGY

### What Makes JobSync Defensible

```
DATA MOATS (accumulate with every user):
  
  1. RESUME PERFORMANCE DATABASE
     Every application + outcome = labeled training data
     Competitors cannot buy this — it must be earned
     
  2. COMPANY HIRING SIGNALS
     "Google values systems design mentions 3× more than avg"
     "Stripe resumes with 40% metrics ratio → 2× interview rate"
     
  3. SKILL MARKET DYNAMICS
     Real-time from scraped JDs → proprietary demand curves
     Not static like LinkedIn insights — live, specific
     
  4. COHORT BENCHMARKS
     "You're in the top 12% of React engineers applying to Series B startups"
     No competitor has the cross-user comparison data to say this

NETWORK EFFECTS:
  More users → more outcomes → better predictions → more trust → more users
  Each application outcome = $0 additional data cost, massive signal value
  
COMPOUNDING ADVANTAGE:
  Month 1:  Rule-based scoring (same as any tool)
  Month 3:  100 outcomes → logistic regression (modest edge)
  Month 6:  1,000 outcomes → XGBoost (real predictive power)
  Year 1:   10,000 outcomes → deep network effects, unchallengeable
  Year 2:   100,000 outcomes → "Why would anyone use a dumber tool?"
```

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1 — Intelligence Foundation (Weeks 1-3)
**Goal: Proprietary chunked semantic matching live**

```
Week 1:
  ✓ semantic_matcher.py — multi-layer chunked embeddings
  ✓ skill_graph.py — 300-node skill ontology, gap analysis
  ✓ 002_intelligence_layer.sql — new tables (resume_chunks, skill_embeddings, etc.)
  ✓ Upgrade analysis pipeline to use semantic_matcher

Week 2:
  ✓ skill_gap_engine.py — full gap analysis with learning roadmaps
  ✓ recruiter_fit.py — cold-start predictor (rule-based → logistic regression)
  ✓ feedback_loop.py — event tracking, outcome collection

Week 3:
  ✓ intelligence_pipeline.py — master orchestration (parallel scoring)
  ✓ API routes for new endpoints
  ✓ Frontend: show interview probability, skill gap roadmap
```

### Phase 2 — Learning Loop (Weeks 4-6)
**Goal: Data collection pipeline live, benchmark dashboard**

```
  ✓ Application event tracking (user reports outcomes)
  ✓ Keyword performance table + weekly aggregation job
  ✓ Cohort benchmarking ("top X% of candidates")
  ✓ Resume version diffing (track edits)
  ✓ "Skills that worked" insights dashboard
```

### Phase 3 — ML Models (Month 2-3)
**Goal: First trained models replace rule-based scoring**

```
  ✓ Outcome data: target 500+ labeled applications
  ✓ Train LogisticRegression recruiter_fit model
  ✓ A/B framework: test new model vs. rule-based
  ✓ Keyword importance model (from adoption + outcome data)
  ✓ Company-specific ATS weight adjustments
```

### Phase 4 — Intelligence Platform (Month 4-6)
**Goal: Unique data moat, network effects kicking in**

```
  ✓ XGBoost/LightGBM recruiter-fit with 2,000+ labels
  ✓ Company hiring preference profiles
  ✓ Real-time skill demand tracking (from scraped JDs)
  ✓ "Candidates like you" recommendations
  ✓ Predictive resume optimization (show exact edits that historically helped)
  ✓ Recruiter-side product (sell the data intelligence to hiring teams)
```

---

## 10. KEY METRICS TO TRACK

```
INTELLIGENCE QUALITY:
  semantic_score_accuracy    = % users who agree our match score is correct
  interview_prediction_accuracy = predicted vs. actual interview rates
  skill_gap_relevance        = % users who found gap suggestions actionable

MOAT METRICS:
  labeled_outcomes_count     → milestone: 100, 500, 1000, 10000
  keyword_performance_rows   → tracks learning depth
  company_profiles_built     → tracks competitive intelligence

PRODUCT METRICS:
  p_interview improvement    → % increase in interview rate after using JobSync
  resume_version_count       → proxy for engagement depth
  skill_gaps_closed          → skills user acquired from our roadmap
```
