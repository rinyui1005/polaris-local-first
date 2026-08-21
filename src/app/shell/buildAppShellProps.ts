import type { ActiveThemePreview } from '../../stores/spaceStore';
import type { CollectionShelf, ThemeState, World } from '../../types/domain';
import type { AppShellOverlaysProps, MenuOverlayPage } from './appShellContracts';

type BuildAppShellOverlaysPropsArgs = {
  menuOpen: boolean;
  menuInitialPage: AppShellOverlaysProps['menu']['initialPage'];
  theme: ThemeState;
  providers: AppShellOverlaysProps['api']['providers'];
  activeProviderId: string | null;
  api: AppShellOverlaysProps['api']['api'];
  apiTesting: boolean;
  apiTestResult: AppShellOverlaysProps['api']['apiTestResult'];
  apiBatchTestState: AppShellOverlaysProps['api']['apiBatchTestState'];
  apiOpen: boolean;
  collaboratorBuilderOpen: boolean;
  companionSetupOpen: boolean;
  closeMenu: () => void;
  openApiFromMenu: (returnPage: MenuOverlayPage) => void;
  closeApi: () => void;
  backToMenuFromApi: () => void;
  providerActions: AppShellOverlaysProps['api']['onSetActiveProvider'] extends (...args: any[]) => any
    ? Pick<
        AppShellOverlaysProps['api'],
        'onSetActiveProvider' | 'onCreateProvider' | 'onImportProvider' | 'onDuplicateProvider' | 'onDeleteProvider' | 'onSetApiConfig'
      >
    : never;
  runApiTest: AppShellOverlaysProps['api']['onRunApiTest'];
  runProviderBatchTest: AppShellOverlaysProps['api']['onRunProviderBatchTest'];
  collaboratorBuilderBridge: AppShellOverlaysProps['collaboratorBuilder'];
  companionSetupBridge: AppShellOverlaysProps['companionSetup'];
};

export function buildAppShellOverlaysProps({
  menuOpen,
  menuInitialPage,
  theme,
  providers,
  activeProviderId,
  api,
  apiTesting,
  apiTestResult,
  apiBatchTestState,
  apiOpen,
  collaboratorBuilderOpen,
  companionSetupOpen,
  closeMenu,
  openApiFromMenu,
  closeApi,
  backToMenuFromApi,
  providerActions,
  runApiTest,
  runProviderBatchTest,
  collaboratorBuilderBridge,
  companionSetupBridge
}: BuildAppShellOverlaysPropsArgs): AppShellOverlaysProps {
  return {
    menu: {
      open: menuOpen,
      initialPage: menuInitialPage,
      theme,
      onClose: closeMenu,
      onOpenApi: openApiFromMenu
    },
    api: {
      open: apiOpen,
      providers,
      activeProviderId,
      api,
      apiTesting,
      apiTestResult,
      apiBatchTestState,
      onBackToMenu: backToMenuFromApi,
      onClose: closeApi,
      onSetActiveProvider: providerActions.onSetActiveProvider,
      onCreateProvider: providerActions.onCreateProvider,
      onImportProvider: providerActions.onImportProvider,
      onDuplicateProvider: providerActions.onDuplicateProvider,
      onDeleteProvider: providerActions.onDeleteProvider,
      onSetApiConfig: providerActions.onSetApiConfig,
      onRunApiTest: runApiTest,
      onRunProviderBatchTest: runProviderBatchTest
    },
    collaboratorBuilder: {
      open: collaboratorBuilderOpen,
      targetCollaborator: collaboratorBuilderBridge.targetCollaborator,
      onClose: collaboratorBuilderBridge.onClose,
      onApplyToCurrent: collaboratorBuilderBridge.onApplyToCurrent,
      onCreateCollaborator: collaboratorBuilderBridge.onCreateCollaborator
    },
    companionSetup: {
      open: companionSetupOpen,
      onClose: companionSetupBridge.onClose,
      onOpen: companionSetupBridge.onOpen
    }
  };
}

type BuildTopbarPropsArgs = {
  activeWorld: World;
  title: string;
  titleTone: 'brand' | 'collaborator';
  isAggregateCollectionScope: boolean;
  worldLabel: string;
  worldDetail: string | null;
  showWorldLabel: boolean;
  showTopbarShell: boolean;
  showTopbarTitle: boolean;
  collaboratorSwitchOpen: boolean;
  collectionShelf: CollectionShelf;
  searchOpen: boolean;
  collectionInfoFullscreenOpen: boolean;
  menuOpen: boolean;
  activeThemePreview: ActiveThemePreview;
  toggleWorld: () => void;
  createConversation: () => void;
  toggleMenu: () => void;
  openSettings: () => void;
  openPreviewChat: () => void;
  setSearchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setCollaboratorSwitchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setCollectionInfoFullscreenOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
};

export function buildTopbarProps({
  activeWorld,
  title,
  titleTone,
  isAggregateCollectionScope,
  worldLabel,
  worldDetail,
  showWorldLabel,
  showTopbarShell,
  showTopbarTitle,
  collaboratorSwitchOpen,
  collectionShelf,
  searchOpen,
  collectionInfoFullscreenOpen,
  menuOpen,
  activeThemePreview,
  toggleWorld,
  createConversation,
  toggleMenu,
  openSettings,
  openPreviewChat,
  setSearchOpen,
  setCollaboratorSwitchOpen,
  setCollectionInfoFullscreenOpen
}: BuildTopbarPropsArgs) {
  return {
    state: {
      activeWorld,
      title,
      titleTone,
      isAggregateCollectionScope,
      worldLabel,
      worldDetail,
      showWorldLabel,
      showShell: showTopbarShell,
      showTitle: showTopbarTitle,
      collaboratorSwitchOpen,
      collectionShelf,
      searchOpen,
      collectionInfoFullscreenOpen,
      menuOpen,
      activeThemePreview
    },
    actions: {
      onToggleWorld: toggleWorld,
      onToggleCollaboratorSwitch: () => {
        setSearchOpen(false);
        setCollaboratorSwitchOpen((prev) => !prev);
      },
      onCreateConversation: createConversation,
      onToggleSearch: () => {
        setCollaboratorSwitchOpen(false);
        setSearchOpen((prev) => !prev);
      },
      onOpenCollectionInfoFullscreen: () => {
        setCollaboratorSwitchOpen(false);
        setSearchOpen(false);
        setCollectionInfoFullscreenOpen((current) => !current);
      },
      onToggleMenu: toggleMenu,
      onOpenSettings: openSettings,
      onOpenPreviewChat: openPreviewChat
    }
  };
}

type BuildChatWorldPropsArgs = {
  activeWorld: World;
  isWorldSwitching: boolean;
  openToolbox: () => void;
  openProviderSettings: () => void;
};

export function buildChatWorldProps<TUi>({
  activeWorld,
  isWorldSwitching,
  openToolbox,
  openProviderSettings,
  ui
}: BuildChatWorldPropsArgs & { ui: TUi }) {
  return {
    shell: {
      isActiveWorld: activeWorld === 'chat',
      isWorldSwitching,
      openToolbox,
      openProviderSettings
    },
    ui
  };
}
