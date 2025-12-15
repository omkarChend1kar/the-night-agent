
import boto3
import json
import os
import logging
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

class BedrockAgent:
    """
    Base agent class that provides:
    - AWS Bedrock LLM invocation with retry logic
    - HTTP API calls with retry logic
    - Credential management
    """
    
    MODEL_MAPPING = {
        "qwen_next_80b_instruct": "qwen.qwen3-next-80b-a3b",
        "qwen_vl_235b": "qwen.qwen3-vl-235b-a22b",
        "openai_safeguard_20b": "openai.gpt-oss-safeguard-20b",
        "openai_safeguard_120b": "openai.gpt-oss-safeguard-120b",
        "gemma_3_4b_it": "google.gemma-3-4b-it",
        "gemma_3_12b_it": "google.gemma-3-12b-it",
        "gemma_3_27b_it": "google.gemma-3-27b-it",
        "minimax_m2": "minimax.minimax-m2",
        "kimi_k2_thinking": "moonshot.kimi-k2-thinking",
        "nemotron_nano_9b_v2": "nvidia.nemotron-nano-9b-v2",
        "nemotron_nano_12b_v2": "nvidia.nemotron-nano-12b-v2",
        "magistral_small_2509": "mistral.magistral-small-2509",
        "voxtral_mini_3b_2507": "mistral.voxtral-mini-3b-2507",
        "voxtral_small_24b_2507": "mistral.voxtral-small-24b-2507",
        "ministral_3b": "mistral.ministral-3-3b-instruct",
        "ministral_3_8b": "mistral.ministral-3-8b-instruct",
        "ministral_3_14b": "mistral.ministral-3-14b-instruct",
        "mistral_large_3": "mistral.mistral-large-3-675b-instruct",
    }

    def __init__(self, model_name="mistral_large_3"):
        # Resolve friendly name to ID, or use as is if not in mapping
        self.model_id = self.MODEL_MAPPING.get(model_name, model_name)
        self._setup_creds()
        self.client = boto3.client(
            service_name='bedrock-runtime',
            region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'),
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
        )
        self.logger = logging.getLogger(self.__class__.__name__)
        logging.basicConfig(level=logging.INFO)
        self.logger.info(f"Initialized BedrockAgent with model: {self.model_id}")

    def _setup_creds(self):
        """Load AWS credentials from file if env vars are missing."""
        if not os.environ.get('AWS_ACCESS_KEY_ID'):
            try:
                # Find creds relative to this file (backend/agents/bedrock_agent.py -> backend/awsp_creds.txt)
                current_dir = os.path.dirname(os.path.abspath(__file__))
                creds_path = os.path.join(current_dir, '..', 'awsp_creds.txt')
                
                with open(creds_path, 'r') as f:
                    for line in f:
                        if '=' in line and not line.startswith('#'):
                            k, v = line.strip().split('=', 1)
                            os.environ[k] = v
            except FileNotFoundError:
                pass  # Will fail later when trying to use client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(Exception),
        before_sleep=lambda retry_state: logging.getLogger("BedrockAgent").warning(
            f"Bedrock call failed, retrying in {retry_state.next_action.sleep}s... (attempt {retry_state.attempt_number})"
        )
    )
    def invoke(self, prompt, system_prompt="You are a helpful AI assistant."):
        """
        Invoke Bedrock LLM with retry logic.
        Retries up to 3 times with exponential backoff.
        """
        messages = [{
            "role": "user",
            "content": [{"text": prompt}]
        }]
        
        system = [{"text": system_prompt}]

        # Use the Converse API which abstracts model-specific payloads
        response = self.client.converse(
            modelId=self.model_id,
            messages=messages,
            system=system,
            inferenceConfig={
                "maxTokens": 2000,
                "temperature": 0.7
            }
        )
        return response['output']['message']['content'][0]['text']

    @staticmethod
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((requests.exceptions.RequestException, requests.exceptions.Timeout)),
        before_sleep=lambda retry_state: logging.getLogger("BedrockAgent").warning(
            f"HTTP request failed, retrying in {retry_state.next_action.sleep}s... (attempt {retry_state.attempt_number})"
        )
    )
    def fetch_with_retry(url: str, timeout: int = 10) -> requests.Response:
        """
        Make an HTTP GET request with retry logic.
        Retries up to 3 times with exponential backoff on network errors.
        """
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        return response

    @staticmethod
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((requests.exceptions.RequestException, requests.exceptions.Timeout)),
        before_sleep=lambda retry_state: logging.getLogger("BedrockAgent").warning(
            f"HTTP POST failed, retrying in {retry_state.next_action.sleep}s... (attempt {retry_state.attempt_number})"
        )
    )
    def post_with_retry(url: str, json_data: dict, timeout: int = 10) -> requests.Response:
        """
        Make an HTTP POST request with retry logic.
        Retries up to 3 times with exponential backoff on network errors.
        """
        response = requests.post(url, json=json_data, timeout=timeout)
        response.raise_for_status()
        return response
