
import subprocess
import sys
import logging
import os
from bedrock_agent import BedrockAgent

class ApplyFixAgent(BedrockAgent):
    def __init__(self):
        super().__init__()
        self.logger = logging.getLogger("ApplyFixAgent")
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")

    def run(self, fix_proposal_id, repo_path, branch_name):
        self.logger.info(f"Applying fix {fix_proposal_id} to {repo_path} on branch {branch_name}")
        
        # We assume the patch file is already generated as 'fix_{fix_proposal_id}.patch' or passed in content.
        # However, for this MVP, the 'patch' is stored in the DB/Anomaly Service.
        # But this agent is called by Kestra which might just pass the inputs.
        
        # SIMPLE MVP STRATEGY:
        # 1. Fetch the patch from the backend (or assume it's passed - but typically agent fetches).
        # OR better: The agent should just run 'git apply' if it has the patch content.
        
        # Let's assume for this specific test flow, we will use 'git apply' on a file named 'generated_fix.patch'
        # that ideally should be present or we fetch it.
        
        # Real implementation: Fetch patch from Backend API
        res = requests.get(f"{self.api_url}/fix/{fix_proposal_id}")
        if not res.ok:
            self.logger.error("Failed to fetch fix details")
            return

        fix_data = res.json()
        patch_content = fix_data.get('diff')

        if not patch_content:
            self.logger.error("No patch content found")
            return
            
        # Write patch to temp file
        patch_file = os.path.join(repo_path, "temp_apply.patch")
        with open(patch_file, "w") as f:
            f.write(patch_content)
            
        try:
            # 1. Create Branch
            subprocess.run(["git", "checkout", "-b", branch_name], cwd=repo_path, check=False) # might fail if exists
            subprocess.run(["git", "checkout", branch_name], cwd=repo_path, check=True)
            
            # 2. Apply Patch
            # git apply --check first? or just apply
            self.logger.info("Applying patch...")
            subprocess.run(["git", "apply", "temp_apply.patch"], cwd=repo_path, check=True)
            
            # 3. Commit
            subprocess.run(["git", "add", "."], cwd=repo_path, check=True)
            subprocess.run(["git", "commit", "-m", f"fix: applied automated proposal {fix_proposal_id}"], cwd=repo_path, check=True)
            
            self.logger.info("Fix applied and committed successfully.")
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Git operation failed: {e}")
        finally:
             if os.path.exists(patch_file):
                os.remove(patch_file)

if __name__ == "__main__":
    import requests
    import os
    if len(sys.argv) < 3:
        print("Usage: python apply_fix_agent.py <fix_id> <repo_path> <branch>")
        sys.exit(1)
    ApplyFixAgent().run(sys.argv[1], sys.argv[2], sys.argv[3])
