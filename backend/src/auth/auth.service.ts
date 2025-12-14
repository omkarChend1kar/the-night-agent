import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as otplib from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma.service';

import { GitIdentityService } from '../services/git-identity.service';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private prisma: PrismaService,
        private gitIdentity: GitIdentityService
    ) { }

    async signup(email: string, password: string, name?: string) {
        const hashedPassword = await bcrypt.hash(password, 10);
        try {
            const user = await this.prisma.user.create({
                data: {
                    email,
                    name,
                    password: hashedPassword,
                    isMfaEnabled: false,
                },
            });

            // Generate SSH Identity
            try {
                const { publicKey } = await this.gitIdentity.ensureIdentity(user.id, user.email);

                // Save public key to DB
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: { publicKey }
                });

                return { id: user.id, email: user.email, name: user.name, publicKey };

            } catch (err) {
                console.error(`Failed to generate SSH identity for ${user.id}:`, err);
                // We don't rollback user creation, but log error. User can retry key gen later if we add an endpoint.
                // Or maybe throw? For now, proceed but warn.
                return { id: user.id, email: user.email, name: user.name, warning: "SSH Key generation failed" };
            }

        } catch (e) {
            throw new Error(e.message || 'User already exists');
        }
    }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (user && await bcrypt.compare(pass, user.password)) {
            const { password, mfaSecret, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        // Check if MFA is enabled
        // Note: In a real flow, if MFA is enabled, we'd issue a temp token and ask for 2FA.
        // For MVP, we pass 'isMfaEnabled' to frontend to trigger 2nd screen or handle it.
        // Currently, our Login page handles the redirection if user.isMfaEnabled is true?
        // Let's ensure the payload has what we need.
        const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });

        // If MFA is mandated but not verified in this request, we might handle it differently.
        // But our current flow is: Login -> constant JWT -> Redirect to MFA page if needed.

        const payload = {
            username: user.email,
            sub: user.id,
            isMfaEnabled: dbUser?.isMfaEnabled
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: { ...user, isMfaEnabled: dbUser?.isMfaEnabled }
        };
    }

    async generateMfaSecret(userEmail: string) {
        const user = await this.prisma.user.findUnique({ where: { email: userEmail } });
        if (!user) throw new UnauthorizedException();

        const secret = otplib.authenticator.generateSecret();

        // Save secret to DB (pending verification)
        await this.prisma.user.update({
            where: { email: userEmail },
            data: { mfaSecret: secret }
        });

        const otpauthUrl = otplib.authenticator.keyuri(userEmail, 'NightAgent', secret);
        const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

        return { secret, qrCodeUrl };
    }

    async verifyMfa(userEmail: string, token: string) {
        const user = await this.prisma.user.findUnique({ where: { email: userEmail } });
        if (!user || !user.mfaSecret) throw new UnauthorizedException('MFA setup not found');

        const isValid = otplib.authenticator.check(token, user.mfaSecret);
        if (isValid) {
            await this.prisma.user.update({
                where: { email: userEmail },
                data: { isMfaEnabled: true }
            });
            return { success: true };
        }
        throw new UnauthorizedException('Invalid MFA token');
    }
}
