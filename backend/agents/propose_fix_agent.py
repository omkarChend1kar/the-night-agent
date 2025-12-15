
import os
import json
import logging
import sys
import requests
from bedrock_agent import BedrockAgent

class ProposeFixAgent(BedrockAgent):
    """
    Agent that proposes code fixes using Bedrock LLM.
    Takes an anomaly with root cause analysis and generates a unified diff patch.
    """
    
    def __init__(self):
        super().__init__(model_name="mistral_large_3")
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")
        self.repo_path = os.getenv("REPO_PATH", "/Users/apple/Development/projects/the-night-agent")

    def run(self, anomaly_id):
        """
        Main entry point.
        1. Fetch anomaly with analysis from backend
        2. Read relevant source files
        3. Generate fix using LLM
        4. Submit proposal to backend
        """
        self.logger.info(f"Fetching anomaly {anomaly_id}...")
        
        try:
            res = requests.get(f"{self.api_url}/anomalies/{anomaly_id}", timeout=10)
            if not res.ok:
                self.logger.error(f"Failed to fetch anomaly: {res.status_code}")
                return
            
            anomaly = res.json()
            analysis = anomaly.get('root_cause_analysis')
            
            if not analysis:
                self.logger.error("No Root Cause Analysis found in anomaly context.")
                return
                
        except Exception as e:
            self.logger.error(f"Failed to fetch/parse anomaly: {e}")
            return

        root_cause = analysis.get("root_cause", "Unknown issue")
        suggested_fix = analysis.get("suggested_fix", "")
        files = analysis.get("relevant_files", [])
        
        self.logger.info(f"Proposing fix for: {root_cause[:50]}...")
        
        # Read source file contents for context
        file_contents = self._read_source_files(files)
        
        # Generate fix using LLM
        patch = self._generate_fix(root_cause, suggested_fix, files, file_contents, anomaly)
        
        if patch:
            self.submit_proposal(anomaly_id, analysis, patch)
        else:
            self.logger.error("Failed to generate patch")

    def _read_source_files(self, files: list) -> dict:
        """Read contents of relevant source files."""
        contents = {}
        for file_path in files[:5]:  # Limit to 5 files to avoid token limits
            full_path = os.path.join(self.repo_path, file_path)
            try:
                if os.path.exists(full_path):
                    with open(full_path, 'r') as f:
                        contents[file_path] = f.read()
                    self.logger.info(f"Read file: {file_path}")
            except Exception as e:
                self.logger.warning(f"Could not read {file_path}: {e}")
        return contents

    def _generate_fix(self, root_cause: str, suggested_fix: str, files: list, file_contents: dict, anomaly: dict) -> str:
        """Generate a unified diff patch using Bedrock LLM."""
        
        # Build file context
        file_context = ""
        for path, content in file_contents.items():
            # Truncate large files
            truncated = content[:3000] + "\n... (truncated)" if len(content) > 3000 else content
            file_context += f"\n--- {path} ---\n{truncated}\n"
        
        prompt = f"""You are a Senior Software Engineer fixing a production issue.

ROOT CAUSE:
{root_cause}

SUGGESTED FIX:
{suggested_fix}

RELEVANT FILES: {', '.join(files)}

SOURCE CODE:
{file_context if file_context else "No source files available - infer from context"}

ANOMALY CONTEXT:
{json.dumps(anomaly.get('context', {}), indent=2)[:1000]}

TASK:
Generate a UNIFIED DIFF PATCH that fixes this issue.

RULES:
1. Output ONLY the patch content, starting with "diff --git"
2. Use standard unified diff format
3. Include proper file paths (a/path and b/path)
4. Be minimal - only change what's necessary
5. Do NOT wrap in markdown code blocks

EXAMPLE FORMAT:
diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -10,6 +10,7 @@ function processRequest(req) {{
   const data = req.body;
+  if (!data) throw new Error('Invalid request body');
   return handler(data);
 }}
"""
        
        response = self.invoke(prompt, system_prompt="You are an expert software engineer. Output only valid unified diff patches.")
        
        if not response:
            return None
        
        # Clean up response
        patch = response.strip()
        
        # Remove markdown code blocks if present
        if "```diff" in patch:
            patch = patch.split("```diff")[1].split("```")[0].strip()
        elif "```" in patch:
            patch = patch.split("```")[1].split("```")[0].strip()
        
        # Validate it looks like a diff
        if not patch.startswith("diff --git") and not patch.startswith("---"):
            self.logger.warning("Generated patch doesn't look like a valid diff")
            # Try to extract diff portion anyway
            if "diff --git" in patch:
                patch = patch[patch.find("diff --git"):]
        
        print(f"PATCH_OUTPUT:{patch[:200]}...")  # Log first 200 chars for debugging
        return patch

    def submit_proposal(self, anomaly_id: str, analysis: dict, patch: str):
        """Submit the fix proposal to the backend."""
        try:
            res = requests.post(
                f"{self.api_url}/anomalies/proposal",
                json={
                    'id': anomaly_id,
                    'analysis': json.dumps(analysis),
                    'patch': patch,
                    'status': 'PROPOSAL_READY'
                },
                timeout=10
            )
            if res.ok:
                self.logger.info("Proposal submitted successfully.")
            else:
                self.logger.error(f"Failed to submit proposal: {res.text}")
        except Exception as e:
            self.logger.error(f"Failed to submit proposal: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        anomaly_id = sys.argv[1]
        ProposeFixAgent().run(anomaly_id)
    else:
        print("Usage: python propose_fix_agent.py <anomaly_id>")
