import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SidecarController } from './api/sidecar.controller';
import { SidecarManagementController } from './api/sidecar-management.controller';
import { FrontendController } from './api/frontend.controller';
import { AnomalyService } from './services/anomaly.service';
import { EncryptionService } from './services/encryption.service';
import { SidecarService } from './services/sidecar.service';
import { MockWorkflowEngine } from './integrations/workflow/mock-workflow.engine';
import { KestraWorkflowEngine } from './integrations/workflow/kestra-workflow.engine';
import { LocalWorkflowEngine } from './integrations/workflow/local-workflow.engine';
import { MockCodeExecutor } from './integrations/code-executor/mock-code.executor';

import { NativeGitManager } from './integrations/git/native-git.manager';
import { SidecarScriptController } from './api/sidecar-script.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma.service';
import { SshConfigService } from './services/ssh-config.service';
import { VerificationService } from './services/verification.service';

import { InternalController } from './api/internal.controller';

@Module({
  imports: [AuthModule],
  controllers: [AppController, SidecarController, SidecarManagementController, FrontendController, SidecarScriptController, InternalController],
  providers: [
    PrismaService,
    AppService,
    AnomalyService,
    EncryptionService,
    SidecarService,
    SshConfigService,
    VerificationService,
    {
      provide: 'WorkflowEngine',
      useFactory: () => {
        const useKestra = process.env.USE_KESTRA === 'true';
        console.log('Using Workflow Engine:', useKestra ? 'Kestra' : 'Local (Agents)');
        return useKestra ? new KestraWorkflowEngine() : new LocalWorkflowEngine();
      }
    },
    {
      provide: 'CodeExecutor',
      useClass: MockCodeExecutor
    },
    { provide: 'GitManager', useClass: NativeGitManager },
  ],
  exports: [PrismaService],
})
export class AppModule { }
