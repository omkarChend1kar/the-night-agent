import { Controller, Post, UseGuards, Request, Body, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('signup')
    async signup(@Body() body: any) {
        return this.authService.signup(body.email, body.password, body.name);
    }

    @Post('login')
    async login(@Body() body: any) {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) {
            return { error: 'Invalid credentials' };
        }
        return this.authService.login(user);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('profile')
    getProfile(@Request() req: any) {
        return req.user;
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('mfa/setup')
    async setupMfa(@Request() req: any) {
        return this.authService.generateMfaSecret(req.user.email);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('mfa/verify')
    async verifyMfa(@Request() req: any, @Body() body: any) {
        return this.authService.verifyMfa(req.user.email, body.token);
    }
}
