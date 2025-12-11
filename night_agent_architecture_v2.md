# The Night Agent — Full System Architecture (Clean Code, Multi‑Agent, Cline/Kestra Integrated, Provider‑Agnostic)

This document represents the **complete, faithful, high‑fidelity architecture** of *The Night Agent* exactly as discussed in the conversation.  
It includes:

- All **three agents** and their responsibilities  
- Full **frontend + backend** architecture  
- **Cline** and **Kestra** integration through *pluggable abstractions*  
- A **provider‑agnostic Git strategy** that avoids GitHub/GitLab APIs  
- A **sidecar setup** that is safe, installable, and minimally invasive  
- The entire **onboarding flow**  
- A full **Clean Code / SOLID-compliant modular structure**  

---

# 1. Vision

**The Night Agent** is an autonomous engineering assistant that silently monitors production, detects failures, analyzes codebases, proposes fixes, prepares changes, and—after human approval—merges a sandbox branch into master using native Git operations.

It works **universally** with:

- any Git provider  
- any CI/CD pipeline  
- any cloud/on‑prem infrastructure  
- any runtime environment  

Its power comes from a **three‑agent system**, **Cline (AI code executor)**, and **Kestra (workflow engine)**—all orchestrated through clean interfaces.

---

# 2. Core Design Principle

We apply **Uncle Bob’s Clean Code & SOLID principles**:

- Single Responsibility → Each agent has exactly ONE purpose  
- Open/Closed → Engines (Cline, Kestra) are replaceable  
- Liskov → All Git, workflow, and code executors conform to interfaces  
- Interface Segregation → Each module has minimal, focused contracts  
- Dependency Inversion → Backend depends on abstractions, not solutions  

---

# 3. The Three-Agent System (Final Model)

## **Agent 1 — Log Watcher + Anomaly Detector (Sidecar, Client‑side)**  
**Purpose:** Observe the system. Nothing else.

### Responsibilities
- Tail logs from file/stdout/syslog/OTEL  
- Detect anomalies (error spikes, repeating crashes, latency anomalies)  
- Detect precursor patterns (predictive failure hints)  
- Send anomaly payloads to backend  
- Heartbeat to verify liveness  

### Deployment
- Runs next to client’s app as:
  - Docker container **or**
  - Compiled binary  
- Configured by `/sidecar-config.yaml` auto‑generated during onboarding

### Security
- **No repo access**  
- **No code access**  
- Uses **short-lived onboarding token** only  

---

## **Agent 2 — Code Analysis + Fix Proposal Agent (Backend)**  
**Purpose:** Think about the failure.

### Responsibilities
- Clone repository using **read-only Git credential**  
- Inspect code related to anomaly (error traces, stack matches, heuristic mapping)  
- Use **Cline (or any executor)** to analyze and propose code-level fixes  
- Produce:
  - Problem rationale  
  - Unified diff patch  
  - Suggested branch name  
  - Confidence score  
  - Optional tests to update  

This agent never writes to the repo.

### Deployment
- In your backend workers (containerized)  
- Invokes:
  - `GitManager` (read-only credential)
  - `CodeExecutor` (default: Cline)  

---

## **Agent 3 — Code Modification + Merge Agent (Backend)**  
**Purpose:** Fix the failure, but only after approval.

### Responsibilities
- Wait for engineer approval from frontend  
- Clone repo using **write credential**  
- Create sandbox branch  
- Apply patch using `CodeExecutor.applyFix()`  
- Commit & push sandbox branch  
- Merge sandbox branch → master using **native Git**, NOT provider APIs  
- Delete sandbox branch (optional)  
- Trigger CI/CD automatically (merge event)  

### Deployment
- Backend worker  
- Only uses write credential with minimal Git permissions

---

# 4. Why This Architecture Is Universal

Because:

- Git operations are **native**, not tied to GitHub/GitLab APIs  
- Cline is optional; any code executor can be plugged in  
- Kestra is optional; any workflow engine can be plugged in  
- CI/CD is untouched; all pipelines trigger naturally on merge  
- Sidecar reads logs locally; no provider constraints  

---

# 5. Pluggable Integration Layer

## **5.1 Workflow Engine Interface**

```ts
interface WorkflowEngine {
  startFixWorkflow(anomalyId: string): Promise<string>;
  getStatus(workflowExecutionId: string): Promise<WorkflowStatus>;
}
```

### Default Implementation: **Kestra**
- Uses Kestra API to trigger & orchestrate workflows  
- Can be replaced by:
  - Temporal
  - Airflow  
  - Custom event bus  

---

## **5.2 Code Executor Interface**

```ts
interface CodeExecutor {
  analyzeAndPropose(repoPath: string, anomaly: Anomaly): Promise<FixProposal>;
  applyFix(repoPath: string, fix: FixProposal): Promise<ApplyResult>;
}
```

### Default Implementation: **Cline**
- Runs inside isolated sandbox folder  
- Opens repo, analyzes, writes diffs  
- Replaceable with:
  - LLM-based patch generators  
  - Static analysis engines  

---

## **5.3 Git Manager Interface (Provider-Agnostic)**

```ts
interface GitManager {
  cloneRepo(url: string, credsId: string, dest: string): Promise<void>;
  createBranch(repoPath: string, branch: string): Promise<void>;
  applyPatch(repoPath: string, patch: string): Promise<void>;
  commitAndPush(repoPath: string, branch: string, message: string): Promise<void>;
  mergeBranch(repoPath: string, fromBranch: string, toBranch: string): Promise<void>;
}
```

### Implementation uses:
- `git clone`
- `git checkout -b`
- `git apply`
- `git commit`
- `git push`
- `git merge`

This works on:
- GitHub  
- GitLab  
- Bitbucket  
- Bare Git servers  
- Self‑hosted enterprise VMs  

---

# 6. Backend Control Plane (Your Infrastructure)

### Responsibilities
- Store anomalies, fixes, approvals  
- Issue onboarding tokens  
- Manage client credentials securely  
- Trigger workflows  
- Expose API for frontend  
- Package sidecar ZIP bundle  

### Backend API Endpoints

#### **Sidecar**
- `POST /api/sidecar/register`
- `POST /api/sidecar/anomaly`
- `POST /api/sidecar/heartbeat`

#### **Frontend**
- `POST /api/onboard`
- `GET /api/anomalies?serviceId=...`
- `GET /api/fix/:id`
- `POST /api/fix/:id/approve` (MFA required)
- `POST /api/fix/:id/reject`

---

# 7. Frontend Dashboard (React, Modern, Clean)

Using **React + Next.js + Tailwind**.

### Must Include:
- Responsive layout  
- Dark/Light mode  
- MFA-enabled login  
- Onboarding wizard:  
  - repo URL  
  - protocol (SSH/HTTPS)  
  - credential upload (read-only + write)  
  - branch selection  
- Alerts/Anomalies panel  
- Fix viewer  
- Diff viewer with syntax highlighting  
- "Approve Merge" button  
- Service overview dashboard  
- Activity/Audit logs  

Design philosophy:
- Minimal  
- Functional  
- Clear and readable  
- Principle of least astonishment (Uncle Bob style)

---

# 8. Sidecar Packaging & Setup

Backend generates a downloadable ZIP containing:

```
sidecar/
  nightagent-sidecar (binary)
  config.yaml
  install.sh
  README.md
```

### `config.yaml` contains:
```yaml
backend_url: https://api.nightagent.com
service_id: svc-123
onboarding_token: <signed-token>
log_paths:
  - /var/log/app.log
```

Sidecar registers → begins log ingestion.

---

# 9. End-to-End Workflow

```
Agent 1 detects anomaly
 → Backend receives anomaly
 → Backend triggers WorkflowEngine (Kestra)
 → Kestra calls CodeExecutor (Cline)
 → Cline produces FixProposal
 → Engineer reviews in frontend
 → Engineer Approves (MFA)
 → Backend tells Agent 3 to apply fix
 → GitManager executes: clone → branch → patch → commit → merge
 → CI/CD pipeline deploys
 → Backend monitors post-deploy signals
```

---

# 10. Data Models (Simplified)

### **Anomaly**
```json
{
  "id": "uuid",
  "serviceId": "string",
  "timestamp": "ISO8601",
  "severity": "critical",
  "message": "Timeout on upstream call",
  "logs": ["..."],
  "traceId": "abc-123",
  "confidence": 0.91
}
```

### **Fix Proposal**
```json
{
  "id": "uuid",
  "anomalyId": "uuid",
  "summary": "Retry wrapper logic missing on service X",
  "diff": "--- patch text ---",
  "branch": "nightagent/fix-123",
  "confidence": 0.87,
  "status": "pending"
}
```

---

# 11. Folder Structure Scaffold

```
/nightagent
  /backend
    /api
    /services
    /integrations
      /git
      /workflow
      /codeExecutor
    /workers
    /db
  /frontend
    /components
    /pages
    /hooks
    /state
  /sidecar
    /src
    Dockerfile
    config.yaml
```

---

# 12. MVP Scope (Hackathon)

Must deliver:
- Sidecar logs → anomaly → backend  
- Backend → fix proposal (mock or Cline)  
- Frontend → review + approve  
- Backend → git branch → patch → merge  
- CI/CD triggers

---

# 13. Clean Code Values Applied

- Functions small and readable  
- Sidecar isolated from code operations  
- Agents have one reason to change  
- Interfaces prevent brittle coupling  
- External tools (Cline, Kestra) are replaceable  

---

# 14. Conclusion

This architecture is robust, scalable, portable across infrastructures, and clean by design—fully aligned with everything discussed.

