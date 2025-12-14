
import subprocess
import os
import json
import logging
import base64
import requests
from bedrock_agent import BedrockAgent
from workspace_utils import WorkspaceManager

class ProposeFixAgent(BedrockAgent):
    def __init__(self):
        super().__init__(model_name="us.anthropic.claude-3-5-sonnet-20241022-v2:0") # Using Claude 3.5 Sonnet
        self.logger = logging.getLogger("ProposeFixAgent")
        logging.basicConfig(level=logging.INFO)
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")
        # Default Sidecar path override for local dev, else use Workspace Manager
        self.manual_repo_path = os.getenv("REPO_PATH")
        self.workspace_manager = WorkspaceManager()
        self.repo_path = None # Set dynamically in run()

    def run(self, anomaly_id):
        self.logger.info(f"Fetching anomaly {anomaly_id}...")
        try:
            res = requests.get(f"{self.api_url}/anomalies/{anomaly_id}")
            if not res.ok:
                self.logger.error(f"Failed to fetch anomaly: {res.status_code}")
                return
            
            anomaly = res.json()
            
            # Extract Analysis
            analysis = anomaly.get('root_cause_analysis')
            if not analysis:
                context_raw = anomaly.get('context', '{}')
                if isinstance(context_raw, dict):
                    context = context_raw
                else:
                    context = json.loads(context_raw)
                analysis = context.get('root_cause_analysis')
            
            if not analysis:
                self.logger.error("No Root Cause Analysis found.")
                return

            repo_url = anomaly.get('repoUrl')
            ssh_alias = anomaly.get('sshAlias')
            
            # Use SSH Alias for cloning if provided (Multi-Tenant Isolation)
            if ssh_alias and repo_url:
                 import re
                 # Logic: Replace the hostname in the URL with the ssh_alias
                 # Regex matches: (git@|https://)(HOSTNAME)(:|/)
                 # We want to keep group 1 and 3, replace group 2 with ssh_alias
                 
                 # Pattern covers: git@github.com:user/repo and https://github.com/user/repo
                 pattern = r'^(git@|https://)([^/:]+)([:/])'
                 
                 match = re.search(pattern, repo_url)
                 if match:
                     current_host = match.group(2)
                     if current_host != ssh_alias:
                        self.logger.info(f"Injecting SSH Alias: Replaced host '{current_host}' with '{ssh_alias}'")
                        repo_url = re.sub(pattern, f'\\g<1>{ssh_alias}\\g<3>', repo_url, count=1)
            
            # Resolve Repo Path logic:
            if self.manual_repo_path:
                self.repo_path = self.manual_repo_path
                self.logger.info(f"Using manual REPO_PATH override: {self.repo_path}")
            else:
                self.repo_path = self.workspace_manager.get_repo_path(repo_url)
                
            if not self.ensure_repo(repo_url):
                return

            # --- SMART SEARCH & FIX LOOP ---
            
            # 1. Get File Structure
            file_tree = self.get_file_structure()
            
            # 2. Ask Bedrock which files to read
            root_cause = analysis.get("root_cause", "Unknown issue")
            # Prefer files from analysis if available, but verify against tree
            suggested_files = analysis.get("relevant_files", [])
            
            files_to_read = self.identify_files_to_read(root_cause, suggested_files, file_tree)
            self.logger.info(f"Files to read: {files_to_read}")
            
            # 3. Read Files
            file_contents = {}
            for fpath in files_to_read:
                content = self.read_file(fpath)
                if content:
                    file_contents[fpath] = content
            
            if not file_contents:
                self.logger.error("No file contents could be read.")
                return

            # 4. Generate Patch
            patch_content = self.generate_patch(root_cause, file_contents)
            
            if patch_content:
                encoded_patch = base64.b64encode(patch_content.encode('utf-8')).decode('utf-8')
                print(f"PATCH_OUTPUT:{encoded_patch}")
                self.submit_proposal(anomaly_id, analysis, patch_content)
            else:
                 self.logger.error("Failed to generate patch.")


        except Exception as e:
            self.logger.error(f"ProposeFixAgent run failed: {e}")
            import traceback
            traceback.print_exc()

    def ensure_repo(self, repo_url):
        if not self.repo_path:
             self.logger.error("No repo path could be resolved.")
             return False

        if os.path.exists(self.repo_path):
            self.logger.info(f"Repo path {self.repo_path} exists.")
            # In a workspace model, we SHOULD try to pull updates here.
            # But for safety in this demo, we assume existence is enough.
            return True
        
        if not repo_url:
            self.logger.error("Repo path does not exist and no repoUrl provided.")
            return False
            
        self.logger.info(f"Cloning {repo_url} to {self.repo_path}...")
        
        # Ensure parent dirs exist
        parent_dir = os.path.dirname(self.repo_path)
        if not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
            
        try:
            subprocess.run(["git", "clone", repo_url, self.repo_path], check=True)
            return True
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Failed to clone repo: {e}")
            return False

    def get_file_structure(self):
        # Limit depth and exclude .git, node_modules etc
        try:
            cmd = ["find", ".", "-maxdepth", "3", "-not", "-path", "*/.*", "-not", "-path", "*node_modules*", "-not", "-path", "*venv*"]
            result = subprocess.run(cmd, cwd=self.repo_path, capture_output=True, text=True)
            return result.stdout
        except Exception as e:
            self.logger.error(f"Failed to get file structure: {e}")
            return ""

    def read_file(self, relative_path):
        full_path = os.path.join(self.repo_path, relative_path)
        if not os.path.exists(full_path):
            self.logger.warning(f"File not found: {full_path}")
            return None
        try:
            with open(full_path, 'r') as f:
                return f.read()
        except Exception as e:
            self.logger.error(f"Failed to read file {relative_path}: {e}")
            return None

    def identify_files_to_read(self, root_cause, suggested_files, file_tree):
        prompt = f"""
        You are a Senior Software Engineer.
        
        ROOT CAUSE:
        "{root_cause}"
        
        SUGGESTED FILES (from analysis):
        {json.dumps(suggested_files)}
        
        ACTUAL FILE TREE:
        {file_tree}
        
        TASK:
        Identify the EXACT file paths from the file tree that I need to edit to fix the root cause.
        Return a JSON list of strings.
        Example: ["src/services/api.ts", "src/models/user.ts"]
        Only return files that explicitly exist in the tree.
        """
        
        response = self.invoke(prompt)
        try:
             # Basic cleanup
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                 response = response.split("```")[1].split("```")[0].strip()
            return json.loads(response)
        except:
            self.logger.warning("Failed to parse file identification, falling back to suggested.")
            return suggested_files

    def generate_patch(self, root_cause, file_contents):
        # Prepare context
        files_context = ""
        for name, content in file_contents.items():
            files_context += f"\n--- FILE: {name} ---\n{content}\n"
            
        prompt = f"""
        You are a Principal Engineer.
        
        ISSUE:
        "{root_cause}"
        
        CODEBASE CONTEXT:
        {files_context}
        
        TASK:
        Generate a GIT UNIFIED DIFF patch to fix the issue.
        Rules:
        1. Start with 'diff --git ...'
        2. Use relative paths as seen in the headers above.
        3. Do NOT include markdown blocks (```diff). Just the raw patch content.
        4. Validate that context lines match exactly.
        """
        
        response = self.invoke(prompt)
        # Cleanup if model adds markdown
        if "```diff" in response:
            response = response.split("```diff")[1].split("```")[0].strip()
        elif "```" in response:
             response = response.split("```")[1].split("```")[0].strip()
        
        print(f"DEBUG:RAW_PATCH_RESPONSE:\n{response}")
             
        return response

    def submit_proposal(self, anomaly_id, analysis, patch):
        try:
            res = requests.post(f"{self.api_url}/anomalies/proposal", json={
                'id': anomaly_id,
                'analysis': json.dumps(analysis),
                'patch': patch,
                'status': 'PROPOSAL_READY'
            })
            if res.ok:
                self.logger.info("Proposal submitted successfully.")
            else:
                self.logger.error(f"Failed to submit proposal: {res.text}")
        except Exception as e:
            self.logger.error(f"Failed to submit proposal: {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        ProposeFixAgent().run(sys.argv[1])
    else:
        print("Error: Anomaly ID required")
