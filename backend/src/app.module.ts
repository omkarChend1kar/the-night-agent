import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SidecarController } from './api/sidecar.controller';
import { FrontendController } from './api/frontend.controller';
import { AnomalyService } from './services/anomaly.service';
import { EncryptionService } from './services/encryption.service';
import { MockWorkflowEngine } from './integrations/workflow/mock-workflow.engine';
import { KestraWorkflowEngine } from './integrations/workflow/kestra-workflow.engine';
import { MockCodeExecutor } from './integrations/code-executor/mock-code.executor';
import { ClineCodeExecutor } from './integrations/code-executor/cline-code.executor';
import { NativeGitManager } from './integrations/git/native-git.manager';
import { SidecarScriptController } from './api/sidecar-script.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma.service';
import { SshConfigService } from './services/ssh-config.service';
import { VerificationService } from './services/verification.service';

import { InternalController } from './api/internal.controller';

@Module({
  imports: [AuthModule],
  controllers: [AppController, SidecarController, FrontendController, SidecarScriptController, InternalController],
  providers: [
    PrismaService,
    AppService,
    AnomalyService,
    EncryptionService,
    SshConfigService,
    VerificationService,
    {
      provide: 'WorkflowEngine',
      useFactory: () => {
        const useKestra = process.env.USE_KESTRA === 'true';
        console.log('Using Workflow Engine:', useKestra ? 'Kestra' : 'Mock');
        return useKestra ? new KestraWorkflowEngine() : new MockWorkflowEngine();
      }
    },
    {
      provide: 'CodeExecutor',
      useFactory: () => {
        const useCline = process.env.USE_CLINE === 'true';
        console.log('Using Code Executor:', useCline ? 'Cline (CLI)' : 'Mock');
        return useCline ? new ClineCodeExecutor() : new MockCodeExecutor();
      }
    },
    { provide: 'GitManager', useClass: NativeGitManager },
  ],
  exports: [PrismaService], // Export so AuthModule can use it if needed
})
export class AppModule { }
