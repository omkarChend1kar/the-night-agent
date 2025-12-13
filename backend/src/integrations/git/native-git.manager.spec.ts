import { Test, TestingModule } from '@nestjs/testing';
import { NativeGitManager } from './native-git.manager';
import simpleGit from 'simple-git';
import * as fs from 'fs';

jest.mock('simple-git');
jest.mock('fs');

describe('NativeGitManager', () => {
    let service: NativeGitManager;
    let mockSimpleGit: any;

    beforeEach(async () => {
        mockSimpleGit = {
            clone: jest.fn(),
            checkoutLocalBranch: jest.fn(),
            checkout: jest.fn(),
            merge: jest.fn(),
            push: jest.fn(),
            add: jest.fn(),
            commit: jest.fn(),
            listRemote: jest.fn(),
            init: jest.fn(),
            addConfig: jest.fn(),
            addRemote: jest.fn(),
        };

        (simpleGit as unknown as jest.Mock).mockReturnValue(mockSimpleGit);
        // Mock mkdtempSync to return a fake path
        (fs.mkdtempSync as jest.Mock).mockReturnValue('/tmp/fake-temp');
        (fs.rmSync as jest.Mock).mockImplementation(() => { });
        (fs.writeFileSync as jest.Mock).mockImplementation(() => { });

        const module: TestingModule = await Test.createTestingModule({
            providers: [NativeGitManager],
        }).compile();

        service = module.get<NativeGitManager>(NativeGitManager);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('checkConnection', () => {
        it('should return true if listRemote succeeds', async () => {
            mockSimpleGit.listRemote.mockResolvedValue('HEAD');
            const result = await service.checkConnection('git@github.com:foo/bar.git');
            expect(result).toBe(true);
            expect(mockSimpleGit.listRemote).toHaveBeenCalledWith(['git@github.com:foo/bar.git', 'HEAD']);
        });

        it('should return false if listRemote fails', async () => {
            mockSimpleGit.listRemote.mockRejectedValue(new Error('Auth failed'));
            const result = await service.checkConnection('git@github.com:foo/bar.git');
            expect(result).toBe(false);
        });
    });

    describe('checkWriteAccess', () => {
        it('should return true if dry-run push succeeds', async () => {
            mockSimpleGit.push.mockResolvedValue('Everything up-to-date');
            const result = await service.checkWriteAccess('git@github.com:foo/bar.git');
            expect(result).toBe(true);
            expect(mockSimpleGit.push).toHaveBeenCalledWith(['--dry-run', 'origin', 'HEAD:refs/heads/night-agent-write-check-temp']);
        });

        it('should return false if dry-run push fails', async () => {
            mockSimpleGit.push.mockRejectedValue(new Error('Permission denied'));
            const result = await service.checkWriteAccess('git@github.com:foo/bar.git');
            expect(result).toBe(false);
        });
    });
});
