import { Controller, Get, Req, UseGuards, Query, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SidecarService } from '../services/sidecar.service';

@Controller('api/sidecar')
export class SidecarScriptController {
    constructor(private sidecarService: SidecarService) { }

    @UseGuards(AuthGuard('jwt'))
    @Get('install')
    async getInstallScript(@Req() req: any, @Query('repoId') repoId?: string) {
        const userId = req.user.userId;
        const backendUrl = process.env.PUBLIC_BACKEND_URL || 'http://localhost:3001'; // Port 3001 for backend

        // Create a real sidecar record for this installation
        const sidecar = await this.sidecarService.createSidecar(userId, {
            name: `Sidecar for ${repoId ? 'Repo ' + repoId.substring(0, 8) : 'Manual Install'}`,
            repoId: repoId,
            serviceId: 'default-service',
            logPath: './app.log' // Default prediction
        });

        // Generate the script using the REAL credentials
        const script = `#!/bin/bash
echo "🚀 Installing Night Agent Sidecar..."

# Configuration
SIDECAR_ID="${sidecar.id}"
API_KEY="${sidecar.apiKey}"
BACKEND_URL="${backendUrl}/api/sidecar"

echo "   ID: $SIDECAR_ID"
echo "   Target: $BACKEND_URL"

# Create Config Directory
mkdir -p ~/.night-agent
CONFIG_FILE=~/.night-agent/config.env

# Write Credentials
echo "SIDECAR_ID=$SIDECAR_ID" > $CONFIG_FILE
echo "SIDECAR_API_KEY=$API_KEY" >> $CONFIG_FILE
echo "BACKEND_URL=$BACKEND_URL" >> $CONFIG_FILE
echo "SERVICE_ID=default-service" >> $CONFIG_FILE
echo "LOG_PATH=$(pwd)/app.log" >> $CONFIG_FILE

echo "✅ Configuration saved to $CONFIG_FILE"

# Download Python Script (Mocking binary for now, using the python source logic if available or just a placeholder runner)
# For this demo, we assume the user might run the python script directly or we provide a wrapper.

echo "
import os
import sys
import time
import requests
import json

# Minimal Python Runner embedded in bash script for portability
def run():
    print('Night Agent Sidecar Running...')
    # Real logic would import the package. 
    # This is just to prove the 'setup' works.
    print(f'Authenticated as {SIDECAR_ID}')
    
    # Send Heartbeat
    try:
        headers = {'x-sidecar-api-key': '${sidecar.apiKey}', 'Content-Type': 'application/json'}
        url = '${backendUrl}/api/sidecar/heartbeat'
        data = {'sidecarId': '${sidecar.id}'}
        print(f'Sending Heartbeat to {url}...')
        res = requests.post(url, json=data, headers=headers)
        print(f'Heartbeat Status: {res.status_code}')
    except Exception as e:
        print(f'Failed to connect: {e}')

if __name__ == '__main__':
    run()
" > ~/.night-agent/runner.py

echo "✅ Runner installed to ~/.night-agent/runner.py"
echo "👉 to run: python3 ~/.night-agent/runner.py"
`;

        // Return the command to curl and run this script
        // We return a command that executes the script content directly? 
        // Or we serve the script content at a URL. 
        // Current frontend expects 'command' to be the curl pipe.
        // We can't easily pipe dynamic content without a persisting endpoint.
        // So we'll return the SCRIPT content? No, frontend needs a one-liner.

        // Better: The endpoint /api/sidecar/script/:sidecarId could serve the bash file. 
        // For now, let's keep it simple and return a command that creates a local setup script.

        return {
            // We just return the configuration for the user to verify visually? 
            // Or we return a "curl ... | bash" where the endpoint generates the script.
            // Let's assume this endpoint IS the script generator if accessed via curl?
            // But it's behind AuthGuard.

            // To make it easy: We return a command that sets env vars and runs a python one-liner or similar.
            command: `export SIDECAR_API_KEY="${sidecar.apiKey}" && export SIDECAR_ID="${sidecar.id}" && ./scripts/run-sidecar.sh`
        };
    }
}
