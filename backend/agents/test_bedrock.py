
import sys
import os

# Add backend/agents to path
sys.path.append(os.path.join(os.getcwd(), 'backend', 'agents'))

from bedrock_agent import BedrockAgent

def test_bedrock():
    print("Testing Bedrock Agent...")
    try:
        agent = BedrockAgent()
        response = agent.invoke("Say 'Hello form AWS Bedrock' if you can hear me.")
        print(f"Response: {response}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_bedrock()
