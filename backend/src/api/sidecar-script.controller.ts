import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // Ensure this uses 'jwt' strategy from AuthModule

@Controller('api/sidecar')
export class SidecarScriptController {

    @UseGuards(AuthGuard('jwt'))
    @Get('install')
    getInstallScript(@Req() req: any) {
        const userId = req.user.userId; // user.id from JwtStrategy
        const backendUrl = 'http://localhost:3000'; // Should be env var
        // In real app, we might generate a specific Sidecar Token for this user/repo
        const sidecarToken = `sid-${userId}-${Date.now()}`;

        const script = `
#!/bin/bash
echo "Installing Night Agent Sidecar..."
# Verify OS (Mac/Linux)
OS="$(uname -s)"
if [ "$OS" == "Darwin" ]; then
    BINARY_URL="${backendUrl}/downloads/sidecar-mac"
else
    BINARY_URL="${backendUrl}/downloads/sidecar-linux"
fi

# Download (Mocking the download for now as we don't have hosted binaries yet)
echo "Downloading from $BINARY_URL..."
# curl -L $BINARY_URL -o night-sidecar
# chmod +x night-sidecar

echo "Configuring..."
mkdir -p ~/.night-agent
echo "BACKEND_URL=${backendUrl}" > ~/.night-agent/config.env
echo "SIDECAR_TOKEN=${sidecarToken}" >> ~/.night-agent/config.env

echo "Installation Complete! Run with: ./night-sidecar"
`;
        return { script, command: `curl -sL ${backendUrl}/api/sidecar/install | bash` };
    }
}
