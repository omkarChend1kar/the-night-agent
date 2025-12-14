import subprocess
import sys
import os
import re
import logging
import requests
from bedrock_agent import BedrockAgent


class ApplyFixAgent(BedrockAgent):
    def __init__(self):
        super().__init__()
        self.logger = logging.getLogger("ApplyFixAgent")
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api")

    def run(self, fix_proposal_id, repo_path, branch_name):
        self.logger.info(
            f"Applying fix {fix_proposal_id} to {repo_path} on branch {branch_name}"
        )

        # 1. Fetch Patch
        try:
            res = requests.get(f"{self.api_url}/fix/{fix_proposal_id}")
            res.raise_for_status()
            fix_data = res.json()
            patch_content = fix_data.get("diff")
            if not patch_content:
                self.logger.error("No patch content found")
                return
        except Exception as e:
            self.logger.error(f"Failed to fetch fix details: {e}")
            return

        patch_file = os.path.join(repo_path, "temp_apply.patch")
        with open(patch_file, "w") as f:
            f.write(patch_content)

        try:
            # 2. Checkout Base Branch (main or master) and Pull
            base_branch = "main"
            # Check if master exists and main doesn't, or just try checkout
            # Simple heuristic: try main, if fails try master
            try:
                subprocess.run(
                    ["git", "checkout", "main"],
                    cwd=repo_path,
                    check=True,
                    capture_output=True,
                )
            except subprocess.CalledProcessError:
                self.logger.info("Checkout main failed, trying master...")
                base_branch = "master"
                subprocess.run(["git", "checkout", "master"], cwd=repo_path, check=True)

            self.logger.info(f"Pulling latest {base_branch}...")
            subprocess.run(
                ["git", "pull", "origin", base_branch], cwd=repo_path, check=True
            )

            # 3. Create Sandbox Branch
            self.logger.info(f"Creating sandbox branch {branch_name}...")
            subprocess.run(
                ["git", "checkout", "-b", branch_name], cwd=repo_path, check=False
            )  # check=False in case it exists
            subprocess.run(
                ["git", "checkout", branch_name], cwd=repo_path, check=True
            )  # Ensure on branch

            # 4. Try Native Git Apply
            self.logger.info("Attempting native git apply...")
            subprocess.run(
                ["git", "apply", "temp_apply.patch"],
                cwd=repo_path,
                check=True,
                capture_output=True,
            )
            self.logger.info("Native git apply succeeded.")

        except subprocess.CalledProcessError as e:
            self.logger.warning(
                f"Native git apply failed: {e.stderr.decode() if e.stderr else str(e)}"
            )
            self.logger.info("Attempting Bedrock Conflict Resolution...")
            self.resolve_conflict_and_apply(repo_path, patch_content)

        finally:
            if os.path.exists(patch_file):
                os.remove(patch_file)

        # 4. Commit and Push (If changes exist)
        try:
            status = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=repo_path,
                capture_output=True,
                text=True,
            )
            if status.stdout.strip():
                subprocess.run(["git", "add", "."], cwd=repo_path, check=True)
                subprocess.run(
                    [
                        "git",
                        "commit",
                        "-m",
                        f"fix: applied automated proposal {fix_proposal_id}",
                    ],
                    cwd=repo_path,
                    check=True,
                )
                self.logger.info("Fix committed successfully.")
                # subprocess.run(["git", "push", "origin", branch_name], cwd=repo_path, check=True) # Optional push
            else:
                self.logger.info("No changes to commit (Clean working tree).")
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Commit/Push failed: {e}")

    def resolve_conflict_and_apply(self, repo_path, patch_content):
        # 1. Parse filename from patch
        # Simple parser for '--- a/path\n+++ b/path'
        match = re.search(r"^\+\+\+ b/(.+)$", patch_content, re.MULTILINE)
        if not match:
            self.logger.error("Could not parse filename from patch.")
            return

        target_file_rel = match.group(1).strip()
        target_file_abs = os.path.join(repo_path, target_file_rel)

        if not os.path.exists(target_file_abs):
            self.logger.error(f"Target file {target_file_abs} does not exist.")
            return

        with open(target_file_abs, "r") as f:
            file_content = f.read()

        # 2. Ask Bedrock
        prompt = f"""
You are an expert Git Merge Resolver.
I have a file and a patch that failed to apply due to conflicts (or context mismatch).
Please apply the changes in the submitted patch to the file content intelligently.
Output ONLY the full new content of the file. Do not wrap in markdown blocks if possible, or use ```code``` blocks.

FILE PATH: {target_file_rel}

FILE CONTENT:
{file_content}

PATCH:
{patch_content}
        """

        self.logger.info(f"Asking Bedrock to merge patch for {target_file_rel}...")
        new_content = self.invoke(
            prompt,
            system_prompt="You are a code merging engine. Output only the merged code.",
        )

        if new_content:
            # Strip loose markdown code blocks if Bedrock adds them
            clean_content = new_content.strip()
            if clean_content.startswith("```"):
                clean_content = clean_content.split("\n", 1)[1]
            if clean_content.endswith("```"):
                clean_content = clean_content.rsplit("\n", 1)[0]

            # Write Back
            with open(target_file_abs, "w") as f:
                f.write(clean_content)
            self.logger.info(
                f"Bedrock applied patch to {target_file_rel} successfully."
            )
        else:
            self.logger.error("Bedrock returned no content.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python apply_fix_agent.py <fix_id> <repo_path> <branch>")
        sys.exit(1)
    ApplyFixAgent().run(sys.argv[1], sys.argv[2], sys.argv[3])
