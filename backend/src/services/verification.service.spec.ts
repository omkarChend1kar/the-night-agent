import { Test, TestingModule } from '@nestjs/testing';
import { VerificationService } from './verification.service';
import { PrismaService } from '../prisma.service';

describe('VerificationService', () => {
    let service: VerificationService;
    let mockGitManager: any;
    let mockPrisma: any;

    beforeEach(async () => {
        mockGitManager = {
            checkConnection: jest.fn(),
            checkReadAccess: jest.fn(),
            checkWriteAccess: jest.fn(),
        };

        mockPrisma = {
            repository: {
                findUnique: jest.fn(),
            }
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VerificationService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: 'GitManager', useValue: mockGitManager },
            ],
        }).compile();

        service = module.get<VerificationService>(VerificationService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('verifyRepo', () => {
        const repoId = 'repo-123';
        const repoData = {
            id: repoId,
            url: 'https://github.com/owner/repo.git',
            sshConfigAlias: 'my-alias'
        };

        it('should fail if repo not found', async () => {
            mockPrisma.repository.findUnique.mockResolvedValue(null);
            await expect(service.verifyRepo(repoId)).rejects.toThrow('Repo not configured for SSH');
        });

        it('should verify handshake, read, and write checks', async () => {
            mockPrisma.repository.findUnique.mockResolvedValue(repoData);
            mockGitManager.checkConnection.mockResolvedValue(true);
            mockGitManager.checkReadAccess.mockResolvedValue(true);
            mockGitManager.checkWriteAccess.mockResolvedValue(true);

            const result = await service.verifyRepo(repoId);

            expect(result.success).toBe(true);
            expect(result.checks.handshake).toBe(true);
            expect(result.checks.read).toBe(true);
            expect(result.checks.write).toBe(true);
            expect(mockGitManager.checkConnection).toHaveBeenCalled();
            expect(mockGitManager.checkWriteAccess).toHaveBeenCalled();
        });

        it('should handle write failure but return success (since read is enough for now)', async () => {
            mockPrisma.repository.findUnique.mockResolvedValue(repoData);
            mockGitManager.checkConnection.mockResolvedValue(true);
            mockGitManager.checkReadAccess.mockResolvedValue(true);
            mockGitManager.checkWriteAccess.mockResolvedValue(false);

            const result = await service.verifyRepo(repoId);

            expect(result.success).toBe(true); // Based on code logic
            expect(result.checks.write).toBe(false);
        });
    });
});
