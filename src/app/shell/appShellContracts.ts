import type { CodeCard, Persona, ProviderProfile, ThemeState } from '../../types/domain';
import type { PersonaUpdatePatch } from '../persona/personaUpdatePatch';
import type { ProviderBatchConnectionTestState } from './providerBatchConnectionTest';

export type MenuOverlayPage = 'root' | 'backup' | 'gateway' | 'memory' | 'generation' | 'voice' | 'toolbox' | 'mcp' | 'desktopLocal' | 'automation' | 'usage' | 'display' | 'fonts' | 'storage' | 'docs' | 'privacy';

export type CollaboratorIntroCardSeed = Pick<
  CodeCard,
  'title' | 'cardNote' | 'language' | 'code' | 'cardFaceCss' | 'tags' | 'source'
>;

export type MenuOverlayProps = {
  open: boolean;
  initialPage?: MenuOverlayPage;
  theme: ThemeState;
  onClose: () => void;
  onOpenApi: (returnPage: MenuOverlayPage) => void;
};

export type ApiOverlayProps = {
  open: boolean;
  providers: ProviderProfile[];
  activeProviderId: string | null;
  api: ProviderProfile;
  apiTesting: boolean;
  apiTestResult: null | { ok: boolean; message: string };
  apiBatchTestState: ProviderBatchConnectionTestState;
  onBackToMenu: () => void;
  onClose: () => void;
  onSetActiveProvider: (providerId: string) => void;
  onCreateProvider: (namePrefix?: string) => void;
  onImportProvider: (provider: Partial<ProviderProfile>) => void;
  onDuplicateProvider: (duplicateName?: string) => void;
  onDeleteProvider: () => void;
  onSetApiConfig: (patch: Partial<ProviderProfile>) => void;
  onRunApiTest: () => Promise<void>;
  onRunProviderBatchTest: () => Promise<void>;
};

export type CollaboratorBuilderOverlayProps = {
  open: boolean;
  targetCollaborator: Persona | null;
  onClose: () => void;
  onApplyToCurrent: (patch: PersonaUpdatePatch) => void;
  onCreateCollaborator: (patch: PersonaUpdatePatch, introCard: CollaboratorIntroCardSeed) => void;
};

export type CompanionSetupOverlayProps = {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
};

export type AppShellOverlaysProps = {
  menu: MenuOverlayProps;
  api: ApiOverlayProps;
  collaboratorBuilder: CollaboratorBuilderOverlayProps;
  companionSetup: CompanionSetupOverlayProps;
};
